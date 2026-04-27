"use strict";

import type { Error } from "./Types/Globals";
import type { Infer, ParseResult, Schema, StructureValidationReturn, TypeKey, TypeMap, TyperExpectTypes, TyperReturn, Validator } from "./Types/Typer";

/**
 * Class representing a type checker.
 * Version: 3.2.3
 * @author Michael Lavigna - <https://michaellavigna.com> - <michael.lavigna@hotmail.it>
 * @since 3.2.3
 */
export class Typer {
    /**
     * @private
     * @type {Record<string, (value: unknown) => unknown>}
     * Stores the type validation functions
     */
    private typesMap: Record<string, (value: unknown) => unknown>;

    /**
     * @private
     * Fast boolean predicates for built-in type aliases. Used by `is()` and
     * `isType()` to avoid throw/catch on the happy path and to skip the
     * `typesMap` lookup entirely. Custom types registered via `registerType`
     * have no predicate here and fall back to a wrapped checker via
     * `predCache`.
     */
    private builtinPredicates!: Record<string, (value: unknown) => boolean>;

    /**
     * @private
     * Cache of resolved predicates keyed by the *raw* input string the user
     * passed (preserving case/whitespace). Subsequent calls with the same
     * literal skip normalization (`toLowerCase().trim()`) and lookup.
     * `null` marks a known-unknown type so we throw fast.
     */
    private predCache: Map<string, ((value: unknown) => boolean) | null> = new Map();

    /**
     * creates the types mapping
     * type-->function
     */
    constructor() {
        /**
         * @private
         * @type {Record<string, Function>}
         */
        this.typesMap = {
            'a': this.tArray,
            'arr': this.tArray,
            'array': this.tArray,
            'ab': this.tArrayBuffer,
            'arr_buff': this.tArrayBuffer,
            'array_buffer': this.tArrayBuffer,
            'ta': this.tTypedArray,
            'typ_arr': this.tTypedArray,
            'typed_array': this.tTypedArray,
            'bi': this.tBigint,
            'bint': this.tBigint,
            'bigint': this.tBigint,
            'b': this.tBoolean,
            'bool': this.tBoolean,
            'boolean': this.tBoolean,
            'dt': this.tDate,
            'date': this.tDate,
            'dv': this.tDataView,
            'dt_v': this.tDataView,
            'data_view': this.tDataView,
            'dom': this.tDomElement,
            'domel': this.tDomElement,
            'domelement': this.tDomElement,
            'f': this.tFunction,
            'funct': this.tFunction,
            'function': this.tFunction,
            'j': this.tJSON,
            'json': this.tJSON,
            'map': this.tMap,
            'n': this.tNumber,
            'num': this.tNumber,
            'number': this.tNumber,
            'null': this.tNull,
            'o': this.tObject,
            'obj': this.tObject,
            'object': this.tObject,
            'reg': this.tRegex,
            'regex': this.tRegex,
            'regexp': this.tRegex,
            'set': this.tSet,
            's': this.tString,
            'str': this.tString,
            'string': this.tString,
            'sym': this.tSymbol,
            'symbol': this.tSymbol,
            'u': this.tUndefined,
            'undef': this.tUndefined,
            'undefined': this.tUndefined,
            'void': this.tUndefined,
        };

        this.builtinPredicates = this.buildBuiltinPredicates();
    }

    /**
     * Builds the fast-path boolean predicate map for built-in aliases.
     * Each predicate is a small closure with no throw on the happy or miss
     * path — `is()` and `isType()` use these to skip the throw/catch dance
     * required by the legacy checker functions in `typesMap`.
     */
    private buildBuiltinPredicates(): Record<string, (value: unknown) => boolean> {
        const map: Record<string, (value: unknown) => boolean> = Object.create(null);

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

        const isArrayPred: (v: unknown) => boolean = Array.isArray;
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
    }

    /**
     * Resolves and caches a predicate for the given raw type string.
     * Returns a fast predicate from `builtinPredicates` when available, or a
     * wrapper around the registered checker (with try/catch absorbed once)
     * for custom types. Throws once on unknown types and caches the negative
     * result so subsequent calls fail fast.
     */
    private getPred(rawType: string): (value: unknown) => boolean {
        const cached = this.predCache.get(rawType);
        if (cached !== undefined) {
            if (cached === null) throw new Error(`Unknown type: ${rawType}`);
            return cached;
        }
        const norm = rawType.toLowerCase().trim();
        const pred = this.builtinPredicates[norm];
        if (pred) {
            this.predCache.set(rawType, pred);
            return pred;
        }
        const checker = this.typesMap[norm];
        if (!checker) {
            this.predCache.set(rawType, null);
            throw new Error(`Unknown type: ${rawType}`);
        }
        // Custom type — wrap the throwing checker into a boolean predicate.
        const wrapped = (v: unknown): boolean => {
            try { checker.call(this, v); return true; } catch { return false; }
        };
        this.predCache.set(rawType, wrapped);
        return wrapped;
    }

    /**
     * Register a new type in the typesMap.
     * @template T - The input type that the validator expects
     * @template R - The return type that the validator produces
     * @param {string} name - The name of the new type.
     * @param {(value: T) => R} validator - The function to validate the type.
     * @param {boolean} override - Whether to override the original configuration
     * @throws {Error} If the type name is already registered.
     * @example
     * // Register a positive number validator
     * typer.registerType<unknown, number>("positive", (value) => {
     *    if (typeof value !== "number" || value <= 0) throw new TypeError("Must be positive");
     *    return value;
     * });
     * 
     * // Register a string length validator
     * typer.registerType<unknown, string>("longString", (value) => {
     *    if (typeof value !== "string" || value.length < 10) throw new TypeError("Must be long string");
     *    return value;
     * });
     */
    public registerType<T = unknown, R = T>(name: string, validator: (value: T) => R, override = false): void {
        const typeKey = name.toLowerCase().trim();
        if (this.typesMap[typeKey] && !override) {
            throw new Error(`Type "${name}" is already registered.`);
        }
        // Type assertion needed to store generic validator in the map
        this.typesMap[typeKey] = validator as (value: unknown) => unknown;
        // Invalidate the predicate cache: prior negative ("unknown") entries
        // and prior overrides must not leak.
        this.predCache.clear();
    }

    /**
     * Unregister a type from the typesMap.
     * @param {string} name - The name of the type to remove.
     * @throws {Error} If the type does not exist.
     * @example
     * Typer.unregisterType("positive");
     */
    public unregisterType(name: string): void {
        const typeKey = name.toLowerCase().trim();
        if (!this.typesMap[typeKey]) {
            throw new Error(`Type "${name}" is not registered.`);
        }
        delete this.typesMap[typeKey];
        this.predCache.clear();
    }

    /**
     * Get all registered types.
     * @returns {string[]} An array of registered type names.
     * @example
     * console.log(Typer.listTypes()); // ["array", "number", "string", "boolean"]
     */
    public listTypes(): string[] {
        return Object.keys(this.typesMap);
    }

    /**
     * Exports all registered types as a JSON string.
     * @returns {string} The serialized types.
     * @example
     * console.log(Typer.exportTypes()); // '["array","number","string","boolean"]'
     */
    public exportTypes(): string {
        return JSON.stringify(Object.keys(this.typesMap));
    }

    /**
     * Imports types from a JSON string.
     * @param {string} json - The JSON string containing type names.
     * @example
     * Typer.importTypes('["customType"]');
     */
    public importTypes(json: string): void {
        const types = JSON.parse(json);
        if (!Array.isArray(types)) throw new Error("Invalid type list");

        types.forEach(type => {
            if (!this.typesMap[type]) {
                console.warn(`[Typer] Unknown type in import: ${type}`);
            }
        });
    }

    /**
     * Checks if the provided parameter is an array.
     * @private
     * @param {T} p - The parameter to check.
     * @returns {TyperReturn<T[]>|void}
     * @throws {TypeError} Throws if the parameter is not an array.
     */
    private tArray<T>(p: T): TyperReturn<T[]> {
        if (!Array.isArray(p)) {
            throw new TypeError(`${p} must be an array, is ${typeof p}`);
        }
        return p;
    }

    /**
     * Checks if the provided parameter is an ArrayBuffer.
     * 
     * @param {unknown} p - The parameter to check.
     * @returns {ArrayBuffer|void}
     * @throws {TypeError} Throws if the parameter is not an ArrayBuffer.
     */
    private tArrayBuffer(p: unknown): TyperReturn<ArrayBuffer> {
        if (!(p instanceof ArrayBuffer)) {
            throw new TypeError(`${p} must be an ArrayBuffer.`);
        }
        return p;
    }

