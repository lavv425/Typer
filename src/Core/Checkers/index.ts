import type { TypeKey, TypeMap, TyperReturn } from "@/Types/Typer";
import { BUILTIN_PREDICATES } from "@/Core/Predicates";

/**
 * The throwing built-in type checkers, and the `isType` dispatch over them.
 *
 * Moved out of the `Typer` class unchanged. Since the predicate fast path was
 * introduced these run only to *reject* a value — every success is answered by
 * {@link BUILTIN_PREDICATES} before a checker is consulted — so they exist to
 * be the single source of the error messages.
 *
 * Every validator in the library starts by asserting a base type, which is why
 * this has to be reachable without an instance: otherwise importing `isEmail`
 * would drag the whole class in behind it.
 *
 * TODO(tech-debt): as a result their `return p` statements are unreachable for
 * built-in aliases and show as the only uncovered lines in the suite.
 * Collapsing each checker into a (predicate, message) pair would remove the
 * duplication, at the cost of rewording some errors — a breaking change
 * deliberately deferred.
 */

/**
 * Checks if the provided parameter is an array.
 * @throws {TypeError} Throws if the parameter is not an array.
 */
export const tArray = <T>(p: T): TyperReturn<T[]> => {
    if (!Array.isArray(p)) {
        throw new TypeError(`${p} must be an array, is ${typeof p}`);
    }
    return p;
};

/**
 * Checks if the provided parameter is an ArrayBuffer.
 * @throws {TypeError} Throws if the parameter is not an ArrayBuffer.
 */
export const tArrayBuffer = (p: unknown): TyperReturn<ArrayBuffer> => {
    if (!(p instanceof ArrayBuffer)) {
        throw new TypeError(`${p} must be an ArrayBuffer.`);
    }
    return p;
};

/**
 * Checks if the provided parameter is a bigint.
 * @throws {TypeError} Throws if the parameter is not a bigint.
 */
export const tBigint = (p: unknown): TyperReturn<bigint> => {
    if (typeof p !== "bigint") {
        throw new TypeError(`${p} must be a bigint, is ${typeof p}`);
    }
    return p;
};

/**
 * Checks if the provided parameter is a boolean.
 * @throws {TypeError} Throws if the parameter is not a boolean.
 */
export const tBoolean = (p: unknown): TyperReturn<boolean> => {
    if (typeof p !== "boolean") {
        throw new TypeError(`${p} must be a boolean, is ${typeof p}`);
    }
    return p;
};

/**
 * Checks if the provided parameter is a DataView.
 * @throws {TypeError} Throws if the parameter is not a DataView.
 */
export const tDataView = (p: unknown): TyperReturn<DataView> => {
    if (!(p instanceof DataView)) {
        throw new TypeError(`${p} must be a DataView.`);
    }
    return p;
};

/**
 * Checks if the provided parameter is a valid Date.
 * @throws {TypeError} Throws if the parameter is not a valid Date.
 */
export const tDate = (p: unknown): TyperReturn<Date> => {
    if (!(p instanceof Date) || isNaN(p.getTime())) {
        throw new TypeError(`${p} must be a valid Date.`);
    }
    return p;
};

/**
 * Checks if the provided parameter is a dom element.
 * @throws {TypeError} Throws if the parameter is not an instanceof HTMLElement.
 */
export const tDomElement = (p: unknown): TyperReturn<HTMLElement> => {
    if (!(p instanceof HTMLElement)) {
        throw new TypeError(`${p} must be a DOM element, is ${typeof p}`);
    }
    return p;
};

/**
 * Checks if the provided parameter is a function.
 * @throws {TypeError} Throws if the parameter is not a function.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- the `function` alias accepts any callable, by definition
export const tFunction = (p: unknown): TyperReturn<Function> => {
    if (typeof p !== "function") {
        throw new TypeError(`${p} must be a function, is ${typeof p}`);
    }
    return p;
};

/**
 * Checks if the provided parameter is a valid JSON string.
 * @throws {TypeError} Throws if the parameter is not a valid JSON string.
 */
export const tJSON = (p: unknown): TyperReturn<string> => {
    const str = isType<string>('string', p);
    try {
        JSON.parse(str);
    } catch (e: unknown) {
        throw new TypeError(`${p} must be a valid JSON string.`, { cause: e });
    }
    return str;
};

/**
 * Checks if the provided parameter is a Map.
 * @throws {TypeError} Throws if the parameter is not a Map.
 */
export const tMap = (p: unknown): TyperReturn<Map<unknown, unknown>> => {
    if (!(p instanceof Map)) {
        throw new TypeError(`${p} must be a Map.`);
    }
    return p;
};

