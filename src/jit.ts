import type { Infer, KnownAlias, ParseResult, TypeRegistry, ValidateSchema } from "@/Types/Typer";
import type { Registry } from "@/Core/Registry";
import type { CompileContext, CompiledChecker } from "@/Core/Compile";
import type { Backend } from "@/Core/Backend";
import { BUILTIN_CONTEXT } from "@/Core/Registry";
import { getCompiledChecker } from "@/Core/Compile";
import { setBackend } from "@/Core/Backend";
import { jitChecker } from "@/Core/Jit";
import { TyperError } from "@/Errors/TyperError";
import { formatIssues } from "@/Utils/Issues";
import { failure } from "@/Core/Result";

/**
 * Schema validation through generated code.
 *
 * `parse` and `safeParse` from `/core` compile a schema into closures and look
 * the result up by object identity on every call. That is the right default:
 * it needs no build step, no `unsafe-eval`, and it is already fast. This entry
 * point trades those properties for speed, by generating a specialised
 * function per schema with `new Function`.
 *
 * It is a separate import for two reasons. Generated code is unavailable under
 * a Content-Security-Policy without `unsafe-eval`, and a library has no
 * business deciding that on a consumer's behalf; and compiling has a cost of
 * its own, which only pays off on a schema used many times.
 *
 * Measured against the nested schema in `benchmarks/`: 15.0 ns per validation
 * against 68.2 ns for the closure compiler.
 *
 * @example
 * import { compile } from '@illavv/run_typer/jit';
 *
 * const user = compile({ id: 'number', email: 'string', note: 'string?' });
 *
 * user.parse(payload);          // throws TyperError on failure
 * user.safeParse(payload);      // { success, data } | { success, issues }
 */

/** Options accepted when compiling a schema. */
export type JitOptions<R extends TypeRegistry> = {
    /** Custom aliases, from `createRegistry`. Built-ins need none. */
    registry?: Registry<R>;
    /** Reject keys the schema does not declare. Defaults to `true`, as elsewhere in 5.0. */
    strict?: boolean;
};

/** A schema compiled once, ready to validate many values. */
export type CompiledSchema<T> = {
    /**
     * Validates a value, returning it typed.
     *
     * @throws {TyperError} With one issue per problem found.
     */
    parse: (value: unknown) => T;
    /** Validates without throwing. */
    safeParse: (value: unknown) => ParseResult<T>;
    /**
     * Whether this schema is running generated code.
     *
     * `false` means `new Function` was refused — almost always a
     * Content-Security-Policy without `unsafe-eval` — and the closure compiler
     * is validating instead. Behaviour is identical either way; this exists so
     * a consumer who is paying for the compile step can tell whether they are
     * getting it.
     */
    readonly generated: boolean;
};

/**
 * Compiles a schema into a specialised validator.
 *
 * Compile once, outside the hot path, and keep the result — the whole point is
 * to move the work here. Unlike `parse`, this does no caching of its own:
 * calling it twice with the same schema generates twice.
 *
 * @template S - The schema
 * @template R - Custom aliases, inferred from `options.registry`
 * @param schema - The shape to validate against.
 * @param options - Registry and strictness.
 * @example
 * const order = compile({ qty: 'number(1,)', sku: 'string' });
 * const result = order.safeParse(payload);
 * if (!result.success) result.issues.forEach((i) => console.error(i.path, i.code));
 */
export const compile = <const S extends ValidateSchema<S, KnownAlias<R>>, R extends TypeRegistry = {}>(schema: S, options?: JitOptions<R>): CompiledSchema<Infer<S, R>> => {
    const context = options?.registry?.context ?? BUILTIN_CONTEXT;
    const strict = options?.strict !== false;
    const definition = schema as unknown as Record<string, unknown>;

    const generated = jitChecker(context, definition, strict);
    const check = generated ?? getCompiledChecker(context, definition, strict);

    return {
        parse: (value: unknown): Infer<S, R> => {
            const issues = check(value, '');
            if (issues.length > 0) throw new TyperError(formatIssues(issues), issues);
            return value as Infer<S, R>;
        },
        safeParse: (value: unknown): ParseResult<Infer<S, R>> => {
            const issues = check(value, '');
            return issues.length === 0
                ? { success: true, data: value as Infer<S, R> }
                : failure(issues);
        },
        generated: generated !== null,
    };
};

