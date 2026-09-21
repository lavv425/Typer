import type { DiscriminatedUnion, Infer, KnownAlias, ParseResult, StandardValidator, TypeRegistry, ValidateSchema, ValidationIssue, Validator } from "../../Types/Typer";
import type { StandardSchemaV1 } from "../../Types/StandardSchema";
import type { Registry } from "../../Core/Registry";
import type { SafeReporting } from "../../Constants/Symbols";
import { STANDARD_VENDOR } from "../../Types/StandardSchema";
import { BUILTIN_CONTEXT } from "../../Core/Registry";
import { getCompiledChecker } from "../../Core/Compile";
import { getType } from "../../Core/Predicates";
import { isType } from "../../Core/Checkers";
import { describedFragment, hasOwnKey } from "../../Core/Describe";
import { describingLazy, SAFE_RESULT } from "../../Constants/Symbols";
import { failure, runCatching } from "../../Core/Result";
import { TyperError } from "../../Errors/TyperError";
import { formatIssues, makeIssue, toStandardIssues } from "../../Utils/Issues";
import { toJSONSchema } from "../../Utils/JSONSchema";

/**
 * Combinators that need the schema compiler: turning a schema into a
 * validator, discriminated unions, and the Standard Schema wrapper.
 *
 * Moved out of the class unchanged. What they used to take from the instance —
 * the compile context — now arrives as an optional registry, defaulting to the
 * built-in aliases.
 */

/** Options shared by the schema-backed combinators. */
export type ObjectOptions<R extends TypeRegistry> = {
    /** Reject keys the schema does not declare. */
    strict?: boolean;
    /** Custom aliases, from `createRegistry`. */
    registry?: Registry<R>;
};

/**
 * Attaches the Standard Schema properties to a validator function.
 *
 * `~standard` is defined non-enumerable so the validator still serializes,
 * spreads and compares like the plain function it was, and `validate` is
 * built on the non-throwing path rather than on `try`/`catch` around the
 * throwing one.
 *
 * The same non-throwing path is also stored under {@link SAFE_RESULT}, so
 * `safeParse` can use it directly instead of catching what this validator
 * would have thrown.
 *
 * @param validator - The function to decorate, returned as-is. Must be one
 *                    Typer owns — never a function supplied by the caller.
 * @param safeRun - Produces a `ParseResult` without throwing.
 */
export const asStandard = <T>(validator: Validator<T>, safeRun: (value: unknown) => ParseResult<T>): StandardValidator<T> => {
    const props: StandardSchemaV1.Props<unknown, T> = {
        version: 1,
        vendor: STANDARD_VENDOR,
        validate: (value: unknown): StandardSchemaV1.Result<T> => {
            const result = safeRun(value);
            return result.success ? { value: result.data } : { issues: toStandardIssues(result.issues) };
        },
    };

    Object.defineProperty(validator, '~standard', {
        value: props,
        enumerable: false,
        configurable: true,
    });

    Object.defineProperty(validator, SAFE_RESULT, {
        value: safeRun,
        enumerable: false,
        configurable: true,
    });

    return validator as StandardValidator<T>;
};

/**
 * Turns a schema into a `Validator`, so object shapes can be nested inside
 * the other combinators.
 *
 * The schema is compiled once and cached like any other, so this is as fast
 * as calling `parse` directly. The result is also a
 * {@link https://standardschema.dev Standard Schema}.
 *
 * @template S - The schema
 * @template R - Custom aliases, inferred from `options.registry`
 * @param schema - The shape to validate against.
 * @param options - `strict` rejects undeclared keys; `registry` supplies custom aliases.
 * @returns A validator producing `Infer<S, R>`, carrying `~standard`.
 * @throws {TyperError} With one issue per problem found.
 * @example
 * const users = arrayOf(objectOf({ id: 'number', name: 'string' }));
 */
export const objectOf = <const S extends ValidateSchema<S, KnownAlias<R>>, R extends TypeRegistry = {}>(
    schema: S,
    options: ObjectOptions<R> = {},
): StandardValidator<Infer<S, R>> => {
    const context = options.registry?.context ?? BUILTIN_CONTEXT;
    const checker = getCompiledChecker(context, schema as Record<string, unknown>, options.strict !== false);

    const validator = (value: unknown): Infer<S, R> => {
        const issues = checker(value, '');
        if (issues.length > 0) throw new TyperError(formatIssues(issues), issues);
        return value as Infer<S, R>;
    };

    describingLazy(validator, () => toJSONSchema(schema as Record<string, unknown>, {
        $schema: false,
        strict: options.strict !== false,
    }));

    return asStandard(validator, (value) => {
        const issues = checker(value, '');
        return issues.length === 0
            ? { success: true, data: value as Infer<S, R> }
            : failure(issues);
    });
};

/**
 * Builds a validator for a union whose members are told apart by a single
 * key — the shape most API payloads use.
 *
 * `union` tries each variant in turn, so its cost grows with the number of
 * variants and its error lists every variant's failure. This reads the
 * discriminant once and goes straight to the one variant that can possibly
 * match, in constant time, and reports against that variant alone.
 *
 * The variants are keyed by discriminant value, so the mapping is exact by
 * construction — there is no literal to extract from a schema and no way to
 * declare two variants with the same tag.
 *
 * @template Key - The discriminant key
 * @template V - The variants, keyed by discriminant value
 * @template R - Custom aliases, inferred from `options.registry`
 * @param key - The key that tells the variants apart.
 * @param variants - Schema per discriminant value.
 * @param options - `strict` rejects undeclared keys; `registry` supplies custom aliases.
 * @returns A validator producing the union of the variants.
 * @throws {TyperError} If the discriminant is missing or unknown, or the selected variant fails.
 * @example
 * const shape = discriminatedUnion('kind', {
 *     circle: { radius: 'number' },
 *     square: { side: 'number' },
 * });
 */
