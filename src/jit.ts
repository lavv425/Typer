import type { Infer, KnownAlias, ParseResult, TypeRegistry, ValidateSchema } from "@/Types/Typer";
import type { Registry } from "@/Core/Registry";
import { BUILTIN_CONTEXT } from "@/Core/Registry";
import { getCompiledChecker } from "@/Core/Compile";
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

export { TyperError };
export type { Infer, ParseResult, Registry };