    /**
     * Checks if the provided parameter is a bigint.
     * @private
     * @param {unknown} p - The parameter to check.
     * @returns {Bigint|void}
     * @throws {TypeError} Throws if the parameter is not a bigint.
     */
    private tBigint(p: unknown): TyperReturn<bigint> {
        if (typeof p !== "bigint") {
            throw new TypeError(`${p} must be a bigint, is ${typeof p}`);
        }
        return p;
    }

    /**
     * Checks if the provided parameter is a boolean.
     * @private
     * @param {unknown} p - The parameter to check.
     * @returns {Boolean|void}
     * @throws {TypeError} Throws if the parameter is not a boolean.
     */
    private tBoolean(p: unknown): TyperReturn<boolean> {
        if (typeof p !== "boolean") {
            throw new TypeError(`${p} must be a boolean, is ${typeof p}`);
        }
        return p;
    }

    /**
     * Checks if the provided parameter is a DataView.
     * 
     * @param {unknown} p - The parameter to check.
     * @returns {DataView|void}
     * @throws {TypeError} Throws if the parameter is not a DataView.
     */
    private tDataView(p: unknown): TyperReturn<DataView> {
        if (!(p instanceof DataView)) {
            throw new TypeError(`${p} must be a DataView.`);
        }
        return p;
    }

    /**
     * Checks if the provided parameter is a valid Date.
     * 
     * @param {unknown} p - The parameter to check.
     * @returns {Date}
     * @throws {TypeError} Throws if the parameter is not a valid Date.
     */
    private tDate(p: unknown): TyperReturn<Date> {
        if (!(p instanceof Date) || isNaN(p.getTime())) {
            throw new TypeError(`${p} must be a valid Date.`);
        }
        return p;
    }

    /**
     * Checks if the provided parameter is a dom element.
     * @private
     * @param {unknown} p - The parameter to check.
     * @returns {HTMLElement|void}
     * @throws {TypeError} Throws if the parameter is not an instanceof HTMLElement.
     */
    private tDomElement(p: unknown): TyperReturn<HTMLElement> {
        if (!(p instanceof HTMLElement)) {
            throw new TypeError(`${p} must be a DOM element, is ${typeof p}`);
        }
        return p;
    }

    /**
     * Checks if the provided parameter is a function.
     * @private
     * @param {unknown} p - The parameter to check.
     * @returns {Function|void}
     * @throws {TypeError} Throws if the parameter is not a function.
     */
    private tFunction(p: unknown): TyperReturn<Function> {
        if (typeof p !== "function") {
            throw new TypeError(`${p} must be a function, is ${typeof p}`);
        }
        return p as Function;
    }

    /**
     * Checks if the provided parameter is a valid JSON string.
     * 
     * @param {unknown} p - The parameter to check.
     * @returns {string|void}
     * @throws {TypeError} Throws if the parameter is not a valid JSON string.
     */
    private tJSON(p: unknown): TyperReturn<string> {
        const str = this.isType('string', p) as string;
        try {
            JSON.parse(str);
        } catch (e: unknown) {
            throw new TypeError(`${p} must be a valid JSON string.`);
        }
        return str;
    }

    /**
     * Checks if the provided parameter is a Map.
     * 
     * @param {unknown} p - The parameter to check.
     * @returns {Map|void}
     * @throws {TypeError} Throws if the parameter is not a Map.
     */
    private tMap(p: unknown): TyperReturn<Map<unknown, unknown>> {
        if (!(p instanceof Map)) {
            throw new TypeError(`${p} must be a Map.`);
        }
        return p;
    }

    /**
     * Checks if the provided parameter is a number.
     * @private
     * @param {unknown} p - The parameter to check.
     * @returns {number|void}
     * @throws {TypeError} Throws if the parameter is not a number.
     */
    private tNumber(p: unknown): TyperReturn<number> {
        if (typeof p !== "number") {
            throw new TypeError(`${p} must be a number, is ${typeof p}`);
        }
        return p;
    }

    /**
     * Checks if the provided parameter is not null.
     * 
     * @param {unknown} p - The parameter to check.
     * @returns {null|void}
     * @throws {TypeError} Throws if the parameter is null.
     */
    private tNull(p: unknown): TyperReturn<null> {
        if (p !== null) {
            throw new TypeError(`${p} must be null.`);
        }
        return p;
    }

    /**
     * Checks if the provided parameter is a object.
     * @private
     * @param {unknown} p - The parameter to check.
     * @returns {object|void}
     * @throws {TypeError} Throws if the parameter is not a object.
     */
    private tObject(p: unknown): TyperReturn<object> {
        const type = typeof p;
        if (type !== "object" || Array.isArray(p)) {
            throw new TypeError(`${p} must be a non-array object, is ${Array.isArray(p) ? 'array' : type}`);
        }
        return p as object;
    }

    /**
     * Checks if the provided parameter is a RegExp.
     * 
     * @param {unknown} p - The parameter to check.
     * @returns {RegExp|void}
     * @throws {TypeError} Throws if the parameter is not a RegExp.
     */
    private tRegex(p: unknown): TyperReturn<RegExp> {
        if (!(p instanceof RegExp)) {
            throw new TypeError(`${p} must be a RegExp.`);
        }
        return p;
    }

    /**
     * Checks if the provided parameter is a Set.
     * 
     * @param {unknown} p - The parameter to check.
     * @returns {Set|void}
     * @throws {TypeError} Throws if the parameter is not a Set.
     */
    private tSet(p: unknown): TyperReturn<Set<unknown>> {
        if (!(p instanceof Set)) {
            throw new TypeError(`${p} must be a Set.`);
        }
        return p;
    }

    /**
     * Checks if the provided parameter is a string.
     * @private
     * @param {unknown} p - The parameter to check.
     * @returns {string|void}
     * @throws {TypeError} Throws if the parameter is not a string.
     */
    private tString(p: unknown): TyperReturn<string> {
        if (typeof p !== "string") {
            throw new TypeError(`${p} must be a string, is ${typeof p}`);
        }
        return p;
    }

    /**
     * Checks if the provided parameter is a symbol.
     * @private
     * @param {unknown} p - The parameter to check.
     * @returns {Symbol|void}
     * @throws {TypeError} Throws if the parameter is not a symbol.
     */
    private tSymbol(p: unknown): TyperReturn<symbol> {
        if (typeof p !== "symbol") {
            throw new TypeError(`${p} must be a symbol, is ${typeof p}`);
        }
        return p;
    }

    /**
     * Checks if the provided parameter is a TypedArray.
     * 
     * @param {unknown} p - The parameter to check.
     * @returns {TypedArray|void}
     * @throws {TypeError} Throws if the parameter is not a TypedArray.
     */
    private tTypedArray(p: unknown): TyperReturn<ArrayBufferView> {
        if (!ArrayBuffer.isView(p) || p instanceof DataView) {
            throw new TypeError(`${p} must be a TypedArray.`);
        }
        return p;
    }

    /**
     * Checks if the provided parameter is undefined.
     * @private
     * @param {unknown} p - The parameter to check.
     * @returns {undefined|void}
     * @throws {TypeError} Throws if the parameter is not undefined.
     */
    private tUndefined(p: unknown): TyperReturn<undefined> {
        if (typeof p !== "undefined") {
            throw new TypeError(`${p} must be undefined, is ${typeof p}`);
        }
        return p;
    }

    private getType(value: unknown): string {
        if (value === null) return "null";
        if (Array.isArray(value)) return "array";
        if (value instanceof Date) return "date";
        if (value instanceof RegExp) return "regexp";
        if (value instanceof Map) return "map";
        if (value instanceof Set) return "set";
        return typeof value;
    }

    /**
     * Checks if the provided parameter is an array of a specified type.
     * 
     * @template T - The expected element type
     * @param {string} elementType - The type of elements that the array should contain.
     * @param {unknown} p - The parameter to check.
     * @returns {T[]} Typed array of elements
     * @throws {TypeError} Throws if the parameter is not an array of the specified type.
     * @example
     * const numbers = typer.isArrayOf<number>("number", [1, 2, 3]); // numbers: number[]
     * const strings = typer.isArrayOf<string>("string", ["a", "b"]); // strings: string[]
     */
    public isArrayOf<T = unknown>(elementType: string, p: unknown): T[] {
        const arr = this.isType<T[]>('array', p);
        arr.forEach((item: unknown) => this.isType(elementType, item));
        return arr;
    }

