import type { FieldChecker, TypeSlot, ValidationIssue, Validator, ValueChecker } from "../../Types/Typer";
import type { Predicate } from "../Predicates";
import { getType } from "../Predicates";
import { constraintOf, makeIssue } from "../../Utils/Issues";
import { indexPath, joinPath } from "../../Utils/Path";
import { DANGEROUS_KEYS, stripDangerousKeys } from "../../Utils/Sanitize";

/**
 * The schema compiler, as free functions.
 *
 * Moved out of the `Typer` class without changing a line of its logic — every
 * message is byte-for-byte what it was. The only difference is where the two
 * things it needed from the instance now come from: alias resolution and the
 * compiled-checker caches, which arrive together as a {@link CompileContext}.
 *
 * That is what lets a consumer validate a schema without constructing
 * anything, and lets a bundler drop the parts of the library they never call.
 */

/** A compiled checker for a whole schema, ready to run against a value. */
export type CompiledChecker = (value: unknown, rootPath: string) => ValidationIssue[];

/**
 * Resolves an alias to a predicate **without throwing**, returning `null` when
 * the name is neither a built-in nor registered.
 *
 * The compiler needs this non-throwing form because it reports unknown types
 * through the issue array rather than as exceptions, and because it resolves
 * every name once at compile time.
 */
export type Resolver = (rawType: string) => Predicate | null;

/**
 * Everything the compiler needs that is not the schema itself.
 *
 * The caches live here rather than at module level because they must be
 * invalidated together with the resolver: a schema compiled before a type was
 * registered, overridden or removed would otherwise keep validating against
 * the old definition. Replacing the context replaces both.
 */
export type CompileContext = {
    /** Alias → predicate, for the aliases this context knows. */
    readonly resolve: Resolver;
    /** Compiled checkers, keyed by schema object identity. */
    readonly cache: WeakMap<object, CompiledChecker>;
    /** Strict-mode compilations, which generate different code. */
    readonly strictCache: WeakMap<object, CompiledChecker>;
};

/**
 * Builds a compile context around an alias resolver.
 *
 * @param resolve - How this context resolves alias names.
 */
export const createContext = (resolve: Resolver): CompileContext => ({
    resolve,
    cache: new WeakMap<object, CompiledChecker>(),
    strictCache: new WeakMap<object, CompiledChecker>(),
});

/**
 * Builds the issue for a validator that threw inside a schema slot.
 *
 * The message keeps the `Validation failed at "path": …` wrapping it has
 * always had — it is what names the offending key — while `code` and the
 * constraint metadata are taken from the validator when it reported them.
 * Without this every constraint failure arrives as `code: 'custom'`, and
 * "too short" cannot be told from "out of range" except by reading prose.
 *
 * @param error - The value the validator threw.
 * @param path - Dotted path of the slot that failed.
 */
export const slotIssue = (error: unknown, path: string): ValidationIssue => {
    const message = error instanceof Error ? error.message : String(error);
    const wrapped = `Validation failed at "${path}": ${message}`;

    const constraint = constraintOf(error);
    if (constraint === undefined) return makeIssue('custom', path, wrapped);

    return makeIssue(
        constraint.code,
        path,
        wrapped,
        constraint.expected,
        constraint.received,
        { minimum: constraint.minimum, maximum: constraint.maximum, value: constraint.value },
    );
};

/**
 * Parses a type-string slot (`"string"`, `"string?"`, `"a|b"`, `"a|b?"`)
 * into everything the hot path needs, resolved once at compile time.
 *
 * Predicates are resolved up to the first unknown type name: the legacy
 * behavior is to try each alternative in order and, on reaching an
 * unresolvable name, report `Unknown type: …` instead of the regular
 * mismatch error — so alternatives listed after it are unreachable and are
 * deliberately not compiled.
 */
export const parseTypeSlot = (ctx: CompileContext, expected: string): TypeSlot | null => {
    const isOptional = expected.endsWith("?");
    const baseExpected = isOptional ? expected.slice(0, -1) : expected;
    const types = baseExpected.split("|").map(t => t.trim()).filter(t => t.length > 0);
    if (types.length === 0) return null;

    const predicates: Array<(value: unknown) => boolean> = [];
    let unknownType: string | null = null;
    for (const type of types) {
        const predicate = ctx.resolve(type);
        if (predicate === null) {
            unknownType = type;
            break;
        }
        predicates.push(predicate);
    }

    return {
        isOptional,
        types,
        predicates,
        unknownType,
        description: types.length === 1 ? types[0] : `one of [${types.join(", ")}]`,
    };
};

/**
 * Compiles a string-typed schema entry (e.g. `"string"`, `"string?"`,
 * `"a|b"`, `"a|b?"`). All string parsing and type resolution happens here,
 * once; the returned closure only reads the value and calls predicates.
 */