/**
 * Checks if the provided parameter is a number.
 * @throws {TypeError} Throws if the parameter is not a number.
 */
export const tNumber = (p: unknown): TyperReturn<number> => {
    if (typeof p !== "number") {
        throw new TypeError(`${p} must be a number, is ${typeof p}`);
    }
    return p;
};

/**
 * Checks if the provided parameter is null.
 * @throws {TypeError} Throws if the parameter is not null.
 */
export const tNull = (p: unknown): TyperReturn<null> => {
    if (p !== null) {
        throw new TypeError(`${p} must be null.`);
    }
    return p;
};

/**
 * Checks if the provided parameter is a object.
 * @throws {TypeError} Throws if the parameter is not a object.
 */
export const tObject = (p: unknown): TyperReturn<object> => {
    const type = typeof p;
    if (type !== "object" || Array.isArray(p)) {
        throw new TypeError(`${p} must be a non-array object, is ${Array.isArray(p) ? 'array' : type}`);
    }
    return p as object;
};

/**
 * Checks if the provided parameter is a RegExp.
 * @throws {TypeError} Throws if the parameter is not a RegExp.
 */
export const tRegex = (p: unknown): TyperReturn<RegExp> => {
    if (!(p instanceof RegExp)) {
        throw new TypeError(`${p} must be a RegExp.`);
    }
    return p;
};

/**
 * Checks if the provided parameter is a Set.
 * @throws {TypeError} Throws if the parameter is not a Set.
 */
export const tSet = (p: unknown): TyperReturn<Set<unknown>> => {
    if (!(p instanceof Set)) {
        throw new TypeError(`${p} must be a Set.`);
    }
    return p;
};

/**
 * Checks if the provided parameter is a string.
 * @throws {TypeError} Throws if the parameter is not a string.
 */
export const tString = (p: unknown): TyperReturn<string> => {
    if (typeof p !== "string") {
        throw new TypeError(`${p} must be a string, is ${typeof p}`);
    }
    return p;
};

/**
 * Checks if the provided parameter is a symbol.
 * @throws {TypeError} Throws if the parameter is not a symbol.
 */
export const tSymbol = (p: unknown): TyperReturn<symbol> => {
    if (typeof p !== "symbol") {
        throw new TypeError(`${p} must be a symbol, is ${typeof p}`);
    }
    return p;
};

/**
 * Checks if the provided parameter is a TypedArray.
 * @throws {TypeError} Throws if the parameter is not a TypedArray.
 */
export const tTypedArray = (p: unknown): TyperReturn<ArrayBufferView> => {
    if (!ArrayBuffer.isView(p) || p instanceof DataView) {
        throw new TypeError(`${p} must be a TypedArray.`);
    }
    return p;
};

/**
 * Checks if the provided parameter is undefined.
 * @throws {TypeError} Throws if the parameter is not undefined.
 */
export const tUndefined = (p: unknown): TyperReturn<undefined> => {
    if (typeof p !== "undefined") {
        throw new TypeError(`${p} must be undefined, is ${typeof p}`);
    }
    return p;
};

/**
 * Raises the `isType` mismatch error for a value that failed a base-type
 * assertion, reusing the checker as the single source of the message.
 *
 * @param p - The value that failed.
 * @param checker - The checker whose message to raise.
 */
const mismatch = (p: unknown, checker: (value: unknown) => unknown): never => {
    try {
        checker(p);
    } catch (e: unknown) {
        throw new TypeError(`None of the types matched for ${p}: ${(e as Error).message}`, { cause: e });
    }
    /* istanbul ignore next — only reachable if a checker accepts a value its
     * caller already rejected, which would be a bug in the pair. */
    throw new TypeError(`None of the types matched for ${p}`);
};

/**
 * Base-type assertions, equivalent to `isType('string', p)` and friends but
 * reaching only the one checker they need.
 *
 * Nearly every validator in the library starts by asserting a base type. Going
 * through {@link isType} for that would pull {@link BUILTIN_CHECKERS} — and so
 * every checker in it — into any bundle that imports a single validator, which
 * measured at **589 B for `isEmail` alone**. These cost what they use.
 *
 * The messages are identical: the checker is still what produces them.
 */
export const assertString = (p: unknown): string =>
    typeof p === 'string' ? p : mismatch(p, tString);

/** @see {@link assertString} */
export const assertNumber = (p: unknown): number =>
    typeof p === 'number' ? p : mismatch(p, tNumber);

/** @see {@link assertString} */
export const assertBoolean = (p: unknown): boolean =>
    typeof p === 'boolean' ? p : mismatch(p, tBoolean);

