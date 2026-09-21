import { assertArray } from "../../Core/Checkers";
import { getType } from "../../Core/Predicates";
import { issueError } from "../../Utils/Issues";

/**
 * Size and membership validators: length bounds, emptiness, and the
 * one-of check.
 *
 * One export each. Moved out of the class unchanged.
 */

/**
 * Checks that the length of a string or array falls within the given bounds.
 *
 * @template T - Either `string` or an array type
 * @param {{ min?: number, max?: number }} bounds - Inclusive length bounds
 * @param {unknown} p - The parameter to check (string or array)
 * @returns {T} The validated value
 * @throws {TypeError} If `p` is not a string/array or its length is out of range
 */
export const isLength = <T extends string | readonly unknown[]>(bounds: { min?: number; max?: number }, p: unknown): T => {
    if (typeof p !== 'string' && !Array.isArray(p)) {
        throw new TypeError(`${p} must be a string or array, is ${getType(p)}`);
    }
    const length = (p as string | unknown[]).length;
    const { min, max } = bounds;
    if (min !== undefined && length < min) {
        throw issueError('too_small', `length must be >= ${min}, is ${length}`, undefined, undefined, { minimum: min });
    }
    if (max !== undefined && length > max) {
        throw issueError('too_big', `length must be <= ${max}, is ${length}`, undefined, undefined, { maximum: max });
    }
    return p as T;
};

/**
 * Checks that the parameter is "empty": empty string (after trim), empty
 * array, empty Map/Set, or object with no own enumerable keys.
 *
 * @param {unknown} p - The parameter to check
 * @returns {unknown} The validated empty value
 * @throws {TypeError} If `p` is not empty or not a supported container
 */
export const isEmpty = (p: unknown): unknown => {
    if (typeof p === 'string') {
        if (p.trim().length !== 0) throw issueError('too_big', `string must be empty.`, undefined, undefined, { maximum: 0 });
        return p;
    }
    if (Array.isArray(p)) {
        if (p.length !== 0) throw issueError('too_big', `array must be empty.`, undefined, undefined, { maximum: 0 });
        return p;
    }
    if (p instanceof Map || p instanceof Set) {
        if (p.size !== 0) throw issueError('too_big', `${p.constructor.name} must be empty.`, undefined, undefined, { maximum: 0 });
        return p;
    }
    if (p !== null && typeof p === 'object') {
        if (Object.keys(p).length !== 0) throw issueError('too_big', `object must have no own keys.`, undefined, undefined, { maximum: 0 });
        return p;
    }
    throw new TypeError(`${p} is not a container that can be checked for emptiness.`);
};

/**
 * Inverse of `isEmpty`: checks the parameter is a non-empty string, array,
 * Map, Set, or object.
 *
 * @template T - Caller-supplied container type for narrower inference
 * @param {unknown} p - The parameter to check
 * @returns {T} The validated non-empty value
 * @throws {TypeError} If `p` is empty or not a supported container
 */
export const isNonEmpty = <T = unknown>(p: unknown): T => {
    if (typeof p === 'string') {
        if (p.trim().length === 0) throw issueError('too_small', `string must be non-empty.`, undefined, undefined, { minimum: 1 });
        return p as T;
    }
    if (Array.isArray(p)) {
        if (p.length === 0) throw issueError('too_small', `array must be non-empty.`, undefined, undefined, { minimum: 1 });
        return p as T;
    }
    if (p instanceof Map || p instanceof Set) {
        if (p.size === 0) throw issueError('too_small', `${p.constructor.name} must be non-empty.`, undefined, undefined, { minimum: 1 });
        return p as T;
    }
    if (p !== null && typeof p === 'object') {
        if (Object.keys(p).length === 0) throw issueError('too_small', `object must have at least one own key.`, undefined, undefined, { minimum: 1 });
        return p as T;
    }
    throw new TypeError(`${p} is not a container that can be checked for non-emptiness.`);
};

/**
 * Checks if the provided parameter is a non-empty array.
 * 
 * @template T - The expected element type
 * @param {unknown} p - The parameter to check.
 * @returns {T[]} The validated non-empty array
 * @throws {TypeError} Throws if the parameter is not a non-empty array.
 * @example
 * const items = typer.isNonEmptyArray<string>(["a", "b"]); // items: string[]
 */
export const isNonEmptyArray = <T = unknown>(p: unknown): T[] => {
    const arr = assertArray<T>(p);
    if (arr.length === 0) {
        throw issueError('too_small', `${p} must be a non-empty array.`, undefined, undefined, { minimum: 1 });
    }
    return arr;
};

/**
 * Checks if the provided parameter is one of the specified values.
 * 
 * @template T - The expected type of the values
 * @param {T[]} values - The values to check against.
 * @param {unknown} p - The parameter to check.
 * @returns {T} The validated value
 * @throws {TypeError} Throws if the parameter is not one of the specified values.
 * @example
 * const color = typer.isOneOf(["red", "blue", "green"] as const, "blue"); // color: "red" | "blue" | "green"
 */
export const isOneOf = <T>(values: readonly T[], p: unknown): T => {
    if (!values.includes(p as T)) {
        throw new TypeError(`${p} must be one of [${values.join(', ')}], is ${p}`);
    }
    return p as T;
};