const compileStringField = (ctx: CompileContext, key: string, expected: string): FieldChecker => {
    if (expected.trim() === "") {
        return (_obj, issues, parentPath) => {
            const path = joinPath(parentPath, key);
            issues.push(makeIssue('invalid_schema', path, `Empty type definition at "${path}"`));
        };
    }

    const slot = parseTypeSlot(ctx, expected);
    if (slot === null) {
        return (_obj, issues, parentPath) => {
            const path = joinPath(parentPath, key);
            issues.push(makeIssue('invalid_schema', path, `Invalid type definition "${expected}" at "${path}"`));
        };
    }

    const { isOptional, predicates, unknownType, description } = slot;
    const predicateCount = predicates.length;

    return (obj, issues, parentPath) => {
        const value = obj[key];

        if (value === undefined) {
            if (!isOptional) {
                const path = joinPath(parentPath, key);
                issues.push(makeIssue('missing_key', path, `Missing required key "${path}"`, description, 'undefined'));
            }
            return;
        }
        if (value === null && isOptional) return;

        for (let i = 0; i < predicateCount; i++) {
            if (predicates[i](value)) return;
        }

        const path = joinPath(parentPath, key);
        if (unknownType !== null) {
            issues.push(makeIssue('unknown_type', path, `Unknown type: ${unknownType}`, unknownType));
            return;
        }
        const received = getType(value);
        issues.push(makeIssue(
            'invalid_type',
            path,
            `Expected "${path}" to be ${description}, got ${received}`,
            description,
            received,
        ));
    };
};

/**
 * Compiles an array-typed schema entry (`tags: ['string']` etc).
 */
const compileArrayField = (ctx: CompileContext, key: string, expected: unknown[], strictMode: boolean): FieldChecker => {
    if (expected.length === 0) {
        return (_obj, issues, parentPath) => {
            const path = joinPath(parentPath, key);
            issues.push(makeIssue('invalid_schema', path, `Empty array schema definition at "${path}"`));
        };
    }
    if (expected.length > 1) {
        return (_obj, issues, parentPath) => {
            const path = joinPath(parentPath, key);
            issues.push(makeIssue('invalid_schema', path, `Array schema must have exactly one element type definition at "${path}"`));
        };
    }

    const elementDef = expected[0];
    const elementIsValid =
        typeof elementDef === "string"
        || typeof elementDef === "function"
        || (typeof elementDef === "object" && elementDef !== null && !Array.isArray(elementDef));

    if (!elementIsValid) {
        return (_obj, issues, parentPath) => {
            const path = joinPath(parentPath, key);
            issues.push(makeIssue('invalid_schema', path, `Array element type must be a string at "${path}"`));
        };
    }

    const elementCheck = compileValue(ctx, elementDef, strictMode);

    return (obj, issues, parentPath) => {
        const value = obj[key];

        if (value === undefined) {
            const path = joinPath(parentPath, key);
            issues.push(makeIssue('missing_key', path, `Missing required key "${path}"`, 'array', 'undefined'));
            return;
        }
        if (!Array.isArray(value)) {
            const path = joinPath(parentPath, key);
            const received = getType(value);
            issues.push(makeIssue('invalid_type', path, `Expected "${path}" to be an array, got ${received}`, 'array', received));
            return;
        }

        const length = value.length;
        if (length === 0) return;

        // Joined once per array instead of once per element; the element
        // checkers append `[i]` only when they actually report an issue.
        const arrayPath = joinPath(parentPath, key);
        for (let i = 0; i < length; i++) {
            elementCheck(value, i, issues, arrayPath);
        }
    };
};

/**
 * Compiles a nested-object schema entry. The nested schema is compiled
 * once and reused for every parent object.
 */
const compileNestedField = (ctx: CompileContext, key: string, expected: Record<string, unknown>, strictMode: boolean): FieldChecker => {
    const compiledNested = compileSchema(ctx, expected, strictMode);

    return (obj, issues, parentPath) => {
        const value = obj[key];
        const path = joinPath(parentPath, key);

        if (value === undefined) {
            issues.push(makeIssue('missing_key', path, `Missing required key "${path}"`, 'object', 'undefined'));
            return;
        }
        if (value === null || typeof value !== "object" || Array.isArray(value)) {
            const received = getType(value);
            issues.push(makeIssue('invalid_type', path, `Expected "${path}" to be an object, got ${received}`, 'object', received));
            return;
        }

        compiledNested(value as Record<string, unknown>, issues, path);
    };
};

/**
 * Compiles a "value-position" schema fragment — currently the element type
 * inside an array field.
 *
 * The returned closure receives the owning array's path plus the element
 * index rather than a pre-built path, so `"tags[3]"` is only assembled when
 * that element actually fails.
 */
