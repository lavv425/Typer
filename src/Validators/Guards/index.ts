import { assertArray, assertBoolean, assertNumber, assertObject, assertString } from "../../Core/Checkers";

/**
 * Type guards and the `as*` asserting coercers.
 *
 * The `is*` members here are boolean type guards; the `as*` members assert
 * and return. One export each, moved out of the class unchanged.
 */

/**
 * Type-safe string validation
 * @param {unknown} value - The value to check
 * @returns {value is string} Type guard for string
 */
export const isString = (value: unknown): value is string => {
    return typeof value === 'string';
};

/**
 * Type-safe number validation
 * @param {unknown} value - The value to check
 * @returns {value is number} Type guard for number
 */
export const isNumber = (value: unknown): value is number => {
    return typeof value === 'number';
};

/**
 * Type-safe boolean validation
 * @param {unknown} value - The value to check
 * @returns {value is boolean} Type guard for boolean
 */
export const isBoolean = (value: unknown): value is boolean => {
    return typeof value === 'boolean';
};

/**
 * Type-safe array validation
 * @template T - The expected element type
 * @param {unknown} value - The value to check
 * @returns {value is T[]} Type guard for array
 */
export const isArray = <T = unknown>(value: unknown): value is T[] => {
    return Array.isArray(value);
};

/**
 * Type-safe object validation
 * @template T - The expected object type
 * @param {unknown} value - The value to check
 * @returns {value is T} Type guard for object
 */
export const isObject = <T extends Record<string, unknown> = Record<string, unknown>>(value: unknown): value is T => {
    // Mirrors the 'object' alias exactly, including the long-standing quirk
    // that `null` passes because `typeof null === 'object'`. Use
    // `isPlainObject` when you need `null` (and class instances) rejected.
    return typeof value === 'object' && !Array.isArray(value);
};

/**
 * Validates and returns a string
 * @param {unknown} value - The value to validate
 * @returns {string} The validated string
 * @throws {TypeError} If not a string
 */
export const asString = (value: unknown): string => {
    return assertString(value);
};

/**
 * Validates and returns a number
 * @param {unknown} value - The value to validate
 * @returns {number} The validated number
 * @throws {TypeError} If not a number
 */
export const asNumber = (value: unknown): number => {
    return assertNumber(value);
};

/**
 * Validates and returns a boolean
 * @param {unknown} value - The value to validate
 * @returns {boolean} The validated boolean
 * @throws {TypeError} If not a boolean
 */
export const asBoolean = (value: unknown): boolean => {
    return assertBoolean(value);
};

/**
 * Validates and returns an array
 * @template T - The expected element type
 * @param {unknown} value - The value to validate
 * @returns {T[]} The validated array
 * @throws {TypeError} If not an array
 */
export const asArray = <T = unknown>(value: unknown): T[] => {
    return assertArray<T>(value);
};

/**
 * Validates and returns an object
 * @template T - The expected object type
 * @param {unknown} value - The value to validate
 * @returns {T} The validated object
 * @throws {TypeError} If not an object
 */
export const asObject = <T extends Record<string, unknown> = Record<string, unknown>>(value: unknown): T => {
    return assertObject<T>(value);
};

/**
 * Checks that the parameter is a plain object (object literal or
 * `Object.create(null)`). Rejects class instances, arrays, dates, maps, etc.
 *
 * @template T - The expected plain object shape
 * @param {unknown} p - The parameter to check
 * @returns {T} The validated plain object
 * @throws {TypeError} If `p` is not a plain object
 */
export const isPlainObject = <T extends Record<string, unknown> = Record<string, unknown>>(p: unknown): T => {
    if (p === null || typeof p !== 'object') {
        throw new TypeError(`${p} must be a plain object, is ${p === null ? 'null' : typeof p}`);
    }
    const proto = Object.getPrototypeOf(p);
    if (proto !== null && proto !== Object.prototype) {
        throw new TypeError(`${p} must be a plain object (no class instances).`);
    }
    return p as T;
};

/**
 * Checks that the parameter is a Promise (or a thenable).
 *
 * @template T - The resolved promise type (caller-supplied)
 * @param {unknown} p - The parameter to check
 * @returns {Promise<T>} The validated promise
 * @throws {TypeError} If `p` is not a Promise/thenable
 */
export const isPromise = <T = unknown>(p: unknown): Promise<T> => {
    if (p === null || (typeof p !== 'object' && typeof p !== 'function')) {
        throw new TypeError(`${p} must be a Promise.`);
    }
    const then = (p as { then?: unknown }).then;
    if (typeof then !== 'function') {
        throw new TypeError(`${p} must be a Promise.`);
    }
    return p as Promise<T>;
};

/**
 * Checks that the parameter is an instance of the given constructor.
 * Type-safe alternative to writing `value instanceof MyClass` everywhere.
 *
 * @template T - The instance type produced by the constructor
 * @param {Function} ctor - The constructor to check against
 * @param {unknown} p - The parameter to check
 * @returns {T} The validated instance
 * @throws {TypeError} If `p` is not an instance of `ctor`
 */
export const isInstanceOf = <T>(ctor: new (...args: never[]) => T, p: unknown): T => {
    if (!(p instanceof ctor)) {
        throw new TypeError(`${p} must be an instance of ${ctor.name || 'the given constructor'}.`);
    }
    return p;
};
