import type { ValidationIssue, Validator } from "@/Types/Typer";
import type { JSONSchemaFragment } from "@/Types/JSONSchema";
import { describingLazy } from "@/Constants/Symbols";
import { describedFragment } from "@/Core/Describe";
import { getType } from "@/Core/Predicates";
import { TyperError } from "@/Errors/TyperError";
import { formatIssues, issueError, makeIssue } from "@/Utils/Issues";
import { DANGEROUS_KEYS } from "@/Utils/Sanitize";

/**
 * Combinators over collections: arrays, dictionaries and tuples.
 *
 * Moved out of the class unchanged, including `record`'s refusal to copy
 * `__proto__`, `constructor` and `prototype` into the object it builds.
 */

/**
 * Builds a validator for an array whose elements all satisfy `element`,
 * optionally constraining the length.
 *
 * Every failing element is reported, not just the first.
 *
 * @template T - The element type
 * @param {Validator} element - Validator applied to each element.
 * @param {{ min?: number, max?: number }} [bounds] - Inclusive length bounds.
 * @returns {Validator} A validator producing `T[]`.
 * @throws {TypeError} If the value is not an array, is out of bounds, or has invalid elements.
 * @example
 * const tags = typer.arrayOf((v) => typer.asString(v), { min: 1 });
 * tags(['a', 'b']); // string[]
 */
export const arrayOf = <T>(element: Validator<T>, bounds: { min?: number; max?: number } = {}): Validator<T[]> => {
    const { min, max } = bounds;
    const validator = (value: unknown): T[] => {
        if (!Array.isArray(value)) {
            throw new TypeError(`${String(value)} must be an array, is ${getType(value)}`);
        }
        if (min !== undefined && value.length < min) {
            throw issueError('too_small', `array length must be >= ${min}, is ${value.length}`, undefined, undefined, { minimum: min });
        }
        if (max !== undefined && value.length > max) {
            throw issueError('too_big', `array length must be <= ${max}, is ${value.length}`, undefined, undefined, { maximum: max });
        }

        const out: T[] = new Array<T>(value.length);
        const issues: ValidationIssue[] = [];
        for (let i = 0; i < value.length; i++) {
            try {
                out[i] = element(value[i]);
            } catch (e) {
                const message = e instanceof Error ? e.message : String(e);
                const path = `[${i}]`;
                issues.push(makeIssue('custom', path, `Validation failed at "${path}": ${message}`));
            }
        }
        if (issues.length > 0) throw new TyperError(formatIssues(issues), issues);
        return out;
    };

    return describingLazy(validator, () => {
        const fragment: JSONSchemaFragment = { type: 'array', items: describedFragment(element) };
        if (min !== undefined) fragment.minItems = min;
        if (max !== undefined) fragment.maxItems = max;
        return fragment;
    });
};

/**
 * Builds a validator for a dictionary object: any set of keys, all values
 * satisfying `value`.
 *
 * Rejects arrays and `null`, unlike the `'object'` alias.
 *
 * Keys that are dangerous to copy (`__proto__`, `constructor`,
 * `prototype`) are dropped rather than written to the result: assigning
 * `out['__proto__']` would set the output's prototype instead of a field.
 *
 * @template T - The value type
 * @param {Validator} value - Validator applied to each own enumerable value.
 * @returns {Validator} A validator producing `Record<string, T>`.
 * @throws {TypeError} If the input is not a plain dictionary or a value fails.
 * @example
 * const scores = typer.record((v) => typer.asNumber(v));
 * scores({ alice: 1, bob: 2 }); // Record<string, number>
 */
export const record = <T>(value: Validator<T>): Validator<Record<string, T>> => {
    const validator = (input: unknown): Record<string, T> => {
        if (input === null || typeof input !== 'object' || Array.isArray(input)) {
            throw new TypeError(`${String(input)} must be an object, is ${getType(input)}`);
        }

        const out: Record<string, T> = {};
        const issues: ValidationIssue[] = [];
        for (const key of Object.keys(input)) {
            if (DANGEROUS_KEYS.includes(key)) continue;
            try {
                out[key] = value((input as Record<string, unknown>)[key]);
            } catch (e) {
                const message = e instanceof Error ? e.message : String(e);
                issues.push(makeIssue('custom', key, `Validation failed at "${key}": ${message}`));
            }
        }
        if (issues.length > 0) throw new TyperError(formatIssues(issues), issues);
        return out;
    };

    return describingLazy(validator, () => ({ type: 'object', additionalProperties: describedFragment(value) }));
};

/**
 * Builds a validator for a fixed-length, heterogeneous array.
 *
 * @template T - Tuple of element validators
 * @param {Validator[]} validators - One validator per position.
 * @returns {Validator} A validator producing the corresponding tuple type.
 * @throws {TypeError} If the value is not an array of exactly that length, or an element fails.
 * @example
 * const point = typer.tuple([(v) => typer.asNumber(v), (v) => typer.asNumber(v)]);
 * point([1, 2]); // [number, number]
 */
export const tuple = <const T extends readonly Validator<unknown>[]>(validators: T): Validator<{ -readonly [K in keyof T]: T[K] extends Validator<infer U> ? U : never }> => {
    type Out = { -readonly [K in keyof T]: T[K] extends Validator<infer U> ? U : never };
    const validator = (value: unknown): Out => {
        if (!Array.isArray(value)) {
            throw new TypeError(`${String(value)} must be an array, is ${getType(value)}`);
        }
        if (value.length !== validators.length) {
            const message = `tuple must have exactly ${validators.length} elements, has ${value.length}`;
            const bounds = { minimum: validators.length, maximum: validators.length };
            throw issueError(value.length < validators.length ? 'too_small' : 'too_big', message, undefined, undefined, bounds);
        }

        const out = new Array(validators.length);
        const issues: ValidationIssue[] = [];
        for (let i = 0; i < validators.length; i++) {
            try {
                out[i] = validators[i](value[i]);
            } catch (e) {
                const message = e instanceof Error ? e.message : String(e);
                const path = `[${i}]`;
                issues.push(makeIssue('custom', path, `Validation failed at "${path}": ${message}`));
            }
        }
        if (issues.length > 0) throw new TyperError(formatIssues(issues), issues);
        return out as Out;
    };

    return describingLazy(validator, () => ({
        type: 'array',
        prefixItems: validators.map((v) => describedFragment(v)),
        minItems: validators.length,
        maxItems: validators.length,
    }));
};