export const discriminatedUnion = <const Key extends string, const V extends Record<string, Record<string, unknown>>, R extends TypeRegistry = {}>(
    key: Key,
    variants: V,
    options: ObjectOptions<R> = {},
): StandardValidator<DiscriminatedUnion<Key, V, R>> => {
    type Out = DiscriminatedUnion<Key, V, R>;

    const context = options.registry?.context ?? BUILTIN_CONTEXT;
    const strict = options.strict !== false;
    const checkers = new Map<string, (value: unknown, rootPath: string) => ValidationIssue[]>();

    for (const tag of Object.keys(variants)) {
        // The discriminant is declared on the compiled schema even when the
        // variant does not mention it, so strict mode does not flag the very
        // key the union is selected by. Re-checking it costs one `typeof`
        // and keeps the variant free to declare it itself.
        const declared = variants[tag];
        const schema = hasOwnKey(declared, key) ? declared : { [key]: 'string', ...declared };
        checkers.set(tag, getCompiledChecker(context, schema, strict));
    }

    const tags = Object.keys(variants);
    const expected = `one of [${tags.join(', ')}]`;

    const run = (value: unknown): ValidationIssue[] => {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
            const received = getType(value);
            return [makeIssue('invalid_type', '', `Invalid object: must be a non-null object, got ${received}`, 'object', received)];
        }

        const tag = (value as Record<string, unknown>)[key];
        if (tag === undefined) {
            return [makeIssue('missing_key', key, `Missing required key "${key}"`, expected, 'undefined')];
        }

        const checker = typeof tag === 'string' ? checkers.get(tag) : undefined;
        if (checker === undefined) {
            return [makeIssue('invalid_type', key, `Expected "${key}" to be ${expected}, got ${String(tag)}`, expected, getType(tag))];
        }

        return checker(value, '');
    };

    const validator = (value: unknown): Out => {
        const issues = run(value);
        if (issues.length > 0) throw new TyperError(formatIssues(issues), issues);
        return value as Out;
    };

    describingLazy(validator, () => ({
        oneOf: tags.map((tag) => {
            const variant = toJSONSchema(variants[tag], { $schema: false, strict }) as {
                properties?: Record<string, unknown>;
                required?: string[];
            };
            // The discriminant is pinned to its own value on each branch,
            // which is what makes the `oneOf` actually discriminating.
            return {
                ...variant,
                properties: { [key]: { const: tag }, ...variant.properties },
                required: Array.from(new Set([key, ...(variant.required ?? [])])),
            };
        }),
        discriminator: { propertyName: key },
    }));

    return asStandard(validator, (value) => {
        const issues = run(value);
        return issues.length === 0 ? { success: true, data: value as Out } : failure(issues);
    });
};

/**
 * Turns any schema, validator or type alias into a
 * {@link https://standardschema.dev Standard Schema}.
 *
 * Standard Schema is the common contract that lets a validation library be
 * accepted by tRPC, Hono, TanStack Form and Router, Nuxt and the rest, without
 * a per-library adapter. The returned value is still a plain validator
 * function, so it also keeps working everywhere a `Validator` does.
 *
 * Schema literals are the one shape that cannot carry `~standard` on their
 * own — they are inert object literals owned by the caller, and Typer does not
 * mutate them — which is why this wrapper exists.
 *
 * @param target - A schema object, a `Validator`, or a type alias (or array of aliases).
 * @param options - Schema objects only: `strict` and `registry`.
 * @returns The validator, carrying `~standard`.
 * @example
 * const userSchema = standard({ id: 'number', email: 'string' });
 * userSchema['~standard'].validate({ id: 1, email: 'a@b.c' });
 */
export const standard = <R extends TypeRegistry = {}>(
    target: unknown,
    options: ObjectOptions<R> = {},
): StandardValidator<unknown> => {
    // Schemas get the dedicated path: `objectOf` already compiles the
    // checker once and reports issues without building an Error.
    if (target !== null && typeof target === 'object' && !Array.isArray(target)) {
        return objectOf(target as never, options) as StandardValidator<unknown>;
    }

    // Never decorate the function the caller handed in: attaching to it
    // would mutate a value they own and may reuse elsewhere. Wrapping also
    // keeps `~standard` off a validator that is passed around as a plain
    // function.
    const inner: Validator<unknown> = typeof target === 'function'
        ? target as Validator<unknown>
        // A type alias, or an array of them. Built-ins only: a custom alias
        // lives in a registry, and the class keeps its own branch for that.
        : (value: unknown) => isType(target as string | readonly string[], value);

    const wrapper: Validator<unknown> = (value: unknown) => inner(value);

    // Reuse the inner validator's own non-throwing path when it has one,
    // so wrapping an `objectOf` in `standard()` does not reintroduce the
    // throw/catch round trip it was built to avoid.
    const innerSafeRun = (inner as SafeReporting<unknown>)[SAFE_RESULT];
    const safeRun = innerSafeRun ?? ((value: unknown) => runCatching(inner, value));

    return asStandard(wrapper, safeRun);
};

export { describedFragment };
