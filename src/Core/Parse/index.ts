import type { Infer, KnownAlias, ParseResult, TypeRegistry, ValidateSchema, ValidationIssue, Validator } from "../../Types/Typer";
import type { Registry, RegistryOf, TypesOf } from "../Registry";
import { BUILTIN_CONTEXT, createRegistry } from "../Registry";
import { getCompiledChecker } from "../Compile";
import { TyperError } from "../../Errors/TyperError";
import { formatIssues } from "../../Utils/Issues";
import { failure, runCatching } from "../Result";
import type { SafeReporting } from "../../Constants/Symbols";
import { SAFE_RESULT } from "../../Constants/Symbols";

/**
 * Schema validation without an instance.
 *
 * These are the same entry points the `Typer` class exposes, reached directly.
 * A consumer who imports `parse` gets the compiler and the built-in predicates
 * and nothing else — not the format validators, not the combinators, not the
 * JSON Schema converter — which is the whole point of the 5.0 split.
 *
 * The class is unchanged and still works; it now sits on top of these.
 */

/** Options accepted by the schema entry points. */
export type ParseOptions<R extends TypeRegistry> = {
    /** Custom aliases, from {@link createRegistry}. Built-ins need none. */
    registry?: Registry<R>;
    /** Reject keys the schema does not declare. */
    strict?: boolean;
};

/**
 * Runs a schema and returns the issues, empty when the value is valid.
 *
 * @param schema - The schema to validate against.
 * @param value - The value to validate.
 * @param options - Registry and strictness.
 */
const run = <R extends TypeRegistry>(
    schema: Record<string, unknown>,
    value: unknown,
    options: ParseOptions<R> | undefined,
): ValidationIssue[] => {
    const context = options?.registry?.context ?? BUILTIN_CONTEXT;
    // Strict by default in 5.0: an undeclared key is rejected unless the
    // caller opts out. `{ strict: false }` restores 4.x behaviour.
    return getCompiledChecker(context, schema, options?.strict !== false)(value, '');
};

/**
 * Validates a value against a schema, returning it typed.
 *
 * `R` defaults to `{}` rather than being inferred from nothing: with the
 * registry omitted it would otherwise fall back to its constraint, widening
 * `KnownAlias<R>` to `string` and silently accepting a misspelled alias. The
 * default is what keeps `parse({ id: 'nubmer' }, x)` a compile error.
 *
 * @template T - The type the validator produces
 * @param validator - A validator function, run directly.
 * @param value - The value to validate.
 * @returns The validated value.
 * @throws {TyperError} With one issue per problem found.
 * @example
 * import { parse } from '@illavv/run_typer/core';
 *
 * const userSchema = { id: 'number', email: 'string', note: 'string?' };
 * const user = parse(userSchema, payload);
 * // { id: number; email: string; note?: string | null }
 */
export function parse<T>(validator: Validator<T>, value: unknown): T;
/**
 * Validates a value against a schema, returning it typed.
 *
 * @template S - The schema
 * @template R - Custom aliases, inferred from `options.registry`
 * @param schema - The shape to validate against. Declare it once, outside the
 *                 hot path: compiled checkers are cached by object identity.
 * @param value - The value to validate.
 * @param options - Registry and strictness.
 * @returns The same value, typed as `Infer<S, R>`.
 * @throws {TyperError} With one issue per problem found.
 */
export function parse<const S extends ValidateSchema<S, KnownAlias<R>>, R extends TypeRegistry = {}>(schema: S, value: unknown, options?: ParseOptions<R>): Infer<S, R>;
export function parse(schemaOrValidator: unknown, value: unknown, options?: ParseOptions<TypeRegistry>): unknown {
    // A validator is a function, and `Object.keys` of a function is empty — so
    // without this branch one would compile to a schema with no fields and
    // validate nothing at all, reporting success.
    if (typeof schemaOrValidator === 'function') return (schemaOrValidator as Validator<unknown>)(value);

    const issues = run(schemaOrValidator as Record<string, unknown>, value, options);
    if (issues.length > 0) throw new TyperError(formatIssues(issues), issues);
    return value;
}

/**
 * Validates without throwing. Same inputs as {@link parse}.
 *
 * Prefer `issues` over `error` on the failure branch: it is structured, and
 * reading it does not force construction of an `Error` with its stack trace,
 * which costs more than the validation that produced it.
 *
 * @template T - The type the validator produces
 * @param validator - A validator function, run directly.
 * @param value - The value to validate.
 * @example
 * const result = safeParse({ id: 'number' }, payload);
 * if (result.success) result.data.id;
 * else result.issues.forEach((i) => console.error(i.path, i.code));
 */
