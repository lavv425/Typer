"use strict";

import { Error } from "./Types/Globals";
import { StructureValidationReturn, TyperExpectTypes, TyperReturn } from "./Types/Typer";

/**
 * Class representing a type checker.
 * @author Michael Lavigna
 * @version 2.4.1
 */
class Typer {
    /**
     * @private
     * @type {object} 
     * stores types mapping
     */
    private typesMap: Record<string, Function>;

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
     * @param {string} name - The name of the new type.
     * @param {(value: any) => any} validator - The function to validate the type.
     * @param {boolean} override - Whether to override the original configuration
     * @throws {Error} If the type name is already registered.
     */
    public registerType(name: string, validator: (value: any) => any, override = false): void {
        const typeKey = name.toLowerCase().trim();
        if (this.typesMap[typeKey] && !override) {
            throw new Error(`Type "${name}" is already registered.`);
        }
        this.typesMap[typeKey] = validator;
    }

    /**
     * Unregister a type from the typesMap.
     * @param {string} name - The name of the type to remove.
     * @throws {Error} If the type does not exist.
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
     */
    public listTypes(): string[] {
        return Object.keys(this.typesMap);
    }

    /**
     * Exports all registered types as a JSON string.
     * @returns {string} The serialized types.
     */
    public exportTypes(): string {
        return JSON.stringify(Object.keys(this.typesMap));
    }

    /**
     * Imports types from a JSON string.
     * @param {string} json - The JSON string containing type names.
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
     * @param {*} p - The parameter to check.
     * @returns {Array|void}
     * @throws {TypeError} Throws if the parameter is not an array.
     */
    private tArray(p: any): TyperReturn<any[]> {
        if (!Array.isArray(p)) {
            throw new TypeError(`${p} must be an array, is ${typeof p}`);
        }
        return p;
    }

    /**
     * Checks if the provided parameter is an ArrayBuffer.
     * 
     * @param {*} p - The parameter to check.
     * @returns {ArrayBuffer|void}
     * @throws {TypeError} Throws if the parameter is not an ArrayBuffer.
     */
    private tArrayBuffer(p: any): TyperReturn<ArrayBuffer> {
        if (!(p instanceof ArrayBuffer)) {
            throw new TypeError(`${p} must be an ArrayBuffer.`);
        }
        return p;
    }

    /**
     * Checks if the provided parameter is a bigint.
     * @private
     * @param {*} p - The parameter to check.
     * @returns {Bigint|void}
     * @throws {TypeError} Throws if the parameter is not a bigint.
     */
    private tBigint(p: any): TyperReturn<BigInt> {
        const type = typeof p;
        if (type !== "bigint") {
            throw new TypeError(`${p} must be a bigint, is ${type}`);
        }
        return p;
    }

    /**
     * Checks if the provided parameter is a boolean.
     * @private
     * @param {*} p - The parameter to check.
     * @returns {Boolean|void}
     * @throws {TypeError} Throws if the parameter is not a boolean.
     */
    private tBoolean(p: any): TyperReturn<boolean> {
        const type = typeof p;
        if (type !== "boolean") {
            throw new TypeError(`${p} must be a boolean, is ${type}`);
        }
        return p;
    }

    /**
     * Checks if the provided parameter is a TypedArray.
     * 
     * @param {*} p - The parameter to check.
     * @returns {DataView|void}
     * @throws {TypeError} Throws if the parameter is not a TypedArray.
     */
    private tDataView(p: any): TyperReturn<DataView> {
        if (p instanceof DataView) {
            throw new TypeError(`${p} must be a DataView.`);
        }
        return p;
    }

    /**
     * Checks if the provided parameter is a valid Date.
     * 
     * @param {*} p - The parameter to check.
     * @returns {Date}
     * @throws {TypeError} Throws if the parameter is not a valid Date.
     */
    private tDate(p: any): TyperReturn<Date> {
        if (!(p instanceof Date) || isNaN(p.getTime())) {
            throw new TypeError(`${p} must be a valid Date.`);
        }
        return p;
    }

    /**
     * Checks if the provided parameter is a dom element.
     * @private
     * @param {*} p - The parameter to check.
     * @returns {HTMLElement|void}
     * @throws {TypeError} Throws if the parameter is not an instanceof HTMLElement.
     */
    private tDomElement(p: any): TyperReturn<HTMLElement> {
        if (!(p instanceof HTMLElement)) {
            throw new TypeError(`${p} must be a DOM element, is ${typeof p}`);
        }
        return p;
    }

    /**
     * Checks if the provided parameter is a function.
     * @private
     * @param {*} p - The parameter to check.
     * @returns {Function|void}
     * @throws {TypeError} Throws if the parameter is not a function.
     */
    private tFunction(p: any): TyperReturn<Function> {
        const type = typeof p;
        if (type !== "function") {
            throw new TypeError(`${p} must be a function, is ${type}`);
        }
        return p;
    }

