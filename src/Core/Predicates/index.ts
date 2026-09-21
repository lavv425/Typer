/**
 * Boolean predicates for the built-in type aliases, and the type-naming helper
 * that error messages use.
 *
 * Moved out of the `Typer` class unchanged. They never depended on instance
 * state — the class rebuilt an identical map in every constructor — so they are
 * built once here instead, and the schema compiler can reach them without an
 * instance.
 *
 * The map is created with a `null` prototype so a lookup can never resolve to
 * `Object.prototype.toString` and friends: `'constructor'` must be an unknown
 * alias, not a function.
 */

/** A boolean type test for one alias. */
export type Predicate = (value: unknown) => boolean;

/**
 * Builds the alias → predicate map.
 *
 * Each predicate is a small closure that never throws, on the happy path or
 * the miss path — which is what lets `is()` and `isType()` skip the throw/catch
 * dance the legacy checker functions require.
 */
const build = (): Record<string, Predicate> => {
    const map: Record<string, Predicate> = Object.create(null);

    const isString = (v: unknown): boolean => typeof v === 'string';
    for (const k of ['s', 'str', 'string']) map[k] = isString;

    const isNumber = (v: unknown): boolean => typeof v === 'number';
    for (const k of ['n', 'num', 'number']) map[k] = isNumber;

    const isBoolean = (v: unknown): boolean => typeof v === 'boolean';
    for (const k of ['b', 'bool', 'boolean']) map[k] = isBoolean;

    const isBigint = (v: unknown): boolean => typeof v === 'bigint';
    for (const k of ['bi', 'bint', 'bigint']) map[k] = isBigint;

    const isSymbol = (v: unknown): boolean => typeof v === 'symbol';
    for (const k of ['sym', 'symbol']) map[k] = isSymbol;

    const isUndefined = (v: unknown): boolean => typeof v === 'undefined';
    for (const k of ['u', 'undef', 'undefined', 'void']) map[k] = isUndefined;

    const isFunction = (v: unknown): boolean => typeof v === 'function';
    for (const k of ['f', 'funct', 'function']) map[k] = isFunction;

    map['null'] = (v: unknown): boolean => v === null;

    const isArrayPred: Predicate = Array.isArray;
    for (const k of ['a', 'arr', 'array']) map[k] = isArrayPred;

    // Matches tObject: typeof === 'object' && !Array.isArray (null passes,
    // matching legacy behavior documented in the test suite).
    const isObjectPred = (v: unknown): boolean => typeof v === 'object' && !Array.isArray(v);
    for (const k of ['o', 'obj', 'object']) map[k] = isObjectPred;

    const isDate = (v: unknown): boolean => v instanceof Date && !Number.isNaN(v.getTime());
    for (const k of ['dt', 'date']) map[k] = isDate;

    const isRegex = (v: unknown): boolean => v instanceof RegExp;
    for (const k of ['reg', 'regex', 'regexp']) map[k] = isRegex;

    map['map'] = (v: unknown): boolean => v instanceof Map;
    map['set'] = (v: unknown): boolean => v instanceof Set;

    const isAB = (v: unknown): boolean => v instanceof ArrayBuffer;
    for (const k of ['ab', 'arr_buff', 'array_buffer']) map[k] = isAB;

    const isDV = (v: unknown): boolean => v instanceof DataView;
    for (const k of ['dv', 'dt_v', 'data_view']) map[k] = isDV;

    const isTA = (v: unknown): boolean => ArrayBuffer.isView(v) && !(v instanceof DataView);
    for (const k of ['ta', 'typ_arr', 'typed_array']) map[k] = isTA;

    // DOM predicate guards typeof to avoid ReferenceError in Node. On miss
    // in `isType()`, the legacy throwing checker is still used to surface
    // the original "HTMLElement is not defined" message (see test suite).
    const isDom = (v: unknown): boolean =>
        typeof HTMLElement !== 'undefined' && v instanceof HTMLElement;
    for (const k of ['dom', 'domel', 'domelement']) map[k] = isDom;

    const isJSON = (v: unknown): boolean => {
        if (typeof v !== 'string') return false;
        try { JSON.parse(v); return true; } catch { return false; }
    };
    for (const k of ['j', 'json']) map[k] = isJSON;

    return map;
};

/**
 * The built-in alias → predicate map.
 *
 * Shared rather than per-instance: it is never mutated. A `Typer` that
 * overrides a built-in with `registerType(name, fn, true)` is handled by the
 * resolver, which checks the registration before reaching for this map.
 */
export const BUILTIN_PREDICATES: Readonly<Record<string, Predicate>> = build();

/**
 * Names the runtime type of a value for an error message.
 *
 * Narrower than `typeof`, which reports `"object"` for arrays, dates, maps,
 * sets, regexes and `null` alike — the distinctions a `received` field exists
 * to make.
 *
 * @param value - The value to describe.
 */
export const getType = (value: unknown): string => {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    if (value instanceof Date) return "date";
    if (value instanceof RegExp) return "regexp";
    if (value instanceof Map) return "map";
    if (value instanceof Set) return "set";
    return typeof value;
};
