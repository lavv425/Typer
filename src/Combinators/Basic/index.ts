import type { Validator } from "../../Types/Typer";
import type { JSONSchemaFragment } from "../../Types/JSONSchema";
import { describing, describingLazy } from "../../Constants/Symbols";
import { describedFragment, nullableFragment } from "../../Core/Describe";
import { OPTIONAL_MARKER } from "../../Utils/JSONSchema";
import * as Guards from "../../Validators/Guards";

/**
 * Combinators that wrap or constrain a validator without needing the schema
 * compiler: optionality, unions, literals, refinement, transformation,
 * defaults and laziness.
 *
 * Moved out of the class unchanged. One export each, so a consumer pays for
 * the combinators they use.
 */

/**
 * Wraps an existing validator so that `null` is also accepted and returned as-is.
 * Useful as a building block for nullable schema fields.
 *
 * @template T - The type produced by the underlying validator on success
 * @param {Validator} validator - The validator to make nullable
 * @returns {Validator} A new validator that accepts `T` or `null`
 * @example
 * const maybeStr = typer.nullable(v => typer.asString(v));
 * maybeStr(null); // null
 * maybeStr("hi"); // "hi"
 */
export const nullable = <T>(validator: Validator<T>): Validator<T | null> => {
    const wrapped = (value: unknown): T | null => {
        if (value === null) return null;
        return validator(value);
    };
    return describingLazy(wrapped, () => nullableFragment(describedFragment(validator)));
};

/**
 * Wraps an existing validator so that `undefined` is also accepted.
 * Useful for optional schema fields.
 *
 * @template T - The type produced by the underlying validator on success
 * @param {Validator} validator - The validator to make optional
 * @returns {Validator} A new validator that accepts `T` or `undefined`
 * @example
 * const maybeNum = typer.optional(v => typer.asNumber(v));
 * maybeNum(undefined); // undefined
 * maybeNum(42); // 42
 */
export const optional = <T>(validator: Validator<T>): Validator<T | undefined> => {
    const wrapped = (value: unknown): T | undefined => {
        if (value === undefined) return undefined;
        return validator(value);
    };
    return describingLazy(wrapped, () => ({ ...describedFragment(validator), [OPTIONAL_MARKER]: true }));
};

/**
 * Combines multiple validators into one that succeeds if any of them succeeds.
 * The first matching validator's result is returned.
 *
 * @template T - Tuple of types produced by each validator
 * @param {Validator[]} validators - Validators to try in order
 * @returns {Validator} A new validator that returns the first matching result
 * @throws {TypeError} If none of the validators accepts the value
 * @example
 * const stringOrNumber = typer.union(
 *   v => typer.asString(v),
 *   v => typer.asNumber(v),
 * );
 * stringOrNumber(42); // 42
 * stringOrNumber("hi"); // "hi"
 */
export const union = <T extends readonly unknown[]>(
    ...validators: { [K in keyof T]: Validator<T[K]> }
): Validator<T[number]> => {
    return (value: unknown): T[number] => {
        const errors: string[] = [];
        for (const validator of validators) {
            try {
                return validator(value) as T[number];
            } catch (e: unknown) {
                errors.push(e instanceof Error ? e.message : String(e));
            }
        }
        throw new TypeError(`Value did not match any union variant: ${errors.join(', ')}`);
    };
};

/**
 * Builds a validator accepting only the listed literal values.
 *
 * The returned validator narrows to the union of those literals, so it is
 * the composable counterpart of `isOneOf`, from `@illavv/run_typer/validators`.
 *
 * @template T - Tuple of accepted literals
 * @param {...(string|number|boolean|null)} values - The accepted values.
 * @returns {Validator} A validator narrowing to `values[number]`.
 * @throws {TypeError} If the value is none of them.
 * @example
 * const role = typer.literal('admin', 'user', 'guest');
 * role('admin'); // 'admin' | 'user' | 'guest'
 * typer.parse({ role: typer.literal('a', 'b') }, payload);
 */