/** @see {@link assertString} */
export const assertArray = <T = unknown>(p: unknown): T[] =>
    Array.isArray(p) ? p as T[] : mismatch(p, tArray);

/**
 * @see {@link assertString}
 *
 * Mirrors the `'object'` alias exactly, including the long-standing quirk that
 * `null` passes because `typeof null === 'object'`.
 */
export const assertObject = <T = object>(p: unknown): T =>
    typeof p === 'object' && !Array.isArray(p) ? p as T : mismatch(p, tObject);

/**
 * The alias → throwing checker map for the built-in types.
 *
 * Null-prototype, so a lookup can never resolve to an inherited
 * `Object.prototype` member: `'constructor'` must be an unknown alias.
 */
export const BUILTIN_CHECKERS: Readonly<Record<string, (value: unknown) => unknown>> = /*#__PURE__*/ Object.assign(
    Object.create(null) as Record<string, (value: unknown) => unknown>,
    {
        'a': tArray, 'arr': tArray, 'array': tArray,
        'ab': tArrayBuffer, 'arr_buff': tArrayBuffer, 'array_buffer': tArrayBuffer,
        'ta': tTypedArray, 'typ_arr': tTypedArray, 'typed_array': tTypedArray,
        'bi': tBigint, 'bint': tBigint, 'bigint': tBigint,
        'b': tBoolean, 'bool': tBoolean, 'boolean': tBoolean,
        'dt': tDate, 'date': tDate,
        'dv': tDataView, 'dt_v': tDataView, 'data_view': tDataView,
        'dom': tDomElement, 'domel': tDomElement, 'domelement': tDomElement,
        'f': tFunction, 'funct': tFunction, 'function': tFunction,
        'j': tJSON, 'json': tJSON,
        'map': tMap,
        'n': tNumber, 'num': tNumber, 'number': tNumber,
        'null': tNull,
        'o': tObject, 'obj': tObject, 'object': tObject,
        'reg': tRegex, 'regex': tRegex, 'regexp': tRegex,
        'set': tSet,
        's': tString, 'str': tString, 'string': tString,
        'sym': tSymbol, 'symbol': tSymbol,
        'u': tUndefined, 'undef': tUndefined, 'undefined': tUndefined, 'void': tUndefined,
    },
);

/**
 * Asserts that a value matches one of the given **built-in** aliases, and
 * returns it typed.
 *
 * The instance-free counterpart of `Typer#isType`, and byte-for-byte
 * compatible with it on the built-ins. It does not consult a custom registry —
 * the class keeps its own dispatch for that — because the validators that call
 * this only ever assert base types.
 *
 * @template T - The expected type
 * @param types - The alias, or aliases, to accept.
 * @param p - The value to check.
 * @returns The value, typed.
 * @throws {TypeError} If the value matches none of them.
 */
export function isType<K extends TypeKey>(types: K | readonly K[], p: unknown): TypeMap[K];
export function isType<T = unknown>(types: string | readonly string[], p: unknown): T;
export function isType<T = unknown>(types: string | readonly string[], p: unknown): T {
    // Fast path: single-string input — no array allocation, no try/catch
    // unless validation actually fails.
    if (typeof types === 'string') {
        const norm = types.toLowerCase().trim();
        const pred = BUILTIN_PREDICATES[norm];
        if (pred !== undefined && pred(p)) return p as T;

        const checker = BUILTIN_CHECKERS[norm];
        if (checker === undefined) throw new Error(`Unknown type: ${types}`);

        try {
            checker(p);
            /* istanbul ignore next — defensive: predicate said no but checker
             * said yes. They are kept in sync, so this is unreachable. */
            return p as T;
        } catch (e: unknown) {
            throw new TypeError(`None of the types matched for ${p}: ${(e as Error).message}`, { cause: e });
        }
    }

    // Multi-type input: try each predicate in order; only collect error
    // messages once we know all of them missed.
    for (let i = 0; i < types.length; i++) {
        const pred = BUILTIN_PREDICATES[types[i].toLowerCase().trim()];
        if (pred !== undefined && pred(p)) return p as T;
    }

    const errors: string[] = [];
    for (let i = 0; i < types.length; i++) {
        const checker = BUILTIN_CHECKERS[types[i].toLowerCase().trim()];
        if (checker === undefined) throw new Error(`Unknown type: ${types[i]}`);
        try { checker(p); return p as T; }
        catch (e: unknown) { errors.push((e as Error).message); }
    }
    throw new TypeError(`None of the types matched for ${p}: ${errors.join(', ')}`);
}
