"use strict";

import { Error } from "./Types/Globals";
import { StructureValidationReturn, TyperExpectTypes, TyperReturn } from "./Types/Typer";

/**
 * Class representing a type checker.
 * Version: 2.4.1
 * @author Michael Lavigna
 * @since 2.4.1
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
        const type = typeof p;
        if (type !== "bigint") {
            throw new TypeError(`${p} must be a bigint, is ${type}`);
        }
        return p as bigint;
    }

    /**
     * Checks if the provided parameter is a boolean.
     * @private
     * @param {unknown} p - The parameter to check.
     * @returns {Boolean|void}
     * @throws {TypeError} Throws if the parameter is not a boolean.
     */
    private tBoolean(p: unknown): TyperReturn<boolean> {
        const type = typeof p;
        if (type !== "boolean") {
            throw new TypeError(`${p} must be a boolean, is ${type}`);
        }
        return p as boolean;
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
        const type = typeof p;
        if (type !== "function") {
            throw new TypeError(`${p} must be a function, is ${type}`);
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
        const type = typeof p;
        if (typeof p !== "number") {
            throw new TypeError(`${p} must be a number, is ${typeof p}`);
        }
        return p as number;
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
        const type = typeof p;
        if (type !== "string") {
            throw new TypeError(`${p} must be a string, is ${type}`);
        }
        return p as string;
    }

    /**
     * Checks if the provided parameter is a symbol.
     * @private
     * @param {unknown} p - The parameter to check.
     * @returns {Symbol|void}
     * @throws {TypeError} Throws if the parameter is not a symbol.
     */
    private tSymbol(p: unknown): TyperReturn<symbol> {
        const type = typeof p;
        if (type !== "symbol") {
            throw new TypeError(`${p} must be a symbol, is ${type}`);
        }
        return p as symbol;
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
        const type = typeof p;
        if (type !== "undefined") {
            throw new TypeError(`${p} must be undefined, is ${typeof p}`);
        }
        return p as undefined;
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
     * @template T - The expected type for better TypeScript inference
     * @param {Array|String} types - The types to check against.
     * @param {unknown} p - The parameter to check.
     * @returns {T} Returns the value cast to the expected type
     * @throws {TypeError} Throws if the parameter does not match any of the specified types.
     * @example
     * const value = typer.isType<string>("string", "Hello"); // value is typed as string
     * console.log(Typer.isType("string", "Hello")); // "Hello"
     * console.log(Typer.isType(["number", "boolean"], 42)); // 42
     * console.log(Typer.isType(["number", "boolean"], "text")); // Throws TypeError
     */
    public isType<T = unknown>(types: string | string[], p: unknown): T {
        //if types is not an array is converted to a "single" array
        if (!Array.isArray(types)) {
            types = [types];
        }

        // creating typeCheckers mapping types
        const typeCheckers = types.map((type: string) => {
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
     * @template T - The expected type for better TypeScript inference
     * @param {unknown} value - The value to check.
     * @param {string | string[]} types - One or more types to check against.
     * @returns {value is T} Returns true if the value matches any type, false otherwise.
     * @example
     * if (typer.is<string>("hello", "string")) {
     *   // value is now typed as string
     *   console.log(value.toUpperCase());
     * }
     * console.log(Typer.is(42, "number")); // true
     * console.log(Typer.is("hello", ["string", "number"])); // true
     * console.log(Typer.is([], "string")); // false
     */
    public is<T = unknown>(value: unknown, types: string | string[]): value is T {
        const typeList = Array.isArray(types) ? types : [types];

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
                args.forEach((arg: any) => {
                    this.isType(paramTypes[0], arg);
                });
            } else if ((args.length !== paramTypes.length) && paramTypes.length !== 1) {
                throw new Error(`Expected ${paramTypes.length} paramTypes arguments, but got ${args.length}`);
            } else {
                // verify type of args
                args.forEach((arg: any, index: number) => {
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