export function safeParse<T>(validator: Validator<T>, value: unknown): ParseResult<T>;
/**
 * Validates a value against a schema without throwing.
 *
 * @template S - The schema
 * @template R - Custom aliases, inferred from `options.registry`
 * @param schema - The shape to validate against.
 * @param value - The value to validate.
 * @param options - Registry and strictness.
 */
export function safeParse<const S extends ValidateSchema<S, KnownAlias<R>>, R extends TypeRegistry = {}>(schema: S, value: unknown, options?: ParseOptions<R>): ParseResult<Infer<S, R>>;
export function safeParse(schemaOrValidator: unknown, value: unknown, options?: ParseOptions<TypeRegistry>): ParseResult<unknown> {
    if (typeof schemaOrValidator === 'function') {
        // A validator that can report without throwing carries that path;
        // using it avoids building an Error only to unwrap it again.
        const safeRun = (schemaOrValidator as SafeReporting<unknown>)[SAFE_RESULT];
        if (safeRun !== undefined) return safeRun(value);
        return runCatching(schemaOrValidator as Validator<unknown>, value);
    }

    const issues = run(schemaOrValidator as Record<string, unknown>, value, options);
    return issues.length === 0
        ? { success: true, data: value }
        : failure(issues);
}

/**
 * Identity helper that preserves a schema's literal types, so it can be
 * declared once and have its type derived with `Infer<typeof schema>`.
 *
 * Declaring the schema in a variable is also what makes it fast: compiled
 * checkers are cached by object identity, so a hoisted schema compiles once
 * while a literal written inside a handler is a new object every call.
 *
 * @template S - The schema
 * @template R - Custom aliases, inferred from `options.registry`
 * @param definition - The schema to check and return unchanged.
 * @param _options - Registry, when the schema names custom aliases.
 * @example
 * const userSchema = schema({ id: 'number', email: 'string' });
 * type User = Infer<typeof userSchema>;
 */
export const schema = <const S extends ValidateSchema<S, KnownAlias<R>>, R extends TypeRegistry = {}>(
    definition: S,
    _options?: ParseOptions<R>,
): S => definition;

/** The schema entry points, bound to one registry. */
export type BoundTyper<R extends TypeRegistry> = {
    parse: <const S extends ValidateSchema<S, KnownAlias<R>>>(schema: S, value: unknown, options?: { strict?: boolean }) => Infer<S, R>;
    safeParse: <const S extends ValidateSchema<S, KnownAlias<R>>>(schema: S, value: unknown, options?: { strict?: boolean }) => ParseResult<Infer<S, R>>;
    schema: <const S extends ValidateSchema<S, KnownAlias<R>>>(definition: S) => S;
    /** The registry these are bound to, for passing to other entry points. */
    registry: Registry<R>;
};

/**
 * Binds the schema entry points to a set of custom aliases.
 *
 * Passing `{ registry }` on every call is the cost of losing the instance;
 * this removes it without giving up tree-shaking, because a consumer
 * destructures only the functions they use — taking `parse` does not drag in
 * the JSON Schema converter or the format validators.
 *
 * @param aliases - The custom aliases, as for {@link createRegistry}.
 * @example
 * const { parse, schema } = createTyper({
 *     positive: (v: unknown): number => {
 *         if (typeof v !== 'number' || v <= 0) throw new TypeError('Must be positive');
 *         return v;
 *     },
 * });
 *
 * const orderSchema = schema({ qty: 'positive' });
 * parse(orderSchema, payload); // { qty: number }
 */
export const createTyper = <const M extends Record<string, Validator<unknown>>>(
    aliases: M,
): BoundTyper<RegistryOf<M>> => {
    type R = RegistryOf<M>;
    const registry = createRegistry(aliases);

    return {
        parse: (definition, value, options) => parse(definition, value, { registry, strict: options?.strict }) as never,
        safeParse: (definition, value, options) => safeParse(definition, value, { registry, strict: options?.strict }) as never,
        schema: (definition) => definition,
        registry: registry as Registry<R>,
    };
};

export type { Registry, RegistryOf, TypesOf };

/**
 * `Infer`, reading the alias map off a registry **value** rather than a
 * hand-written map.
 *
 * @template S - The schema
 * @template Reg - The registry value's type, via `typeof registry`
 * @example
 * type Order = InferWith<typeof orderSchema, typeof registry>;
 */
export type InferWith<S, Reg> = Infer<S, TypesOf<Reg>>;