    /**
     * Checks if the provided parameter is a valid JSON string.
     * 
     * @param {*} p - The parameter to check.
     * @returns {string|void}
     * @throws {TypeError} Throws if the parameter is not a valid JSON string.
     */
    private tJSON(p: any): TyperReturn<string> {
        const str = this.isType('string', p);
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
     * @param {*} p - The parameter to check.
     * @returns {Map|void}
     * @throws {TypeError} Throws if the parameter is not a Map.
     */
    private tMap(p: any): TyperReturn<Map<unknown, unknown>> {
        if (!(p instanceof Map)) {
            throw new TypeError(`${p} must be a Map.`);
        }
        return p;
    }

    /**
     * Checks if the provided parameter is a number.
     * @private
     * @param {*} p - The parameter to check.
     * @returns {number|void}
     * @throws {TypeError} Throws if the parameter is not a number.
     */
    private tNumber(p: any): TyperReturn<number> {
        const type = typeof p;
        if (typeof p !== "number") {
            throw new TypeError(`${p} must be a number, is ${typeof p}`);
        }
        return p;
    }

    /**
     * Checks if the provided parameter is not null.
     * 
     * @param {*} p - The parameter to check.
     * @returns {null|void}
     * @throws {TypeError} Throws if the parameter is null.
     */
    private tNull(p: any): TyperReturn<null> {
        if (p !== null) {
            throw new TypeError(`${p} must be null.`);
        }
        return p;
    }

    /**
     * Checks if the provided parameter is a object.
     * @private
     * @param {*} p - The parameter to check.
     * @returns {object|void}
     * @throws {TypeError} Throws if the parameter is not a object.
     */
    private tObject(p: any): TyperReturn<object> {
        const type = typeof p;
        if (type !== "object" || Array.isArray(p)) {
            throw new TypeError(`${p} must be a non-array object, is ${Array.isArray(p) ? 'array' : type}`);
        }
        return p;
    }

    /**
     * Checks if the provided parameter is a RegExp.
     * 
     * @param {*} p - The parameter to check.
     * @returns {RegExp|void}
     * @throws {TypeError} Throws if the parameter is not a RegExp.
     */
    private tRegex(p: any): TyperReturn<RegExp> {
        if (!(p instanceof RegExp)) {
            throw new TypeError(`${p} must be a RegExp.`);
        }
        return p;
    }

    /**
     * Checks if the provided parameter is a Set.
     * 
     * @param {*} p - The parameter to check.
     * @returns {Set|void}
     * @throws {TypeError} Throws if the parameter is not a Set.
     */
    private tSet(p: any): TyperReturn<Set<unknown>> {
        if (!(p instanceof Set)) {
            throw new TypeError(`${p} must be a Set.`);
        }
        return p;
    }

    /**
     * Checks if the provided parameter is a string.
     * @private
     * @param {*} p - The parameter to check.
     * @returns {string|void}
     * @throws {TypeError} Throws if the parameter is not a string.
     */
    private tString(p: any): TyperReturn<string> {
        const type = typeof p;
        if (type !== "string") {
            throw new TypeError(`${p} must be a string, is ${type}`);
        }
        return p;
    }

    /**
     * Checks if the provided parameter is a symbol.
     * @private
     * @param {*} p - The parameter to check.
     * @returns {Symbol|void}
     * @throws {TypeError} Throws if the parameter is not a symbol.
     */
    private tSymbol(p: any): TyperReturn<Symbol> {
        const type = typeof p;
        if (type !== "symbol") {
            throw new TypeError(`${p} must be a symbol, is ${type}`);
        }
        return p;
    }

    /**
     * Checks if the provided parameter is a TypedArray.
     * 
     * @param {*} p - The parameter to check.
     * @returns {TypedArray|void}
     * @throws {TypeError} Throws if the parameter is not a TypedArray.
     */
    private tTypedArray(p: any): TyperReturn<ArrayBufferView<ArrayBufferLike>> {
        if (!ArrayBuffer.isView(p) || p instanceof DataView) {
            throw new TypeError(`${p} must be a TypedArray.`);
        }
        return p;
    }

    /**
     * Checks if the provided parameter is undefined.
     * @private
     * @param {*} p - The parameter to check.
     * @returns {undefined|void}
     * @throws {TypeError} Throws if the parameter is not undefined.
     */
    private tUndefined(p: any): TyperReturn<undefined> {
        const type = typeof p;
        if (type !== "undefined") {
            throw new TypeError(`${p} must be undefined, is ${typeof p}`);
        }
        return p;
    }

    /**
     * Checks if the provided parameter is an array of a specified type.
     * 
     * @param {string} elementType - The type of elements that the array should contain.
     * @param {*} p - The parameter to check.
     * @returns {Array|void}
     * @throws {TypeError} Throws if the parameter is not an array of the specified type.
     */
    public isArrayOf(elementType: string, p: any): TyperReturn<any[]> {
        const arr = this.isType('array', p);
        arr.forEach((item: any) => this.isType(elementType, item));
        return arr;
    }

    /**
     * Checks if the provided parameter is a valid email address.
     * 
     * @param {*} p - The parameter to check.
     * @returns {string|void}
     * @throws {TypeError} Throws if the parameter is not a valid email address.
     */
    public isEmail(p: any): TyperReturn<string> {
        const str = this.isType('string', p);
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
     * @param {*} p - The parameter to check.
     * @returns {number|void}
     * @throws {TypeError} Throws if the parameter is not a number within the specified range.
     */
    public isInRange(min: number, max: number, p: any): TyperReturn<number> {
        const num = this.isType('number', p);
        if (num < min || num > max) {
            throw new TypeError(`${p} must be between ${min} and ${max}, is ${num}`);
        }
        return num;
    }

    /**
     * Checks if the provided parameter is an integer.
     * 
     * @param {*} p - The parameter to check.
     * @returns {Number|Void}
     * @throws {TypeError} Throws if the parameter is not an integer.
     */
    public isInteger(p: any) {
        const num = this.isType('number', p);
        if (!Number.isInteger(num)) {
            throw new TypeError(`${p} must be an integer.`);
        }
        return num;
    }

    /**
     * Checks if the provided parameter is a non-empty array.
     * 
     * @param {*} p - The parameter to check.
     * @returns {Array|Void}
     * @throws {TypeError} Throws if the parameter is not a non-empty array.
     */
    public isNonEmptyArray(p: any) {
        const arr = this.isType('array', p);
        if (arr.length === 0) {
            throw new TypeError(`${p} must be a non-empty array.`);
        }
        return arr;
    }

    /**
     * Checks if the provided parameter is a non-empty string.
     * 
     * @param {*} p - The parameter to check.
     * @returns {String|Void}
     * @throws {TypeError} Throws if the parameter is not a non-empty string.
     */
    public isNonEmptyString(p: any) {
        const str = this.isType('string', p);
        if (str.trim().length === 0) {
            throw new TypeError(`${p} must be a non-empty string.`);
        }
        return str;
    }

    /**
     * Checks if the provided parameter is one of the specified values.
     * 
     * @param {Array<*>} values - The values to check against.
     * @param {*} p - The parameter to check.
     * @returns {*}
     * @throws {TypeError} Throws if the parameter is not one of the specified values.
     */
    public isOneOf(values: any[], p: any) {
        if (!values.includes(p)) {
            throw new TypeError(`${p} must be one of [${values.join(', ')}], is ${p}`);
        }
        return p;
    }

    /**
     * Checks if the provided parameter is a valid phone number.
     * 
     * @param {*} p - The parameter to check.
     * @returns {String|Void}
     * @throws {TypeError} Throws if the parameter is not a valid phone number.
     */
    public isPhoneNumber(p: any) {
        const str = this.isType('string', p);
        const phoneRegex = /^\+?[0-9\s\-()]*$/;
        if (!phoneRegex.test(str)) {
            throw new TypeError(`${p} must be a valid phone number.`);
        }
        return str;
    }

    /**
     * Checks if the provided parameter is a positive number.
     * 
     * @param {*} p - The parameter to check.
     * @returns {Number|Void}
     * @throws {TypeError} Throws if the parameter is not a positive number.
     */
    public isPositiveNumber(p: any) {
        const num = this.isType('number', p);
        if (num < 0) {
            throw new TypeError(`${p} must be a positive number.`);
        }
        return num;
    }

    /**
     * Checks if the provided parameter is a positive integer.
     * 
     * @param {*} p - The parameter to check.
     * @returns {Number|Void}
     * @throws {TypeError} Throws if the parameter is not a positive integer.
     */
    public isPositiveInteger(p: any) {
        const num = this.isInteger(p);
        if (num < 0) {
            throw new TypeError(`${p} must be a positive integer.`);
        }
        return num;
    }

    /**
     * Checks if the provided parameter is a positive number.
     * 
     * @param {*} p - The parameter to check.
     * @returns {Number|Void}
     * @throws {TypeError} Throws if the parameter is not a positive number.
     */
    public isNegativeNumber(p: any) {
        const num = this.isType('number', p);
        if (num >= 0) {
            throw new TypeError(`${p} must be a negative number.`);
        }
        return num;
    }

    /**
     * Checks if the provided parameter is a positive integer.
     * 
     * @param {*} p - The parameter to check.
     * @returns {Number|Void}
     * @throws {TypeError} Throws if the parameter is not a positive integer.
     */
    public isNegativeInteger(p: any) {
        const num = this.isInteger(p);
        if (num >= 0) {
            throw new TypeError(`${p} must be a positive integer.`);
        }
        return num;
    }

    /**
     * Checks if the provided parameter is a valid URL.
     * 
     * @param {*} p - The parameter to check.
     * @returns {String|Void}
     * @throws {TypeError} Throws if the parameter is not a valid URL.
     */
    public isURL(p: any) {
        const str = this.isType('string', p);
        try {
            new URL(str);
        } catch (_) {
            throw new TypeError(`${p} must be a valid URL.`);
        }
        return str;
    }

    /**
     * Check if the parameter matches one of the specified types.
     * @param {Array|String} types - The types to check against.
     * @param {*} p - The parameter to check.
     * @returns {*}
     * @throws {TypeError} Throws if the parameter does not match any of the specified types.
     */
    public isType(types: string | string[], p: any) {
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
                return p;
            } catch (e: unknown) {
                const catchedError = e as Error;
                errors.push(catchedError.message);
            }
        }
        throw new TypeError(`None of the types matched for ${p}: ${errors.join(', ')}`);
    }