    /**
     * Checks if the provided parameter is a valid email address.
     * 
     * @param {unknown} p - The parameter to check.
     * @returns {string} The validated email string
     * @throws {TypeError} Throws if the parameter is not a valid email address.
     * @example
     * const email = typer.isEmail("test@example.com"); // email: string
     */
    public isEmail(p: unknown): string {
        const str = this.isType<string>('string', p);
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(str)) {
            throw new TypeError(`${p} must be a valid email address.`);
        }
        return str;
    }

    /**
     * Checks if the provided parameter is a number within a specified range.
     * 
     * @param {number} min - The minimum value.
     * @param {number} max - The maximum value.
     * @param {unknown} p - The parameter to check.
     * @returns {number} The validated number
     * @throws {TypeError} Throws if the parameter is not a number within the specified range.
     * @example
     * const age = typer.isInRange(18, 65, 25); // age: number
     */
    public isInRange(min: number, max: number, p: unknown): number {
        const num = this.isType<number>('number', p);
        if (num < min || num > max) {
            throw new TypeError(`${p} must be between ${min} and ${max}, is ${num}`);
        }
        return num;
    }

    /**
     * Checks if the provided parameter is an integer.
     * 
     * @param {unknown} p - The parameter to check.
     * @returns {number} The validated integer
     * @throws {TypeError} Throws if the parameter is not an integer.
     * @example
     * const count = typer.isInteger(42); // count: number
     */
    public isInteger(p: unknown): number {
        const num = this.isType<number>('number', p);
        if (!Number.isInteger(num)) {
            throw new TypeError(`${p} must be an integer.`);
        }
        return num;
    }

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
    public isNonEmptyArray<T = unknown>(p: unknown): T[] {
        const arr = this.isType<T[]>('array', p);
        if (arr.length === 0) {
            throw new TypeError(`${p} must be a non-empty array.`);
        }
        return arr;
    }

    /**
     * Checks if the provided parameter is a non-empty string.
     * 
     * @param {unknown} p - The parameter to check.
     * @returns {string} The validated non-empty string
     * @throws {TypeError} Throws if the parameter is not a non-empty string.
     * @example
     * const name = typer.isNonEmptyString("Hello"); // name: string
     */
    public isNonEmptyString(p: unknown): string {
        const str = this.isType<string>('string', p);
        if (str.trim().length === 0) {
            throw new TypeError(`${p} must be a non-empty string.`);
        }
        return str;
    }

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
    public isOneOf<T>(values: readonly T[], p: unknown): T {
        if (!values.includes(p as T)) {
            throw new TypeError(`${p} must be one of [${values.join(', ')}], is ${p}`);
        }
        return p as T;
    }

    /**
     * Checks if the provided parameter is a valid phone number.
     * 
     * @param {unknown} p - The parameter to check.
     * @returns {string} The validated phone number string
     * @throws {TypeError} Throws if the parameter is not a valid phone number.
     * @example
     * const phone = typer.isPhoneNumber("+1234567890"); // phone: string
     * const phone2 = typer.isPhoneNumber("(555) 123-4567"); // phone2: string
     */
    public isPhoneNumber(p: unknown): string {
        const str = this.isType<string>('string', p);

        // Remove all non-digit characters except + for counting
        const digitsOnly = str.replace(/[^\d+]/g, '');

        // Check if empty after cleaning
        if (digitsOnly.length === 0) {
            throw new TypeError(`${p} must be a valid phone number.`);
        }

        // More restrictive regex for phone number validation
        // Allows: +country code, parentheses, spaces, hyphens, and periods
        // Requires at least 7 digits, max 15 (international standard)
        const phoneRegex = /^(\+?[1-9]\d{0,3})?[\s\-\.]?(\(?\d{1,4}\)?[\s\-\.]?)?[\d\s\-\.\(\)]{6,}$/;

        if (!phoneRegex.test(str)) {
            throw new TypeError(`${p} must be a valid phone number.`);
        }

        // Count actual digits (excluding + sign)
        const digitCount = digitsOnly.replace(/^\+/, '').length;

        // Validate digit count (7-15 digits for international numbers)
        if (digitCount < 7 || digitCount > 15) {
            throw new TypeError(`${p} must be a valid phone number with 7-15 digits.`);
        }

        // Check for invalid patterns
        if (str.includes('..') || str.includes('--') || str.includes('  ')) {
            throw new TypeError(`${p} must be a valid phone number.`);
        }

        return str;
    }

    /**
     * Checks if the provided parameter is a positive number.
     * 
     * @param {unknown} p - The parameter to check.
     * @returns {number} The validated positive number
     * @throws {TypeError} Throws if the parameter is not a positive number.
     * @example
     * const value = typer.isPositiveNumber(10); // value: number
     */
    public isPositiveNumber(p: unknown): number {
        const num = this.isType<number>('number', p);
        if (num < 0) {
            throw new TypeError(`${p} must be a positive number.`);
        }
        return num;
    }

    /**
     * Checks if the provided parameter is a positive integer.
     * 
     * @param {unknown} p - The parameter to check.
     * @returns {number} The validated positive integer
     * @throws {TypeError} Throws if the parameter is not a positive integer.
     * @example
     * const count = typer.isPositiveInteger(42); // count: number
     */
    public isPositiveInteger(p: unknown): number {
        const num = this.isInteger(p);
        if (num < 0) {
            throw new TypeError(`${p} must be a positive integer.`);
        }
        return num;
    }

    /**
     * Checks if the provided parameter is a negative number.
     * 
     * @param {unknown} p - The parameter to check.
     * @returns {number} The validated negative number
     * @throws {TypeError} Throws if the parameter is not a negative number.
     * @example
     * const value = typer.isNegativeNumber(-10); // value: number
     */
    public isNegativeNumber(p: unknown): number {
        const num = this.isType<number>('number', p);
        if (num >= 0) {
            throw new TypeError(`${p} must be a negative number.`);
        }
        return num;
    }

    /**
     * Checks if the provided parameter is a negative integer.
     * 
     * @param {unknown} p - The parameter to check.
     * @returns {number} The validated negative integer
     * @throws {TypeError} Throws if the parameter is not a negative integer.
     * @example
     * const count = typer.isNegativeInteger(-42); // count: number
     */
    public isNegativeInteger(p: unknown): number {
        const num = this.isInteger(p);
        if (num >= 0) {
            throw new TypeError(`${p} must be a positive integer.`);
        }
        return num;
    }

    /**
     * Type-safe string validation
     * @param {unknown} value - The value to check
     * @returns {value is string} Type guard for string
     */
    public isString(value: unknown): value is string {
        try {
            this.isType('string', value);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Type-safe number validation
     * @param {unknown} value - The value to check
     * @returns {value is number} Type guard for number
     */
    public isNumber(value: unknown): value is number {
        try {
            this.isType('number', value);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Type-safe boolean validation
     * @param {unknown} value - The value to check
     * @returns {value is boolean} Type guard for boolean
     */
    public isBoolean(value: unknown): value is boolean {
        try {
            this.isType('boolean', value);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Type-safe array validation
     * @template T - The expected element type
     * @param {unknown} value - The value to check
     * @returns {value is T[]} Type guard for array
     */
    public isArray<T = unknown>(value: unknown): value is T[] {
        try {
            this.isType('array', value);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Type-safe object validation
     * @template T - The expected object type
     * @param {unknown} value - The value to check
     * @returns {value is T} Type guard for object
     */
    public isObject<T extends Record<string, unknown> = Record<string, unknown>>(value: unknown): value is T {
        try {
            this.isType('object', value);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Validates and returns a string
     * @param {unknown} value - The value to validate
     * @returns {string} The validated string
     * @throws {TypeError} If not a string
     */
    public asString(value: unknown): string {
        return this.isType<string>('string', value);
    }

    /**
     * Validates and returns a number
     * @param {unknown} value - The value to validate
     * @returns {number} The validated number
     * @throws {TypeError} If not a number
     */
    public asNumber(value: unknown): number {
        return this.isType<number>('number', value);
    }

    /**
     * Validates and returns a boolean
     * @param {unknown} value - The value to validate
     * @returns {boolean} The validated boolean
     * @throws {TypeError} If not a boolean
     */
    public asBoolean(value: unknown): boolean {
        return this.isType<boolean>('boolean', value);
    }

    /**
     * Validates and returns an array
     * @template T - The expected element type
     * @param {unknown} value - The value to validate
     * @returns {T[]} The validated array
     * @throws {TypeError} If not an array
     */
    public asArray<T = unknown>(value: unknown): T[] {
        return this.isType<T[]>('array', value);
    }

    /**
     * Validates and returns an object
     * @template T - The expected object type
     * @param {unknown} value - The value to validate
     * @returns {T} The validated object
     * @throws {TypeError} If not an object
     */
    public asObject<T extends Record<string, unknown> = Record<string, unknown>>(value: unknown): T {
        return this.isType<T>('object', value);
    }

    /**
     * Checks if the provided parameter is a valid URL.
     * 
     * @param {unknown} p - The parameter to check.
     * @returns {String|Void}
     * @throws {TypeError} Throws if the parameter is not a valid URL.
     * @example
     * console.log(Typer.isURL("https://example.com")); // true
     * console.log(Typer.isURL("invalid-url")); // false
     */
    public isURL(p: unknown): string {
        const str = this.isType<string>('string', p);
        try {
            new URL(str);
        } catch (_) {
            throw new TypeError(`${p} must be a valid URL.`);
        }
        return str;
    }

    /**
     * Check if the parameter matches one of the specified types.
     *
     * Overloads:
     * - When called with a known built-in type alias (or array of aliases),
     *   the return type is inferred from {@link TypeMap} (e.g. `"string"` → `string`).
     * - Otherwise the caller can supply an explicit generic `T`, which falls
     *   back to `unknown`.
     *
     * @template T - The expected type for better TypeScript inference
     * @param {Array|String} types - The types to check against.
     * @param {unknown} p - The parameter to check.
     * @returns {T} Returns the value cast to the expected type
     * @throws {TypeError} Throws if the parameter does not match any of the specified types.
     * @example
     * const value = typer.isType("string", "Hello"); // value is typed as string (no generic needed)
     * const arr = typer.isType(["number", "boolean"], 42); // typed as number | boolean
     * typer.isType<MyShape>("my_custom_type", payload); // explicit generic for custom types
     */
    public isType<K extends TypeKey>(types: K | readonly K[], p: unknown): TypeMap[K];
    public isType<T = unknown>(types: string | readonly string[], p: unknown): T;
    public isType<T = unknown>(types: string | readonly string[], p: unknown): T {
        // Fast path: single-string input — no array allocation, no .map(),
        // no .bind(this), no try/catch unless validation actually fails.
        if (typeof types === 'string') {
            const pred = this.getPred(types);
            if (pred(p)) return p as T;
            // Slow path (only on miss): use the throwing checker for the
            // original error message, byte-for-byte compatible with legacy.
            const checker = this.typesMap[types.toLowerCase().trim()];
            try {
                checker.call(this, p);
                /* istanbul ignore next — defensive: predicate said no but checker
                 * said yes. Built-in predicates and checkers are kept in sync, so
                 * this branch is unreachable in practice; we keep it to avoid
                 * silent failure if a future custom-predicate disagrees. */
                return p as T;
            } catch (e: unknown) {
                const msg = (e as Error).message;
                throw new TypeError(`None of the types matched for ${p}: ${msg}`);
            }
        }

        // Multi-type input: try each predicate in order; only collect error
        // messages once we know all of them missed.
        for (let i = 0; i < types.length; i++) {
            if (this.getPred(types[i])(p)) return p as T;
        }
        const errors: string[] = [];
        for (let i = 0; i < types.length; i++) {
            const checker = this.typesMap[types[i].toLowerCase().trim()];
            try { checker.call(this, p); return p as T; }
            catch (e: unknown) { errors.push((e as Error).message); }
        }
        throw new TypeError(`None of the types matched for ${p}: ${errors.join(', ')}`);
    }

    /**
     * Checks if the provided value matches one or more specified types.
     *
     * Overloads:
     * - When called with a known built-in alias, the type guard is automatically
     *   inferred from {@link TypeMap} (e.g. `"number"` narrows to `number`).
     * - For custom registered types, an explicit generic `T` may be supplied.
     *
     * @template T - The expected type for better TypeScript inference
     * @param {unknown} value - The value to check.
     * @param {string | string[]} types - One or more types to check against.
     * @returns {value is T} Returns true if the value matches any type, false otherwise.
     * @example
     * if (typer.is(value, "string")) {
     *   // value is now narrowed to string by the type guard
     *   console.log(value.toUpperCase());
     * }
     * typer.is(42, "number"); // true
     * typer.is("hello", ["string", "number"]); // true
     * typer.is<MyShape>(payload, "my_custom_type"); // explicit generic for custom types
     */
    public is<K extends TypeKey>(value: unknown, types: K | readonly K[]): value is TypeMap[K];
    public is<T = unknown>(value: unknown, types: string | readonly string[]): value is T;
    public is<T = unknown>(value: unknown, types: string | readonly string[]): value is T {
        // Fast path: single string — one predicate call, no allocation.
        if (typeof types === 'string') {
            return this.getPred(types)(value);
        }
        // Multi-type: short-circuit on the first match.
        for (let i = 0; i < types.length; i++) {
            if (this.getPred(types[i])(value)) return true;
        }
        return false;
    }

    /**
     * Identity helper that preserves literal types of a schema declared as
     * a variable. Use it when you want to declare the schema once, derive
     * `Infer<typeof schema>`, and then call `parse(schema, value)` with
     * full type inference — without sprinkling `as const`.
     *
     * @example
     * const userSchema = typer.schema({
     *   id: 'number',
     *   name: 'string',
     *   email: 'string?',
     * });
     * type User = Infer<typeof userSchema>;
     * const user = typer.parse(userSchema, payload); // typed
     */
    public schema<const S extends Schema>(definition: S): S {
        return definition;
    }

    /**
     * Universal "parse" entry point. Validates `value` against either:
     *  - a built-in type alias (`"string"`, `"number"`, ...),
     *  - an array of aliases (`["string", "number"]` → union),
     *  - a `Validator<T>` function,
     *  - or a {@link Schema} object.
     *
     * Returns the value typed correctly. Throws a `TypeError` on failure.
     *
     * No `as const` is needed when calling with a literal schema thanks to
     * the `<const S>` parameter — the inferred type matches the schema.
     *
     * @example
     * const user = typer.parse(
     *   { id: 'number', name: 'string', email: 'string?' },
     *   payload,
     * );
     * // user is typed as { id: number; name: string; email?: string | null }
     */
    public parse<K extends TypeKey>(types: K | readonly K[], value: unknown): TypeMap[K];
    public parse<T>(validator: Validator<T>, value: unknown): T;
    public parse<const S extends Schema>(schema: S, value: unknown): Infer<S>;
    public parse<T>(types: string | readonly string[], value: unknown): T;
    public parse(typesOrSchemaOrValidator: unknown, value: unknown): unknown {
        if (typeof typesOrSchemaOrValidator === "function") {
            return (typesOrSchemaOrValidator as Validator<unknown>)(value);
        }
        if (typeof typesOrSchemaOrValidator === "string") {
            return this.isType(typesOrSchemaOrValidator, value);
        }
        if (Array.isArray(typesOrSchemaOrValidator)) {
            return this.isType(typesOrSchemaOrValidator as string[], value);
        }
        if (typesOrSchemaOrValidator !== null && typeof typesOrSchemaOrValidator === "object") {
            const checker = this.getCompiledChecker(typesOrSchemaOrValidator as Record<string, unknown>);
            const result = checker(value);
            if (!result.isValid) {
                throw new TypeError(`Validation failed:\n  - ${result.errors.join("\n  - ")}`);
            }
            return value;
        }
        throw new TypeError(`Invalid first argument to parse(): expected type alias, validator, or schema.`);
    }

    /**
     * Validates `value` without throwing. Same input shapes as {@link parse}.
     * Returns a discriminated union: `{ success: true, data }` or
     * `{ success: false, error }`.
     *
     * @example
     * const result = typer.safeParse(
     *   { id: 'number', name: 'string' },
     *   payload,
     * );
     * if (result.success) {
     *   // result.data is { id: number; name: string }
     * } else {
     *   console.error(result.error.message);
     * }
     */
    public safeParse<K extends TypeKey>(types: K | readonly K[], value: unknown): ParseResult<TypeMap[K]>;
    public safeParse<T>(validator: Validator<T>, value: unknown): ParseResult<T>;
    public safeParse<const S extends Schema>(schema: S, value: unknown): ParseResult<Infer<S>>;
    public safeParse<T>(types: string | readonly string[], value: unknown): ParseResult<T>;
    public safeParse(typesOrSchemaOrValidator: unknown, value: unknown): ParseResult<unknown> {
        try {
            const data = this.parse(typesOrSchemaOrValidator as never, value);
            return { success: true, data };
        } catch (e: unknown) {
            const error = e instanceof TypeError ? e : new TypeError(e instanceof Error ? e.message : String(e));
            return { success: false, error };
        }
    }

    /**
     * Cache of compiled schema checkers, keyed by schema object identity.
     * Re-using the same schema literal across calls hits the cache.
     */
    private schemaCheckerCache = new WeakMap<object, (value: unknown) => StructureValidationReturn>();

    /**
     * Returns a cached, **closure-compiled** checker for the given schema.
     *
     * Compilation walks the schema **once** and produces a flat array of
     * pre-built closures, with all string parsing (split/trim/lowercase),
     * optional/nullable detection, and `typesMap` lookups resolved at
     * compile time. The hot path is then a tight `for` loop over closures
     * that touch only the input value — no per-call allocations, no
     * `bind(this)`, no `checkStructure` recursion.
     *
     * Error messages are kept byte-for-byte identical to `checkStructure`
     * so behavior is fully preserved.
     */
    private getCompiledChecker(schema: Record<string, unknown>): (value: unknown) => StructureValidationReturn {
        const cached = this.schemaCheckerCache.get(schema);
        if (cached) return cached;
        const compiled = this.compileSchema(schema);
        const wrapper = (value: unknown): StructureValidationReturn => {
            const errors: string[] = [];
            if (value === null || typeof value !== "object" || Array.isArray(value)) {
                errors.push(`Invalid object: must be a non-null object, got ${this.getType(value)}`);
                return { isValid: false, errors };
            }
            compiled(value as Record<string, unknown>, errors, "");
            return { isValid: errors.length === 0, errors };
        };
        this.schemaCheckerCache.set(schema, wrapper);
        return wrapper;
    }

    /**
     * Compiles a full schema object into a single closure that, given an
     * already-validated parent object, runs every field check in order.
     * Nested schemas are compiled recursively (their compiled checkers are
     * captured by reference).
     */
    private compileSchema(
        schema: Record<string, unknown>,
    ): (obj: Record<string, unknown>, errors: string[], parentPath: string) => void {
        const fields: Array<(obj: Record<string, unknown>, errors: string[], parentPath: string) => void> = [];
        for (const key of Object.keys(schema)) {
            fields.push(this.compileField(key, schema[key]));
        }
        return (obj, errors, parentPath) => {
            for (let i = 0; i < fields.length; i++) {
                fields[i](obj, errors, parentPath);
            }
        };
    }

    /**
     * Compiles a single key+value pair from a schema into a closure that
     * checks the field in its parent object and pushes any errors found.
     */
    private compileField(
        key: string,
        expected: unknown,
    ): (obj: Record<string, unknown>, errors: string[], parentPath: string) => void {
        const buildPath = (parentPath: string) => parentPath ? `${parentPath}.${key}` : key;

        // Validator function entry — defers all decisions (incl. optional) to the validator itself.
        if (typeof expected === "function") {
            const validator = expected as Validator<unknown>;
            return (obj, errors, parentPath) => {
                try {
                    validator(obj[key]);
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    errors.push(`Validation failed at "${buildPath(parentPath)}": ${msg}`);
                }
            };
        }

        // Type-string entry, possibly optional and/or a `a|b|c` union.
        if (typeof expected === "string") {
            return this.compileStringField(key, expected, buildPath);
        }

        // Array entry: ["string"], [validator], [{nested}].
        if (Array.isArray(expected)) {
            return this.compileArrayField(key, expected as unknown[], buildPath);
        }

        // Nested schema entry.
        if (expected !== null && typeof expected === "object") {
            return this.compileNestedField(key, expected as Record<string, unknown>, buildPath);
        }

        // Anything else (number, boolean, null, …) — invalid schema definition.
        const expectedType = expected === null ? "null" : typeof expected;
        return (_obj, errors, parentPath) => {
            errors.push(
                `Invalid schema definition at "${buildPath(parentPath)}": expected string, array, or object, got ${expectedType}`,
            );
        };
    }

    /**
     * Compiles a string-typed schema entry (e.g. `"string"`, `"string?"`,
     * `"a|b"`, `"a|b?"`). All string parsing is done here, once.
     */
    private compileStringField(
        key: string,
        expected: string,
        buildPath: (parentPath: string) => string,
    ): (obj: Record<string, unknown>, errors: string[], parentPath: string) => void {
        if (expected.trim() === "") {
            return (_obj, errors, parentPath) => {
                errors.push(`Empty type definition at "${buildPath(parentPath)}"`);
            };
        }

        const isOptional = expected.endsWith("?");
        const baseExpected = isOptional ? expected.slice(0, -1) : expected;
        const types = baseExpected.split("|").map(t => t.trim()).filter(t => t.length > 0);

        if (types.length === 0) {
            return (_obj, errors, parentPath) => {
                errors.push(`Invalid type definition "${expected}" at "${buildPath(parentPath)}"`);
            };
        }

        // Pre-resolve checkers; null entries flag unknown type names (reported only
        // when the field is actually evaluated, matching legacy behavior).
        const checkers = types.map((t) => this.typesMap[t.toLowerCase().trim()] ?? null);
        const expectedDescription = types.length === 1 ? types[0] : `one of [${types.join(", ")}]`;

        return (obj, errors, parentPath) => {
            const v = obj[key];
            const fullPath = buildPath(parentPath);

            if (v === undefined) {
                if (!isOptional) errors.push(`Missing required key "${fullPath}"`);
                return;
            }
            if (v === null && isOptional) return;

            for (let i = 0; i < checkers.length; i++) {
                const c = checkers[i];
                if (c !== null) {
                    try {
                        c.call(this, v);
                        return; // matched
                    } catch {
                        continue;
                    }
                }
                // unknown type — surface the existing error then bail
                errors.push(`Unknown type: ${types[i]}`);
                return;
            }

            errors.push(`Expected "${fullPath}" to be ${expectedDescription}, got ${this.getType(v)}`);
        };
    }

    /**
     * Compiles an array-typed schema entry (`tags: ['string']` etc).
     */
    private compileArrayField(
        key: string,
        expected: unknown[],
        buildPath: (parentPath: string) => string,
    ): (obj: Record<string, unknown>, errors: string[], parentPath: string) => void {
        if (expected.length === 0) {
            return (_obj, errors, parentPath) => {
                errors.push(`Empty array schema definition at "${buildPath(parentPath)}"`);
            };
        }
        if (expected.length > 1) {
            return (_obj, errors, parentPath) => {
                errors.push(`Array schema must have exactly one element type definition at "${buildPath(parentPath)}"`);
            };
        }

        const elementDef = expected[0];
        const elementIsValid =
            typeof elementDef === "string"
            || typeof elementDef === "function"
            || (typeof elementDef === "object" && elementDef !== null && !Array.isArray(elementDef));

        if (!elementIsValid) {
            return (_obj, errors, parentPath) => {
                errors.push(`Array element type must be a string at "${buildPath(parentPath)}"`);
            };
        }

        const elementCheck = this.compileValue(elementDef);

        return (obj, errors, parentPath) => {
            const v = obj[key];
            const fullPath = buildPath(parentPath);

            if (v === undefined) {
                errors.push(`Missing required key "${fullPath}"`);
                return;
            }
            if (!Array.isArray(v)) {
                errors.push(`Expected "${fullPath}" to be an array, got ${this.getType(v)}`);
                return;
            }

            for (let i = 0; i < v.length; i++) {
                elementCheck(v[i], errors, `${fullPath}[${i}]`);
            }
        };
    }

    /**
     * Compiles a nested-object schema entry. The nested schema is compiled
     * once and reused for every parent object.
     */
    private compileNestedField(
        key: string,
        expected: Record<string, unknown>,
        buildPath: (parentPath: string) => string,
    ): (obj: Record<string, unknown>, errors: string[], parentPath: string) => void {
        const compiledNested = this.compileSchema(expected);

        return (obj, errors, parentPath) => {
            const v = obj[key];
            const fullPath = buildPath(parentPath);

            if (v === undefined) {
                errors.push(`Missing required key "${fullPath}"`);
                return;
            }
            if (v === null || typeof v !== "object" || Array.isArray(v)) {
                errors.push(`Expected "${fullPath}" to be an object, got ${this.getType(v)}`);
                return;
            }

            compiledNested(v as Record<string, unknown>, errors, fullPath);
        };
    }

    /**
     * Compiles a "value-position" schema fragment (the element type inside
     * an array, or any anonymous value check). Returns a closure that takes
     * the value directly and writes errors with the given path.
     */
    private compileValue(
        expected: unknown,
    ): (value: unknown, errors: string[], path: string) => void {
        if (typeof expected === "function") {
            const validator = expected as Validator<unknown>;
            return (value, errors, path) => {
                try {
                    validator(value);
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    errors.push(`Validation failed at "${path}": ${msg}`);
                }
            };
        }

        if (typeof expected === "string") {
            if (expected.trim() === "") {
                return (_v, errors, path) => {
                    errors.push(`Empty type definition at "${path}"`);
                };
            }
            const isOptional = expected.endsWith("?");
            const baseExpected = isOptional ? expected.slice(0, -1) : expected;
            const types = baseExpected.split("|").map(t => t.trim()).filter(t => t.length > 0);
            if (types.length === 0) {
                return (_v, errors, path) => {
                    errors.push(`Invalid type definition "${expected}" at "${path}"`);
                };
            }
            const checkers = types.map((t) => this.typesMap[t.toLowerCase().trim()] ?? null);
            const expectedDescription = types.length === 1 ? types[0] : `one of [${types.join(", ")}]`;
            return (value, errors, path) => {
                if (value === undefined && isOptional) return;
                if (value === null && isOptional) return;
                for (let i = 0; i < checkers.length; i++) {
                    const c = checkers[i];
                    if (c !== null) {
                        try { c.call(this, value); return; } catch { continue; }
                    }
                    errors.push(`Unknown type: ${types[i]}`);
                    return;
                }
                errors.push(`Expected "${path}" to be ${expectedDescription}, got ${this.getType(value)}`);
            };
        }

        /* istanbul ignore next — compileArrayField filters arrays out via
         * elementIsValid before delegating here, so this branch is currently
         * unreachable. Kept as a defensive fallback for future call sites. */
        if (Array.isArray(expected)) {
            // Array-of-array isn't supported as a schema; mirror checkStructure error wording.
            return (_v, errors, path) => {
                errors.push(`Array element type must be a string at "${path}"`);
            };
        }

        if (expected !== null && typeof expected === "object") {
            const compiledNested = this.compileSchema(expected as Record<string, unknown>);
            return (value, errors, path) => {
                if (value === null || typeof value !== "object" || Array.isArray(value)) {
                    errors.push(`Expected "${path}" to be an object, got ${this.getType(value)}`);
                    return;
                }
                compiledNested(value as Record<string, unknown>, errors, path);
            };
        }

        // compileArrayField's elementIsValid check already rejects
        // non-string/function/object element schemas before we reach this
        // branch. Kept as a defensive fallback for future call sites.
        /* istanbul ignore next */
        return (_v, errors, path) => {
            const expectedType = expected === null ? "null" : typeof expected;
            errors.push(`Invalid schema definition at "${path}": expected string, array, or object, got ${expectedType}`);
        };
    }

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
    public nullable<T>(validator: Validator<T>): Validator<T | null> {
        return (value: unknown): T | null => {
            if (value === null) return null;
            return validator(value);
        };
    }

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
    public optional<T>(validator: Validator<T>): Validator<T | undefined> {
        return (value: unknown): T | undefined => {
            if (value === undefined) return undefined;
            return validator(value);
        };
    }

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
    public union<T extends readonly unknown[]>(
        ...validators: { [K in keyof T]: Validator<T[K]> }
    ): Validator<T[number]> {
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
    }

    /**
     * Checks that the parameter is a finite number (rejects `NaN` and `Infinity`).
     * Stricter than `isType("number", x)`, which accepts `NaN` for compatibility
     * with `typeof x === "number"`.
     *
     * @param {unknown} p - The parameter to check
     * @returns {number} The validated finite number
     * @throws {TypeError} If `p` is not a finite number
     */
    public isFiniteNumber(p: unknown): number {
        const num = this.isType<number>('number', p);
        if (!Number.isFinite(num)) {
            throw new TypeError(`${p} must be a finite number.`);
        }
        return num;
    }

    /**
     * Checks that the parameter is a safe integer (within `Number.MIN_SAFE_INTEGER`
     * and `Number.MAX_SAFE_INTEGER`).
     *
     * @param {unknown} p - The parameter to check
     * @returns {number} The validated safe integer
     * @throws {TypeError} If `p` is not a safe integer
     */
    public isSafeInteger(p: unknown): number {
        const num = this.isType<number>('number', p);
        if (!Number.isSafeInteger(num)) {
            throw new TypeError(`${p} must be a safe integer.`);
        }
        return num;
    }

    /**
     * Checks that the parameter is a plain object (object literal or
     * `Object.create(null)`). Rejects class instances, arrays, dates, maps, etc.
     *
     * @template T - The expected plain object shape
     * @param {unknown} p - The parameter to check
     * @returns {T} The validated plain object
     * @throws {TypeError} If `p` is not a plain object
     */
    public isPlainObject<T extends Record<string, unknown> = Record<string, unknown>>(p: unknown): T {
        if (p === null || typeof p !== 'object') {
            throw new TypeError(`${p} must be a plain object, is ${p === null ? 'null' : typeof p}`);
        }
        const proto = Object.getPrototypeOf(p);
        if (proto !== null && proto !== Object.prototype) {
            throw new TypeError(`${p} must be a plain object (no class instances).`);
        }
        return p as T;
    }

    /**
     * Checks that the parameter is a Promise (or a thenable).
     *
     * @template T - The resolved promise type (caller-supplied)
     * @param {unknown} p - The parameter to check
     * @returns {Promise<T>} The validated promise
     * @throws {TypeError} If `p` is not a Promise/thenable
     */
    public isPromise<T = unknown>(p: unknown): Promise<T> {
        if (p === null || (typeof p !== 'object' && typeof p !== 'function')) {
            throw new TypeError(`${p} must be a Promise.`);
        }
        const then = (p as { then?: unknown }).then;
        if (typeof then !== 'function') {
            throw new TypeError(`${p} must be a Promise.`);
        }
        return p as Promise<T>;
    }

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
    public isInstanceOf<T>(ctor: new (...args: never[]) => T, p: unknown): T {
        if (!(p instanceof ctor)) {
            throw new TypeError(`${p} must be an instance of ${ctor.name || 'the given constructor'}.`);
        }
        return p;
    }

    /**
     * Checks that the parameter is a string matching the given regular expression.
     *
     * @param {RegExp} regex - The pattern to match against
     * @param {unknown} p - The parameter to check
     * @returns {string} The validated string
     * @throws {TypeError} If `p` is not a string or does not match
     */
    public matches(regex: RegExp, p: unknown): string {
        const str = this.isType<string>('string', p);
        if (!regex.test(str)) {
            throw new TypeError(`${p} must match ${regex}.`);
        }
        return str;
    }

    /**
     * Checks that the length of a string or array falls within the given bounds.
     *
     * @template T - Either `string` or an array type
     * @param {{ min?: number, max?: number }} bounds - Inclusive length bounds
     * @param {unknown} p - The parameter to check (string or array)
     * @returns {T} The validated value
     * @throws {TypeError} If `p` is not a string/array or its length is out of range
     */
    public isLength<T extends string | readonly unknown[]>(
        bounds: { min?: number; max?: number },
        p: unknown,
    ): T {
        if (typeof p !== 'string' && !Array.isArray(p)) {
            throw new TypeError(`${p} must be a string or array, is ${this.getType(p)}`);
        }
        const length = (p as string | unknown[]).length;
        const { min, max } = bounds;
        if (min !== undefined && length < min) {
            throw new TypeError(`length must be >= ${min}, is ${length}`);
        }
        if (max !== undefined && length > max) {
            throw new TypeError(`length must be <= ${max}, is ${length}`);
        }
        return p as T;
    }

    /**
     * Checks that the parameter is "empty": empty string (after trim), empty
     * array, empty Map/Set, or object with no own enumerable keys.
     *
     * @param {unknown} p - The parameter to check
     * @returns {unknown} The validated empty value
     * @throws {TypeError} If `p` is not empty or not a supported container
     */
    public isEmpty(p: unknown): unknown {
        if (typeof p === 'string') {
            if (p.trim().length !== 0) throw new TypeError(`string must be empty.`);
            return p;
        }
        if (Array.isArray(p)) {
            if (p.length !== 0) throw new TypeError(`array must be empty.`);
            return p;
        }
        if (p instanceof Map || p instanceof Set) {
            if (p.size !== 0) throw new TypeError(`${p.constructor.name} must be empty.`);
            return p;
        }
        if (p !== null && typeof p === 'object') {
            if (Object.keys(p).length !== 0) throw new TypeError(`object must have no own keys.`);
            return p;
        }
        throw new TypeError(`${p} is not a container that can be checked for emptiness.`);
    }

    /**
     * Inverse of `isEmpty`: checks the parameter is a non-empty string, array,
     * Map, Set, or object.
     *
     * @template T - Caller-supplied container type for narrower inference
     * @param {unknown} p - The parameter to check
     * @returns {T} The validated non-empty value
     * @throws {TypeError} If `p` is empty or not a supported container
     */
    public isNonEmpty<T = unknown>(p: unknown): T {
        if (typeof p === 'string') {
            if (p.trim().length === 0) throw new TypeError(`string must be non-empty.`);
            return p as T;
        }
        if (Array.isArray(p)) {
            if (p.length === 0) throw new TypeError(`array must be non-empty.`);
            return p as T;
        }
        if (p instanceof Map || p instanceof Set) {
            if (p.size === 0) throw new TypeError(`${p.constructor.name} must be non-empty.`);
            return p as T;
        }
        if (p !== null && typeof p === 'object') {
            if (Object.keys(p).length === 0) throw new TypeError(`object must have at least one own key.`);
            return p as T;
        }
        throw new TypeError(`${p} is not a container that can be checked for non-emptiness.`);
    }

    /**
     * Checks that the parameter is a valid UUID (versions 1-5, RFC 4122).
     *
     * @param {unknown} p - The parameter to check
     * @returns {string} The validated UUID
     * @throws {TypeError} If `p` is not a valid UUID
     */
    public isUUID(p: unknown): string {
        const str = this.isType<string>('string', p);
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(str)) {
            throw new TypeError(`${p} must be a valid UUID.`);
        }
        return str;
    }

    /**
     * Checks that the parameter is a valid IPv4 address (dotted-quad notation).
     *
     * @param {unknown} p - The parameter to check
     * @returns {string} The validated IPv4 address
     * @throws {TypeError} If `p` is not a valid IPv4 address
     */
    public isIPv4(p: unknown): string {
        const str = this.isType<string>('string', p);
        const parts = str.split('.');
        if (parts.length !== 4) {
            throw new TypeError(`${p} must be a valid IPv4 address.`);
        }
        for (const part of parts) {
            if (!/^\d+$/.test(part)) {
                throw new TypeError(`${p} must be a valid IPv4 address.`);
            }
            const n = Number(part);
            // reject leading zeros (except the single "0") and out-of-range octets
            if (n < 0 || n > 255 || (part.length > 1 && part.startsWith('0'))) {
                throw new TypeError(`${p} must be a valid IPv4 address.`);
            }
        }
        return str;
    }

    /**
     * Checks that the parameter is a valid IPv6 address.
     * Uses the `URL` constructor as a permissive parser: any string accepted as
     * the host portion of `http://[<addr>]/` is considered valid.
     *
     * @param {unknown} p - The parameter to check
     * @returns {string} The validated IPv6 address
     * @throws {TypeError} If `p` is not a valid IPv6 address
     */
    public isIPv6(p: unknown): string {
        const str = this.isType<string>('string', p);
        try {
            const url = new URL(`http://[${str}]`);
            // URL preserves the bracketed host; reject if parsing dropped digits
            /* istanbul ignore next — Node's URL parser keeps the brackets in
             * `hostname` for any address it accepts, so this guard fires only
             * if a future Node version changes that contract. */
            if (!url.hostname.startsWith('[') || !url.hostname.endsWith(']')) {
                throw new Error();
            }
        } catch {
            throw new TypeError(`${p} must be a valid IPv6 address.`);
        }
        return str;
    }

    /**
     * Checks that the parameter is a valid CSS hex color (`#RGB`, `#RGBA`,
     * `#RRGGBB`, or `#RRGGBBAA`).
     *
     * @param {unknown} p - The parameter to check
     * @returns {string} The validated hex color
     * @throws {TypeError} If `p` is not a valid hex color
     */
    public isHexColor(p: unknown): string {
        const str = this.isType<string>('string', p);
        if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(str)) {
            throw new TypeError(`${p} must be a valid hex color.`);
        }
        return str;
    }

    /**
     * Checks that the parameter is a valid ISO 8601 date string and returns
     * the parsed `Date`. Accepts the formats produced by `Date#toISOString`
     * plus reasonable variants (e.g. with timezone offsets).
     *
     * @param {unknown} p - The parameter to check
     * @returns {Date} The parsed date (always valid)
     * @throws {TypeError} If `p` is not a valid ISO 8601 date string
     */
    public isISODate(p: unknown): Date {
        const str = this.isType<string>('string', p);
        // Require at least YYYY-MM-DD; allow time and timezone parts.
        const isoRegex = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
        if (!isoRegex.test(str)) {
            throw new TypeError(`${p} must be a valid ISO 8601 date string.`);
        }
        const date = new Date(str);
        if (Number.isNaN(date.getTime())) {
            throw new TypeError(`${p} must be a valid ISO 8601 date string.`);
        }
        return date;
    }

    /**
     * Checks that the parameter is a syntactically valid Base64 string.
     * Supports both standard and URL-safe variants. Padding is required when
     * `requirePadding` is true (default).
     *
     * @param {unknown} p - The parameter to check
     * @param {{ urlSafe?: boolean, requirePadding?: boolean }} [opts] - Options
     * @returns {string} The validated Base64 string
     * @throws {TypeError} If `p` is not a valid Base64 string
     */
    public isBase64(p: unknown, opts: { urlSafe?: boolean; requirePadding?: boolean } = {}): string {
        const { urlSafe = false, requirePadding = true } = opts;
        const str = this.isType<string>('string', p);
        const charClass = urlSafe ? '[A-Za-z0-9_-]' : '[A-Za-z0-9+/]';
        const padded = requirePadding
            ? new RegExp(`^(?:${charClass}{4})*(?:${charClass}{2}==|${charClass}{3}=|${charClass}{4})$`)
            : new RegExp(`^(?:${charClass}{4})*(?:${charClass}{2,4}={0,2})?$`);
        if (str.length === 0 || !padded.test(str)) {
            throw new TypeError(`${p} must be a valid Base64 string.`);
        }
        return str;
    }

    /**
     * Recursively validates an object against a nested schema.
     * @param {SchemaDefinition} schema - The expected structure definition.
     * @param {Record<string, unknown>} obj - The object to validate.
     * @param {string} path - The current path for error reporting (internal use).
     * @param {boolean} strictMode - Whether to reject extra keys not in schema.
     * @returns {StructureValidationReturn} - Validation result with errors array.
     * @example
     * const schema = {
     *    name: "string",
     *    age: "number",
     *    hobbies: ["string"],
     *    address: {
     *      street: "string",
     *      city: "string?"
     *    }
     * };
     * const obj = { name: "John", age: 25, hobbies: ["reading"] };
     * console.log(Typer.checkStructure(schema, obj)); // { isValid: true, errors: [] }
     */
    public checkStructure(schema: Record<string, unknown>, obj: Record<string, unknown>, path = '', strictMode = false): StructureValidationReturn {
        const errors: string[] = [];

        // Validate input parameters
        if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
            errors.push(`Invalid schema: must be a non-null object`);
            return { isValid: false, errors };
        }

        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
            errors.push(`Invalid object: must be a non-null object, got ${this.getType(obj)}`);
            return { isValid: false, errors };
        }

        for (const key of Object.keys(schema)) {
            const expected = schema[key];
            const value = obj[key];
            const fullPath = path ? `${path}.${key}` : key;

            // Parse optional field syntax (ending with ?)
            const isOptional = typeof expected === "string" && expected.endsWith("?");
            const baseExpected = isOptional && typeof expected === "string" ? expected.slice(0, -1) : expected;
            const isValidator = typeof expected === "function";

            // Handle missing values — validator entries decide for themselves
            if (value === undefined && !isValidator) {
                if (!isOptional) {
                    errors.push(`Missing required key "${fullPath}"`);
                }
                continue;
            }

            // Handle null values for optional string-fields
            if (value === null && isOptional) {
                continue; // null is acceptable for optional fields
            }

            // validateSchemaValue collects errors via the `errors` array;
            // it never throws, so no try/catch is needed here.
            this.validateSchemaValue(baseExpected, value, fullPath, strictMode, errors);
        }

        // Check for unexpected keys in strict mode
        if (strictMode) {
            const extraKeys = Object.keys(obj).filter(k => !Object.prototype.hasOwnProperty.call(schema, k));
            for (const key of extraKeys) {
                const fullPath = path ? `${path}.${key}` : key;
                errors.push(`Unexpected key "${fullPath}" in strict mode`);
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Helper method to validate a single schema value against expected type.
     * @private
     * @param {unknown} expected - The expected type or structure
     * @param {unknown} value - The actual value to validate
     * @param {string} fullPath - The full path for error reporting
     * @param {boolean} strictMode - Whether strict mode is enabled
     * @param {string[]} errors - Array to collect errors
     */
    private validateSchemaValue(expected: unknown, value: unknown, fullPath: string, strictMode: boolean, errors: string[]): void {
        // Validator function entries (e.g. typer.optional(asString) inside a schema)
        if (typeof expected === "function") {
            try {
                (expected as Validator<unknown>)(value);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                errors.push(`Validation failed at "${fullPath}": ${errorMessage}`);
            }
            return;
        }

        // Handle primitive types or union types (e.g., "string", "number|string")
        if (typeof expected === "string") {
            if (expected.trim() === "") {
                errors.push(`Empty type definition at "${fullPath}"`);
                return;
            }

            const types = expected.split("|").map(t => t.trim()).filter(t => t.length > 0);
            if (types.length === 0) {
                errors.push(`Invalid type definition "${expected}" at "${fullPath}"`);
                return;
            }

            const validTypes = types.filter(type => {
                try {
                    return this.is(value, type);
                } catch {
                    return false;
                }
            });

            if (validTypes.length === 0) {
                const expectedTypes = types.length === 1 ? types[0] : `one of [${types.join(", ")}]`;
                errors.push(`Expected "${fullPath}" to be ${expectedTypes}, got ${this.getType(value)}`);
            }
        }
        // Handle array type definitions: ["string"] or ["string|number"]
        else if (Array.isArray(expected)) {
            if (expected.length === 0) {
                errors.push(`Empty array schema definition at "${fullPath}"`);
                return;
            }

            if (expected.length > 1) {
                errors.push(`Array schema must have exactly one element type definition at "${fullPath}"`);
                return;
            }

            if (!Array.isArray(value)) {
                errors.push(`Expected "${fullPath}" to be an array, got ${this.getType(value)}`);
                return;
            }

            const elementTypeDefinition = expected[0];
            const elementIsValid =
                typeof elementTypeDefinition === "string"
                || typeof elementTypeDefinition === "function"
                || (typeof elementTypeDefinition === "object" && elementTypeDefinition !== null && !Array.isArray(elementTypeDefinition));
            if (!elementIsValid) {
                errors.push(`Array element type must be a string at "${fullPath}"`);
                return;
            }

            value.forEach((item, i) => {
                this.validateSchemaValue(elementTypeDefinition, item, `${fullPath}[${i}]`, strictMode, errors);
            });
        }
        // Handle nested object schemas
        else if (typeof expected === "object" && expected !== null && !Array.isArray(expected)) {
            if (typeof value !== "object" || value === null || Array.isArray(value)) {
                errors.push(`Expected "${fullPath}" to be an object, got ${this.getType(value)}`);
                return;
            }

            const nested = this.checkStructure(
                expected as Record<string, unknown>,
                value as Record<string, unknown>,
                fullPath,
                strictMode
            );
            errors.push(...nested.errors);
        }
        // Handle invalid schema definitions
        else {
            const expectedType = expected === null ? "null" : typeof expected;
            errors.push(`Invalid schema definition at "${fullPath}": expected string, array, or object, got ${expectedType}`);
        }
    }

    /**
     * Validates an object against a schema.
     * @param {Record<string, string | string[]>} schema - The expected types for each key.
     * @param {Record<string, unknown>} obj - The object to validate.
     * @returns {string[]} - An array of validation errors, or an empty array if valid.
     * @example
     * const schema = { name: "string", age: "number" };
     * const obj = { name: "John", age: "25" };
     * console.log(Typer.validate(schema, obj)); // ["Expected 'age' to be of type number, got string"]
     */
    public validate(schema: Record<string, string | string[]>, obj: Record<string, unknown>): string[] {
        const errors: string[] = [];

        Object.keys(schema).forEach(key => {
            const expectedType = schema[key];
            const value = obj[key];

            if (!this.is(value, expectedType)) {
                errors.push(`Expected "${key}" to be of type ${expectedType}, got ${typeof value}`);
            }
        });

        return errors;
    }

    /**
     * Assert that a value is of a specific type. Logs a warning if incorrect.
     * @param {unknown} value - The value to check.
     * @param {string | string[]} expectedType - The expected type(s).
     * @example
     * Typer.assert(42, "number"); // No output
     * Typer.assert("hello", "number"); // Warning in console
     */
    public assert(value: unknown, expectedType: string | string[]): void {
        if (!this.is(value, expectedType)) {
            console.warn(`[Typer] Assertion failed: Expected ${expectedType}, got ${typeof value}`, value);
        }
    }

    /**
     * Expects a function to conform to specified input and output types.
     * 
     * @param {Function} funct - The function to type-check.
     * @param {Object} types - The expected types for the function's parameters and return value.
     * @param {Array<string>} types.paramTypes - The expected type of the main argument.
     * @param {Array<string>} types.returnType - The expected return type of the function.
     * @returns {Function} A new function that type-checks its arguments and return value.
     * @throws {Error} If the types object does not contain exactly 3 keys or the required type properties.
     * @throws {TypeError} If the function or types object does not conform to the expected types.
     * @example
     * const typedFunction = Typer.expect(
     *    (x: number) => x * 2, 
     *    { paramTypes: ["number"], returnType: ["number"] }
     * );
     * console.log(typedFunction(3)); // 6
     */
    public expect(funct: Function, types: TyperExpectTypes) {
        if (Object.keys(types).length !== 2) {
            throw new Error(`Expected 2 types (paramTypes and returnTypes), got ${Object.keys(types).length}`);
        }

        if (types.paramTypes === undefined || !types.returnType || (!types.returnType && types.returnType !== 'void')) {
            throw new Error(`Expected paramType, returnType types, got ${Object.keys(types)}`);
        }

        funct = this.isType('f', funct) as Function;
        types = this.isType('o', types) as TyperExpectTypes;

        return (...args: unknown[]) => {
            const paramTypes = Array.isArray(types.paramTypes) ? types.paramTypes : [types.paramTypes];
            const returnTypes = Array.isArray(types.returnType) ? types.returnType : [types.returnType];
            if ((args.length !== paramTypes.length) && paramTypes.length !== 1) {
                throw new Error(`Expected ${paramTypes.length} arguments, but got ${args.length}`);
            }

            // verify num of arguments + types
            if (paramTypes.length === 1) {
                args.forEach((arg: unknown) => {
                    this.isType(paramTypes[0], arg);
                });
            } else {
                args.forEach((arg: unknown, index: number) => {
                    this.isType(paramTypes[index], arg);
                });
            }

            // call og funct
            const result = funct(...args);

            if (result instanceof Promise) {
                return result.then(res => {
                    this.verifyReturnType(res, returnTypes);
                    return res;
                }).catch(err => {
                    throw err;
                });
            } else {
                this.verifyReturnType(result, returnTypes);
                return result;
            }
        };
    }

    /**
     * Verifies that the result matches one of the expected return types.
     *
     * @private
     * @param {unknown} result - The result to check.
     * @param {Array<string>} returnTypes - The expected return types.
     * @throws {TypeError} Throws if the result does not match any of the expected return types.
     */
    private verifyReturnType(result: unknown, returnTypes: TyperExpectTypes['returnType']) {
        const returnTypeErrors: string[] = [];
        const isReturnTypeValid = returnTypes.some(returnType => {
            try {
                if (returnType === 'void' && result === undefined) {
                    return true;
                }
                this.isType(returnType, result);
                return true;
            } catch (error: unknown) {
                const catchedError = error as Error;

                returnTypeErrors.push(catchedError.message);
                return false;
            }
        });

        if (!isReturnTypeValid) {
            throw new TypeError(`Return type mismatch: ${returnTypeErrors.join(', ')}`);
        }
    }
}