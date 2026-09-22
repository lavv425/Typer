import { describing } from "@/Constants/Symbols";
import { assertNumber } from "@/Core/Checkers";
import { issueError } from "@/Utils/Issues";

/**
 * Numeric validators: integers, sign, finiteness, safe range, ports and
 * explicit bounds.
 *
 * One export each. Moved out of the class unchanged.
 */

/**
 * Checks if the provided parameter is an integer.
 * 
 * @param {unknown} p - The parameter to check.
 * @returns {number} The validated integer
 * @throws {TypeError} Throws if the parameter is not an integer.
 * @example
 * const count = typer.isInteger(42); // count: number
 */
export const isInteger = /*#__PURE__*/ describing((p: unknown): number => {
    const num = assertNumber(p);
    if (!Number.isInteger(num)) {
        throw issueError('invalid_format', `${p} must be an integer.`, 'integer');
    }
    return num;
}, { type: 'integer' });

/**
 * Checks if the provided parameter is a number within a specified range.
 * 
 * @param {number} min - The minimum value.
 * @param {number} max - The maximum value.
 * The failing value is **not** in the error message: a numeric range is
 * exactly what guards PINs, one-time codes and amounts, and the message is
 * what ends up in application logs. It is on the issue's `value` field
 * instead, for callers that want to show it.
 *
 * @param {unknown} p - The parameter to check.
 * @returns {number} The validated number
 * @throws {TyperError} Throws if the parameter is not a number within the specified range.
 * @example
 * const age = typer.isInRange(18, 65, 25); // age: number
 */
export const isInRange = (min: number, max: number, p: unknown): number => {
    const num = assertNumber(p);
    // Split so the issue says which end of the range was missed.
    const message = `value must be between ${min} and ${max}`;
    const meta = { minimum: min, maximum: max, value: num };
    if (num < min) throw issueError('too_small', message, `${min}..${max}`, 'number', meta);
    if (num > max) throw issueError('too_big', message, `${min}..${max}`, 'number', meta);
    return num;
};

/**
 * Checks if the provided parameter is a positive number.
 * 
 * @param {unknown} p - The parameter to check.
 * @returns {number} The validated positive number
 * @throws {TypeError} Throws if the parameter is not a positive number.
 * @example
 * const value = typer.isPositiveNumber(10); // value: number
 */
export const isPositiveNumber = /*#__PURE__*/ describing((p: unknown): number => {
    const num = assertNumber(p);
    if (num < 0) {
        throw issueError('too_small', `${p} must be a positive number.`, undefined, undefined, { minimum: 0 });
    }
    return num;
}, { type: 'number', minimum: 0 });

/**
 * Checks if the provided parameter is a positive integer.
 * 
 * @param {unknown} p - The parameter to check.
 * @returns {number} The validated positive integer
 * @throws {TypeError} Throws if the parameter is not a positive integer.
 * @example
 * const count = typer.isPositiveInteger(42); // count: number
 */
export const isPositiveInteger = /*#__PURE__*/ describing((p: unknown): number => {
    const num = isInteger(p);
    if (num < 0) {
        throw issueError('too_small', `${p} must be a positive integer.`, undefined, undefined, { minimum: 0 });
    }
    return num;
}, { type: 'integer', minimum: 0 });

/**
 * Checks if the provided parameter is a negative number.
 * 
 * @param {unknown} p - The parameter to check.
 * @returns {number} The validated negative number
 * @throws {TypeError} Throws if the parameter is not a negative number.
 * @example
 * const value = typer.isNegativeNumber(-10); // value: number
 */
export const isNegativeNumber = /*#__PURE__*/ describing((p: unknown): number => {
    const num = assertNumber(p);
    if (num >= 0) {
        throw issueError('too_big', `${p} must be a negative number.`);
    }
    return num;
}, { type: 'number', exclusiveMaximum: 0 });

/**
 * Checks if the provided parameter is a negative integer.
 * 
 * @param {unknown} p - The parameter to check.
 * @returns {number} The validated negative integer
 * @throws {TypeError} Throws if the parameter is not a negative integer.
 * @example
 * const count = typer.isNegativeInteger(-42); // count: number
 */
export const isNegativeInteger = /*#__PURE__*/ describing((p: unknown): number => {
    const num = isInteger(p);
    if (num >= 0) {
        throw issueError('too_big', `${p} must be a negative integer.`, undefined, undefined, { maximum: -1 });
    }
    return num;
}, { type: 'integer', maximum: -1 });

/**
 * Checks that the parameter is a finite number (rejects `NaN` and `Infinity`).
 * Stricter than `isType("number", x)`, which accepts `NaN` for compatibility
 * with `typeof x === "number"`.
 *
 * @param {unknown} p - The parameter to check
 * @returns {number} The validated finite number
 * @throws {TypeError} If `p` is not a finite number
 */
export const isFiniteNumber = /*#__PURE__*/ describing((p: unknown): number => {
    const num = assertNumber(p);
    if (!Number.isFinite(num)) {
        throw issueError('invalid_format', `${p} must be a finite number.`, 'finite number');
    }
    return num;
}, { type: 'number' });

/**
 * Checks that the parameter is a safe integer (within `Number.MIN_SAFE_INTEGER`
 * and `Number.MAX_SAFE_INTEGER`).
 *
 * @param {unknown} p - The parameter to check
 * @returns {number} The validated safe integer
 * @throws {TypeError} If `p` is not a safe integer
 */
export const isSafeInteger = /*#__PURE__*/ describing((p: unknown): number => {
    const num = assertNumber(p);
    if (!Number.isSafeInteger(num)) {
        throw issueError('invalid_format', `${p} must be a safe integer.`, 'safe integer');
    }
    return num;
}, { type: 'integer' });

/**
 * Checks that the parameter is a valid TCP/UDP port number (1–65535).
 *
 * Port 0 is rejected: it is reserved and never a valid destination.
 *
 * @param {unknown} p - The parameter to check
 * @returns {number} The validated port
 * @throws {TypeError} If `p` is not an integer in range
 * @example
 * typer.isPort(8080);
 */
export const isPort = /*#__PURE__*/ describing((p: unknown): number => {
    const num = isInteger(p);
    const message = `${p} must be a valid port number (1-65535).`;
    const bounds = { minimum: 1, maximum: 65535 };
    if (num < 1) throw issueError('too_small', message, undefined, undefined, bounds);
    if (num > 65535) throw issueError('too_big', message, undefined, undefined, bounds);
    return num;
}, { type: 'integer', minimum: 1, maximum: 65535 });