    /**
     * Checks if the provided value matches one or more specified types.
     * @param {*} value - The value to check.
     * @param {string | string[]} types - One or more types to check against.
     * @returns {boolean} Returns true if the value matches any type, false otherwise.
     */
    public is(value: any, types: string | string[]): boolean {
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
     * @param {Record<string, any>} schema - The expected structure.
     * @param {Record<string, any>} obj - The object to validate.
     * @returns {StructureValidationReturn} - List of errors, or an empty array if valid.
     */
    public checkStructure(schema: Record<string, any>, obj: Record<string, any>, path = ''): StructureValidationReturn {
        const errors: string[] = [];

        Object.keys(schema).forEach(key => {
            const expectedType = schema[key];
            const value = obj[key];
            const fullPath = path ? `${path}.${key}` : key;

            if (typeof expectedType === "string" || Array.isArray(expectedType)) {
                if (!this.is(value, expectedType)) {
                    errors.push(`Expected "${fullPath}" to be ${expectedType}, got ${typeof value}`);
                }
            } else if (typeof expectedType === "object" && value !== undefined) {
                const nestedValidation = this.checkStructure(expectedType, value, fullPath);
                errors.push(...nestedValidation.errors);
            }
        });

        const returnVal = {
            isValid: !(errors.length > 0),
            errors
        };

        return returnVal;
    }

    /**
     * Validates an object against a schema.
     * @param {Record<string, string | string[]>} schema - The expected types for each key.
     * @param {Record<string, any>} obj - The object to validate.
     * @returns {string[]} - An array of validation errors, or an empty array if valid.
     */
    public validate(schema: Record<string, string | string[]>, obj: Record<string, any>): string[] {
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
     * @param {any} value - The value to check.
     * @param {string | string[]} expectedType - The expected type(s).
     */
    public assert(value: any, expectedType: string | string[]): void {
        if (!this.is(value, expectedType)) {
            console.warn(`[Typer] Assertion failed: Expected ${expectedType}, got ${typeof value}`, value);
        }
    }

    /**
     * Expects a function to conform to specified input and output types.
     * 
     * @param {Function} funct - The function to type-check.
     * @param {Object} types - The expected types for the function's parameters and return value.
     * @param {Array<string>} types.paramType - The expected type of the main argument.
     * @param {Array<string>} types.returnType - The expected return type of the function.
     * @returns {Function} A new function that type-checks its arguments and return value.
     * @throws {Error} If the types object does not contain exactly 3 keys or the required type properties.
     * @throws {TypeError} If the function or types object does not conform to the expected types.
     */
    public expect(funct: Function, types: TyperExpectTypes) {
        if (Object.keys(types).length !== 2) {
            throw new Error(`Expected 2 types (paramTypes and returnTypes), got ${Object.keys(types).length}`);
        }

        if (types.paramTypes === undefined || !types.returnType || (!types.returnType && types.returnType !== 'void')) {
            throw new Error(`Expected paramType, returnType types, got ${Object.keys(types)}`);
        }

        funct = this.isType('f', funct);
        types = this.isType('o', types);

        return (...args: any) => {
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
                throw new Error(`Expected ${paramTypes.length} paramTypes arguments, but got ${args[0].length}`);
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
     * @param {*} result - The result to check.
     * @param {Array<string>} returnTypes - The expected return types.
     * @throws {TypeError} Throws if the result does not match any of the expected return types.
     */
    private verifyReturnType(result: any, returnTypes: TyperExpectTypes['returnType']) {
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

export default new Typer();