export const literal = <const T extends readonly (string | number | boolean | null)[]>(
    ...values: T
): Validator<T[number]> => {
    const allowed = new Set<unknown>(values);
    const validator = (value: unknown): T[number] => {
        if (!allowed.has(value)) {
            throw new TypeError(`${String(value)} must be one of [${values.join(', ')}].`);
        }
        return value as T[number];
    };
    return describing(validator, { enum: [...values] });
};

/**
 * Adds a constraint to an existing validator without changing its type.
 *
 * @template T - The validated type
 * @param {Validator} validator - The validator to run first.
 * @param {(value: T) => boolean} predicate - Must return true for the value to be accepted.
 * @param {string} message - Error message used when the predicate fails.
 * @returns {Validator} A validator producing `T`.
 * @throws {TypeError} If the base validator fails, or the predicate returns false.
 * @example
 * const even = typer.refine((v) => typer.asNumber(v), (n) => n % 2 === 0, 'must be even');
 */
export const refine = <T>(validator: Validator<T>, predicate: (value: T) => boolean, message: string): Validator<T> => {
    return (value: unknown): T => {
        const parsed = validator(value);
        if (!predicate(parsed)) throw new TypeError(message);
        return parsed;
    };
};

/**
 * Maps a validated value to another shape. Validation runs first, so the
 * transformer only ever sees a well-typed input.
 *
 * @template T - The validated type
 * @template U - The produced type
 * @param {Validator} validator - The validator to run first.
 * @param {(value: T) => U} transformer - Applied to the validated value.
 * @returns {Validator} A validator producing `U`.
 * @example
 * const trimmed = typer.transform((v) => typer.asString(v), (s) => s.trim());
 */
export const transform = <T, U>(validator: Validator<T>, transformer: (value: T) => U): Validator<U> => {
    return (value: unknown): U => transformer(validator(value));
};

/**
 * Substitutes a default when the value is `undefined`, and validates
 * everything else.
 *
 * Pass a factory (`() => T`) for object or array defaults so each call gets
 * its own instance. A plain function default must be wrapped in a factory,
 * since functions are treated as factories.
 *
 * @template T - The validated type
 * @param {Validator} validator - Applied when the value is present.
 * @param {T | (() => T)} fallback - Value, or factory, used when `undefined`.
 * @returns {Validator} A validator producing `T`.
 * @example
 * const limit = typer.withDefault((v) => typer.asNumber(v), 10);
 * limit(undefined); // 10
 */
export const withDefault = <T>(validator: Validator<T>, fallback: T | (() => T)): Validator<T> => {
    const wrapped = (value: unknown): T => {
        if (value !== undefined) return validator(value);
        return typeof fallback === 'function' ? (fallback as () => T)() : fallback;
    };

    return describingLazy(wrapped, () => {
        const fragment: JSONSchemaFragment = { ...describedFragment(validator), [OPTIONAL_MARKER]: true };
        // A factory's result is produced per call, so there is no single
        // literal to advertise as the schema's default.
        if (typeof fallback !== 'function') fragment.default = fallback;
        return fragment;
    });
};

/**
 * Defers building a validator until first use, which is what makes
 * self-referential (recursive) shapes expressible.
 *
 * The factory runs at most once; the result is reused.
 *
 * @template T - The validated type
 * @param {() => Validator} factory - Returns the real validator.
 * @returns {Validator} A validator producing `T`.
 * @example
 * type Node = { name: string; children?: Node[] };
 * const node: Validator<Node> = typer.lazy(() => typer.objectOf({
 *     name: 'string',
 *     children: typer.optional(typer.arrayOf(node)),
 * }) as Validator<Node>);
 */
export const lazy = <T>(factory: () => Validator<T>): Validator<T> => {
    let resolved: Validator<T> | undefined;
    return (value: unknown): T => (resolved ??= factory())(value);
};

/**
 * Composable form of `isInstanceOf`, from `@illavv/run_typer/validators`.
 *
 * @template T - The instance type
 * @param {Function} ctor - The constructor to check against.
 * @returns {Validator} A validator producing `T`.
 * @example
 * typer.parse({ when: typer.instanceOf(Date) }, payload);
 */
export const instanceOf = <T>(ctor: new (...args: never[]) => T): Validator<T> => {
    return (value: unknown): T => Guards.isInstanceOf(ctor, value);
};