/**
 * Whether this environment allows code generation at all.
 *
 * Compiles a trivial schema and reports whether it was generated, so the
 * answer reflects the running policy rather than a guess from the user agent.
 */
export const canGenerate = (): boolean => jitChecker(BUILTIN_CONTEXT, {}, false) !== null;

/**
 * How many validations a schema must serve before it is worth generating code
 * for it.
 *
 * Generating costs 4.9 µs more than compiling to closures for a flat schema
 * and 14.1 µs more for a nested one, against a saving of 57 ns and 145 ns per
 * validation — so the generation pays for itself after roughly 85 to 100 uses.
 * Fifty puts the upgrade comfortably before that point without spending
 * microseconds on schemas that turn out to be lukewarm.
 */
const WARMUP_USES = 50;

/** What the warm-up back end remembers about one schema. */
type Warmth = {
    /** The context this entry was compiled against; checkers are not portable between them. */
    ctx: CompileContext;
    checker: CompiledChecker;
    uses: number;
    /** Generated, or generation refused — either way, stop reconsidering. */
    settled: boolean;
};

const warmLoose = new WeakMap<object, Warmth>();
const warmStrict = new WeakMap<object, Warmth>();

/**
 * A back end that starts on closures and rewrites a schema to generated code
 * once it has proved itself.
 *
 * Keying by schema object identity is what makes this safe against the
 * throwaway-schema antipattern: a literal written inside a request handler is a
 * new object every call, so it never reaches the threshold and never pays for
 * generation. A hoisted schema is one object and warms up.
 */
const warmingBackend = (threshold: number): Backend => (ctx: CompileContext, schema: Record<string, unknown>, strictMode: boolean): CompiledChecker => {
    const store = strictMode ? warmStrict : warmLoose;
    let entry = store.get(schema);

    // A schema object reused under a different registry resolves its aliases
    // differently, so the entry starts over rather than serving the wrong one.
    if (entry === undefined || entry.ctx !== ctx) {
        entry = { ctx, checker: getCompiledChecker(ctx, schema, strictMode), uses: 0, settled: false };
        store.set(schema, entry);
    }

    if (!entry.settled && ++entry.uses >= threshold) {
        entry.settled = true;
        const generated = jitChecker(ctx, schema, strictMode);
        if (generated !== null) entry.checker = generated;
    }

    return entry.checker;
};

/** The back end this module installed, so its disposer cannot undo someone else's. */
let installed: Backend | null = null;

/** Options for {@link installJit}. */
export type InstallOptions = {
    /**
     * Validations a schema must serve before it is generated. Defaults to 50.
     */
    threshold?: number;
    /** Generate on first sight instead of warming up. */
    eager?: boolean;
};

/**
 * Routes every schema in the process through the code generator.
 *
 * `parse`, `safeParse`, `parseAsync`, `objectOf`, `discriminatedUnion` and the
 * `Typer` class all reach a compiled checker through one slot, so this one call
 * covers them without changing an import anywhere.
 *
 * Schemas are not generated immediately. Each starts on the closure compiler
 * and is rewritten once it has served `threshold` validations, so a schema used
 * twice never pays the compile cost and one in a request handler upgrades
 * itself after the first handful of requests. Pass `{ eager: true }` to skip
 * the wait.
 *
 * **Applications may call this; libraries must not.** It decides for the
 * application that hosts them. A library wanting generated code should use
 * {@link compile} on its own schemas instead.
 *
 * Where `new Function` is refused — a Content-Security-Policy without
 * `unsafe-eval` — nothing happens beyond one failed attempt per schema, and
 * the closure compiler keeps serving.
 *
 * @param options - Threshold and eagerness.
 * @returns A disposer that restores the default back end.
 * @example
 * // main.ts, once, at startup
 * import { installJit } from '@illavv/run_typer/jit';
 * installJit();
 */
export const installJit = (options?: InstallOptions): (() => void) => {
    const threshold = options?.eager === true ? 1 : Math.max(1, options?.threshold ?? WARMUP_USES);
    const backend = warmingBackend(threshold);

    installed = backend;
    setBackend(backend);

    return () => {
        if (installed !== backend) return;
        installed = null;
        setBackend(null);
    };
};

export { TyperError };
export type { Infer, ParseResult, Registry };