const compileValue = (ctx: CompileContext, expected: unknown, strictMode: boolean): ValueChecker => {
    if (typeof expected === "function") {
        const validator = expected as Validator<unknown>;
        return (array, index, issues, arrayPath) => {
            try {
                const result = validator(array[index]);
                // Same write-back rule as a field slot: only a validator
                // that actually produced something else touches the array.
                if (result !== array[index]) array[index] = result;
            } catch (e) {
                issues.push(slotIssue(e, indexPath(arrayPath, index)));
            }
        };
    }

    if (typeof expected === "string") {
        if (expected.trim() === "") {
            return (_array, index, issues, arrayPath) => {
                const path = indexPath(arrayPath, index);
                issues.push(makeIssue('invalid_schema', path, `Empty type definition at "${path}"`));
            };
        }

        const slot = parseTypeSlot(ctx, expected);
        if (slot === null) {
            return (_array, index, issues, arrayPath) => {
                const path = indexPath(arrayPath, index);
                issues.push(makeIssue('invalid_schema', path, `Invalid type definition "${expected}" at "${path}"`));
            };
        }

        const { isOptional, predicates, unknownType, description } = slot;
        const predicateCount = predicates.length;

        return (array, index, issues, arrayPath) => {
            const value = array[index];
            if (isOptional && (value === undefined || value === null)) return;

            for (let i = 0; i < predicateCount; i++) {
                if (predicates[i](value)) return;
            }

            const path = indexPath(arrayPath, index);
            if (unknownType !== null) {
                issues.push(makeIssue('unknown_type', path, `Unknown type: ${unknownType}`, unknownType));
                return;
            }
            const received = getType(value);
            issues.push(makeIssue(
                'invalid_type',
                path,
                `Expected "${path}" to be ${description}, got ${received}`,
                description,
                received,
            ));
        };
    }

    /* istanbul ignore next — compileArrayField filters arrays out via
     * elementIsValid before delegating here, so this branch is currently
     * unreachable. Kept as a defensive fallback for future call sites. */
    if (Array.isArray(expected)) {
        // Array-of-array isn't supported as a schema; mirror checkStructure error wording.
        return (_array, index, issues, arrayPath) => {
            const path = indexPath(arrayPath, index);
            issues.push(makeIssue('invalid_schema', path, `Array element type must be a string at "${path}"`));
        };
    }

    if (expected !== null && typeof expected === "object") {
        const compiledNested = compileSchema(ctx, expected as Record<string, unknown>, strictMode);
        return (array, index, issues, arrayPath) => {
            const value = array[index];
            const path = indexPath(arrayPath, index);
            if (value === null || typeof value !== "object" || Array.isArray(value)) {
                const received = getType(value);
                issues.push(makeIssue('invalid_type', path, `Expected "${path}" to be an object, got ${received}`, 'object', received));
                return;
            }
            compiledNested(value as Record<string, unknown>, issues, path);
        };
    }

    // compileArrayField's elementIsValid check already rejects
    // non-string/function/object element schemas before we reach this
    // branch. Kept as a defensive fallback for future call sites.
    /* istanbul ignore next */
    return (_array, index, issues, arrayPath) => {
        const expectedType = expected === null ? "null" : typeof expected;
        const path = indexPath(arrayPath, index);
        issues.push(makeIssue(
            'invalid_schema',
            path,
            `Invalid schema definition at "${path}": expected string, array, or object, got ${expectedType}`,
            'string, array, or object',
            expectedType,
        ));
    };
};

/**
 * Compiles a single key+value pair from a schema into a closure that
 * checks the field in its parent object and pushes any errors found.
 */
const compileField = (ctx: CompileContext, key: string, expected: unknown, strictMode: boolean): FieldChecker => {
    // Validator function entry — defers all decisions (incl. optional) to the validator itself.
    if (typeof expected === "function") {
        const validator = expected as Validator<unknown>;
        return (obj, issues, parentPath) => {
            try {
                const result = validator(obj[key]);
                // Write back only when the validator actually produced
                // something else. Every `is*`/`as*` validator and
                // `objectOf` hand back what they were given, so the object
                // is not touched at all in the overwhelming majority of
                // slots; `coerce.*`, `transform` and `withDefault` exist to
                // produce a different value, and used to have that value
                // silently discarded.
                if (result !== obj[key]) obj[key] = result;
            } catch (e) {
                issues.push(slotIssue(e, joinPath(parentPath, key)));
            }
        };
    }

    // Type-string entry, possibly optional and/or a `a|b|c` union.
    if (typeof expected === "string") {
        return compileStringField(ctx, key, expected);
    }

    // Array entry: ["string"], [validator], [{nested}].
    if (Array.isArray(expected)) {
        return compileArrayField(ctx, key, expected as unknown[], strictMode);
    }

    // Nested schema entry.
    if (expected !== null && typeof expected === "object") {
        return compileNestedField(ctx, key, expected as Record<string, unknown>, strictMode);
    }

    // Anything else (number, boolean, null, …) — invalid schema definition.
    const expectedType = expected === null ? "null" : typeof expected;
    return (_obj, issues, parentPath) => {
        const path = joinPath(parentPath, key);
        issues.push(makeIssue(
            'invalid_schema',
            path,
            `Invalid schema definition at "${path}": expected string, array, or object, got ${expectedType}`,
            'string, array, or object',
            expectedType,
        ));
    };
};

