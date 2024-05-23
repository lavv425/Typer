"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Class representing a type checker.
 * @author Michael Lavigna
 * @version 1.3
 */
class Typer {
    /**
     * creates the types mapping
     * type-->function
     */
    constructor() {
        /**
         * @private
         * @type {Object.<string, Function>}
         */
        this.TypesMap = {
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
     * Checks if the provided parameter is an array.
     * @private
     * @param {*} p - The parameter to check.
     * @returns {Array|void}
     * @throws {TypeError} Throws if the parameter is not an array.
     */
    tArray(p) {
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
    tArrayBuffer(p) {
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
    tBigint(p) {
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
    tBoolean(p) {
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
    tDataView(p) {
        if (!(p instanceof DataView)) {
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
    tDate(p) {
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
    tDomElement(p) {
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
    tFunction(p) {
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
     * @returns {object}
     * @throws {TypeError} Throws if the parameter is not a valid JSON string.
     */
    tJSON(p) {
        const str = this.isType('string', p);
        try {
            JSON.parse(str);
        }
        catch (e) {
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
    tMap(p) {
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
    tNumber(p) {
        const type = typeof p;
        if (type !== "number") {
            throw new TypeError(`${p} must be a number, is ${typeof p}`);
        }
        return p;
    }
    /**
     * Checks if the provided parameter is not null.
     *
     * @param {*} p - The parameter to check.
     * @returns {*}
     * @throws {TypeError} Throws if the parameter is null.
     */
    tNull(p) {
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
    tObject(p) {
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
    tRegex(p) {
        if (!(p instanceof RegExp)) {
            throw new TypeError(`${p} must be a RegExp.`);
        }
        return p;
    }
    /**
     * Checks if the provided parameter is a Set.
     *
     * @param {*} p - The parameter to check.
     * @returns {Set<any>|void}
     * @throws {TypeError} Throws if the parameter is not a Set.
     */
    tSet(p) {
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
    tString(p) {
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
    tSymbol(p) {
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
    tTypedArray(p) {
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
    tUndefined(p) {
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
     * @returns {array|void}
     * @throws {TypeError} Throws if the parameter is not an array of the specified type.
     */
    isArrayOf(elementType, p) {
        const arr = this.isType('array', p);
        if (arr !== undefined) {
            arr.forEach(item => this.isType(elementType, item));
        }
        return arr;
    }
    /**
     * Checks if the provided parameter is a valid email address.
     *
     * @param {*} p - The parameter to check.
     * @returns {string|void}
     * @throws {TypeError} Throws if the parameter is not a valid email address.
     */
    isEmail(p) {
        const str = this.isType('string', p);
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; //make it better
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
    isInRange(min, max, p) {
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
     * @returns {number|void}
     * @throws {TypeError} Throws if the parameter is not an integer.
     */
    isInteger(p) {
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
     * @returns {Array|void}
     * @throws {TypeError} Throws if the parameter is not a non-empty array.
     */
    isNonEmptyArray(p) {
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
     * @returns {string|void}
     * @throws {TypeError} Throws if the parameter is not a non-empty string.
     */
    isNonEmptyString(p) {
        const str = this.isType('string', p);
        if (str !== undefined && str.trim().length === 0) {
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
    isOneOf(values, p) {
        if (!values.includes(p)) {
            throw new TypeError(`${p} must be one of [${values.join(', ')}], is ${p}`);
        }
        return p;
    }
    /**
     * Checks if the provided parameter is a valid phone number.
     *
     * @param {*} p - The parameter to check.
     * @returns {string|void}
     * @throws {TypeError} Throws if the parameter is not a valid phone number.
     */
    isPhoneNumber(p) {
        const str = this.isType('string', p);
        const phoneRegex = /^\+?[0-9\s\-()]*$/;
        if (str !== undefined && !phoneRegex.test(str)) {
            throw new TypeError(`${p} must be a valid phone number.`);
        }
        return str;
    }
    /**
     * Checks if the provided parameter is a positive number.
     *
     * @param {*} p - The parameter to check.
     * @returns {number|void}
     * @throws {TypeError} Throws if the parameter is not a positive number.
     */
    isPositiveNumber(p) {
        const num = this.isType('number', p);
        if (num !== undefined && num < 0) {
            throw new TypeError(`${p} must be a positive number.`);
        }
        return num;
    }
    /**
     * Checks if the provided parameter is a positive integer.
     *
     * @param {*} p - The parameter to check.
     * @returns {number|void}
     * @throws {TypeError} Throws if the parameter is not a positive integer.
     */
    isPositiveInteger(p) {
        const num = this.isInteger(p);
        if (num !== undefined && num < 0) {
            throw new TypeError(`${p} must be a positive integer.`);
        }
        return num;
    }
    /**
     * Checks if the provided parameter is a positive number.
     *
     * @param {*} p - The parameter to check.
     * @returns {number|void}
     * @throws {TypeError} Throws if the parameter is not a positive number.
     */
    isNegativeNumber(p) {
        const num = this.isType('number', p);
        if (num !== undefined && num >= 0) {
            throw new TypeError(`${p} must be a negative number.`);
        }
        return num;
    }
    /**
     * Checks if the provided parameter is a positive integer.
     *
     * @param {*} p - The parameter to check.
     * @returns {number|void}
     * @throws {TypeError} Throws if the parameter is not a positive integer.
     */
    isNegativeInteger(p) {
        const num = this.isInteger(p);
        if (num !== undefined && num >= 0) {
            throw new TypeError(`${p} must be a positive integer.`);
        }
        return num;
    }
    /**
     * Checks if the provided parameter is a valid URL.
     *
     * @param {*} p - The parameter to check.
     * @returns {string|void}
     * @throws {TypeError} Throws if the parameter is not a valid URL.
     */
    isURL(p) {
        const str = this.isType('string', p);
        try {
            if (str !== undefined) {
                new URL(str);
            }
        }
        catch (_) {
            throw new TypeError(`${p} must be a valid URL.`);
        }
        return str;
    }
    /**
     * Check if the parameter matches one of the specified types.
     * @param {Array|string} types - The types to check against.
     * @param {*} p - The parameter to check.
     * @returns {*}
     * @throws {TypeError} Throws if the parameter does not match any of the specified types.
     */
    isType(types, p) {
        //if types is not an array is converted to a "single" array
        types = Array.isArray(types) ? types : [types];
        // creating typeCheckers mapping types
        const typeCheckers = types.map(type => {
            const checker = this.TypesMap[type.toLowerCase()];
            if (!checker) {
                throw new Error(`Unknown type: ${type}`);
            }
            return checker.bind(this);
        });
        const errors = [];
        for (const check of typeCheckers) {
            try {
                check(p);
                return p;
            }
            catch (e) {
                errors.push(e.message);
            }
        }
        throw new TypeError(`None of the types matched: ${errors.join(', ')}`);
    }
    /**
     * Expects a function to conform to specified input and output types.
     *
     * @param {Function} funct - The function to type-check.
     * @param {object} types - The expected types for the function's parameters and return value.
     * @param {string|Array<string>} types.paramTypes - The expected type of the main argument.
     * @param {string|Array<string>} types.returnType - The expected return type of the function.
     * @returns {Function} A new function that type-checks its arguments and return value.
     * @throws {Error} If the types object does not contain exactly 3 keys or the required type properties.
     * @throws {TypeError} If the function or types object does not conform to the expected types.
     */
    expect(funct, types) {
        if (Object.keys(types).length !== 2) {
            throw new Error(`Expected 2 types, got ${Object.keys(types).length}`);
        }
        if (types.paramTypes === undefined || !types.returnType || (!types.returnType && types.returnType !== 'void')) {
            throw new Error(`Expected paramType, returnType types, got ${Object.keys(types)}`);
        }
        funct = this.isType('f', funct);
        types = this.isType('o', types);
        return (...args) => {
            const paramTypes = Array.isArray(types.paramTypes) ? types.paramTypes : [types.paramTypes];
            const returnTypes = Array.isArray(types.returnType) ? types.returnType : [types.returnType];
            if (args.length !== paramTypes.length) {
                throw new Error(`Expected ${paramTypes.length} arguments, but got ${args.length}`);
            }
            // verify num of arguments
            if (paramTypes.length === 1) {
                // verify type of args
                args.forEach((arg) => {
                    this.isType(paramTypes[0], arg);
                });
            }
            else if (args.length !== paramTypes.length) {
                throw new Error(`Expected ${paramTypes.length} paramTypes arguments, but got ${args[0].length}`);
            }
            else {
                // verify type of args
                args.forEach((arg, index) => {
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
            }
            else {
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
    verifyReturnType(result, returnTypes) {
        const returnTypeErrors = [];
        const isReturnTypeValid = returnTypes.some(returnType => {
            try {
                if (returnType === 'void' && result === undefined) {
                    return true;
                }
                this.isType(returnType, result);
                return true;
            }
            catch (e) {
                returnTypeErrors.push(e.message);
                return false;
            }
        });
        if (!isReturnTypeValid) {
            throw new TypeError(`Return type mismatch: ${returnTypeErrors.join(', ')}`);
        }
    }
}
exports.default = Typer;
