"use strict";

import type { Error } from "./Types/Globals";
import type { ParseResult, StructureValidationReturn, TypeKey, TypeMap, TyperExpectTypes, TyperReturn, Validator } from "./Types/Typer";

/**
 * Class representing a type checker.
 * Version: 3.1.0
 * @author Michael Lavigna - <https://michaellavigna.com> - <michael.lavigna@hotmail.it>
 * @since 3.1.0
 */
export class Typer {
    /**
     * @private
     * @type {Record<string, (value: unknown) => unknown>} 
     * Stores the type validation functions
     */
    private typesMap: Record<string, (value: unknown) => unknown>;

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
        const typeList: readonly string[] = Array.isArray(types) ? types : [types as string];

        // creating typeCheckers mapping types
        const typeCheckers = typeList.map((type: string) => {
            const checker = this.typesMap[type.toLowerCase().trim()];
            if (!checker) {
                throw new Error(`Unknown type: ${type}`);
            }
            return checker.bind(this);
        });

        const errors: string[] = [];
        for (const check of typeCheckers) {
            try {
                check(p);
                return p as T;
            } catch (e: unknown) {
                const catchedError = e as Error;
                errors.push(catchedError.message);
            }
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
        const typeList: readonly string[] = Array.isArray(types) ? types : [types as string];

        for (const type of typeList) {
            const checker = this.typesMap[type.toLowerCase().trim()];
            if (!checker) {
                throw new Error(`Unknown type: ${type}`);
            }
            try {
                checker(value);
                return true;
            } catch {
                continue;
            }
        }

        return false;
    }

    /**
     * Validates `value` against the given type(s) without throwing.
     * Returns a discriminated union: `{ success: true, data }` on success,
     * `{ success: false, error }` on failure. Useful for functional flows
     * where exceptions are undesirable.
     *
     * @template K - Built-in type alias inferred when provided as a literal
     * @param {string | string[]} types - The type(s) to check against
     * @param {unknown} value - The value to validate
     * @returns {ParseResult} A success/failure result containing the typed value or the TypeError
     * @example
     * const result = typer.safeParse("number", input);
     * if (result.success) {
     *   // result.data is number
     * } else {
     *   console.error(result.error.message);
     * }
     */
    public safeParse<K extends TypeKey>(types: K | readonly K[], value: unknown): ParseResult<TypeMap[K]>;
    public safeParse<T>(types: string | readonly string[], value: unknown): ParseResult<T>;
    public safeParse<T>(types: string | readonly string[], value: unknown): ParseResult<T> {
        try {
            const data = this.isType<T>(types, value);
            return { success: true, data };
        } catch (e: unknown) {
            const error = e instanceof TypeError ? e : new TypeError(e instanceof Error ? e.message : String(e));
            return { success: false, error };
        }
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

            // Handle missing values
            if (value === undefined) {
                if (!isOptional) {
                    errors.push(`Missing required key "${fullPath}"`);
                }
                continue;
            }

            // Handle null values for optional fields
            if (value === null && isOptional) {
                continue; // null is acceptable for optional fields
            }

            try {
                this.validateSchemaValue(baseExpected, value, fullPath, strictMode, errors);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                errors.push(`Validation error at "${fullPath}": ${errorMessage}`);
            }
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
            if (typeof elementTypeDefinition !== "string") {
                errors.push(`Array element type must be a string at "${fullPath}"`);
                return;
            }

            value.forEach((item, i) => {
                try {
                    this.validateSchemaValue(elementTypeDefinition, item, `${fullPath}[${i}]`, strictMode, errors);
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    errors.push(`Array element validation failed at "${fullPath}[${i}]": ${errorMessage}`);
                }
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

            // verify num of arguments
            if (paramTypes.length === 1) {
                // verify type of args
                args.forEach((arg: unknown) => {
                    this.isType(paramTypes[0], arg);
                });
            } else if ((args.length !== paramTypes.length) && paramTypes.length !== 1) {
                throw new Error(`Expected ${paramTypes.length} paramTypes arguments, but got ${args.length}`);
            } else {
                // verify type of args
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