/**
 * Compiles a full schema object into a single closure that, given an
 * already-validated parent object, runs every field check in order.
 * Nested schemas are compiled recursively (their compiled checkers are
 * captured by reference).
 */
export const compileSchema = (ctx: CompileContext, schema: Record<string, unknown>, strictMode = false): FieldChecker => {
    const keys = Object.keys(schema);
    const fields: FieldChecker[] = new Array(keys.length);
    for (let i = 0; i < keys.length; i++) {
        fields[i] = compileField(ctx, keys[i], schema[keys[i]], strictMode);
    }
    const fieldCount = fields.length;

    // A schema is free to declare `constructor` as a field of its own — in
    // that case it is an ordinary key and is validated, not stripped. Which
    // of the three are dangerous *for this schema* is therefore known at
    // compile time, and the hot path only walks the ones that are.
    const unsafe = DANGEROUS_KEYS.filter(key => !keys.includes(key));
    const unsafeCount = unsafe.length;

    if (!strictMode) {
        return (obj, issues, parentPath) => {
            if (unsafeCount > 0) stripDangerousKeys(obj, unsafe, issues, parentPath);
            for (let i = 0; i < fieldCount; i++) {
                fields[i](obj, issues, parentPath);
            }
        };
    }

    // Declared keys are known at compile time, so strict mode costs one
    // Set lookup per key of the *input* rather than a per-call filter.
    const declared = new Set(keys);
    return (obj, issues, parentPath) => {
        // Stripped before the extra-key sweep: an unsafe key is removed,
        // not reported twice.
        if (unsafeCount > 0) stripDangerousKeys(obj, unsafe, issues, parentPath);
        for (let i = 0; i < fieldCount; i++) {
            fields[i](obj, issues, parentPath);
        }
        for (const key of Object.keys(obj)) {
            if (declared.has(key)) continue;
            const path = joinPath(parentPath, key);
            issues.push(makeIssue('unexpected_key', path, `Unexpected key "${path}" in strict mode`));
        }
    };
};

/**
 * Returns a cached, **closure-compiled** checker for the given schema.
 *
 * Compilation walks the schema **once** and produces a flat array of
 * pre-built closures, with all string parsing (split/trim/lowercase),
 * optional/nullable detection, and alias lookups resolved at compile time.
 * The hot path is then a tight `for` loop over closures that touch only the
 * input value — no per-call allocations, no `bind`, no recursion.
 *
 * The cache is keyed by schema **object identity**, not structure: a schema
 * literal written inside a handler is a new object on every call, so it never
 * hits the cache and is recompiled every time. That costs roughly an order of
 * magnitude — measured at 78 ns hoisted against 873 ns inline — and it is
 * silent, because `parse({ id: 'number' }, req.body)` looks like perfectly
 * ordinary code. Declare the schema once, outside the handler.
 *
 * It is a leak-free cost, not a leak: a `WeakMap` releases the entry as soon
 * as the throwaway schema object is collected.
 */
export const getCompiledChecker = (ctx: CompileContext, schema: Record<string, unknown>, strictMode = false): CompiledChecker => {
    // Strictness changes the generated code (extra-key detection), so the two
    // variants of the same schema object cannot share an entry.
    const cache = strictMode ? ctx.strictCache : ctx.cache;
    const cached = cache.get(schema);
    if (cached) return cached;

    const compiled = compileSchema(ctx, schema, strictMode);
    const wrapper: CompiledChecker = (value: unknown, rootPath: string): ValidationIssue[] => {
        const issues: ValidationIssue[] = [];
        if (value === null || typeof value !== "object" || Array.isArray(value)) {
            const received = getType(value);
            issues.push(makeIssue(
                'invalid_type',
                rootPath,
                `Invalid object: must be a non-null object, got ${received}`,
                'object',
                received,
            ));
            return issues;
        }
        compiled(value as Record<string, unknown>, issues, rootPath);
        return issues;
    };

    cache.set(schema, wrapper);
    return wrapper;
};
