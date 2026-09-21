"use strict";

import type { Error } from "./Types/Globals";
import type { StandardSchemaV1 } from "./Types/StandardSchema";
import type { BoundValidators, Coercions, DiscriminatedUnion, FieldChecker, Infer, KnownAlias, MergeSchema, OmitSchema, ParseResult, PartialSchema, PickSchema, Schema, StandardValidator, StructureValidationReturn, TypeKey, TypeMap, TyperExpectTypes, TyperReturn, TypeRegistry, TypeSlot, ValidateSchema, ValidationIssue, Validator, ValueChecker } from "./Types/Typer";
import { TyperError } from "./Errors/TyperError";
import { constraintOf, formatIssues, issueError, issueMessages, makeIssue, toStandardIssues } from "./Utils/Issues";
import * as Patterns from "./Constants/Patterns";
import { STANDARD_VENDOR } from "./Types/StandardSchema";
import { SAFE_RESULT } from "./Constants/Symbols";
import type { SafeReporting } from "./Constants/Symbols";
import { DANGEROUS_KEYS, stripDangerousKeys } from "./Utils/Sanitize";
import { indexPath, joinPath } from "./Utils/Path";

/**
 * Own-property test that does not go through the object being tested, so a
 * schema carrying a `hasOwnProperty` key of its own cannot shadow it.
 */
const hasOwnKey = (target: object, key: string): boolean => Object.prototype.hasOwnProperty.call(target, key);

/**
 * Strings `coerce.boolean` reads as `true`. Anything not listed here or in
 * {@link FALSY_STRINGS} is rejected rather than guessed at.
 */
const TRUTHY_STRINGS = new Set(['true', '1', 'yes', 'on']);

/** Strings `coerce.boolean` reads as `false`. */
const FALSY_STRINGS = new Set(['false', '0', 'no', 'off']);

/**
 * Class representing a type checker.
 * Version: 4.0.0
 * @author Michael Lavigna - <https://michaellavigna.com> - <michael.lavigna@hotmail.it>
 * @since 4.0.0
 */
export class Typer<TRegistry extends TypeRegistry = {}> {
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
     * Snapshot of the original built-in entries of `typesMap`, taken before any
     * user registration. `resolvePredicate` compares against it to tell an
     * untouched built-in (safe to serve from `builtinPredicates`) from one the
     * user has overridden via `registerType(name, fn, true)`.
     */
    private builtinCheckers!: Record<string, (value: unknown) => unknown>;

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
        this.builtinCheckers = { ...this.typesMap };
    }

    /**
     * @private
     * Lazily-built cache behind {@link validators}. Declared as a field so the
     * instance shape is fixed at construction.
     */
    private boundValidators: BoundValidators<Typer<TRegistry>> | undefined = undefined;

    /**
     * The standalone validators, pre-bound to this instance.
     *
     * The schema API invites passing validators around as values, but
     * `{ id: typer.isPositiveInteger }` loses `this` and fails with an opaque
     * "Cannot read properties of undefined" — even for input that is valid.
     * These are bound, so they can be passed, destructured and stored freely.
     *
     * Built on first access and cached. Binding all of them eagerly onto the
     * instance was measured to slow every other method down several-fold, by
     * pushing the object out of V8's fast property mode — hence the single
     * lazily-populated slot.
     *
     * @example
     * const schema = typer.schema({
     *     id:    typer.validators.isPositiveInteger,
     *     email: typer.validators.isEmail,
     * });
     *
     * // Equivalent, with no accessor:
     * const same = typer.schema({ id: (v) => typer.isPositiveInteger(v) });
     */
    public get validators(): BoundValidators<Typer<TRegistry>> {
        if (this.boundValidators !== undefined) return this.boundValidators;

        const bound: Record<string, unknown> = {};
        const self = this as unknown as Record<string, unknown>;
        // Selected by name so validators added later are covered automatically.
        // `is`/`isType` are excluded: they take a type argument first, so they
        // are not `Validator`s, and they are the hot path.
        for (const name of Object.getOwnPropertyNames(Typer.prototype)) {
            if (name === 'is' || name === 'isType') continue;
            if (!name.startsWith('is') && !name.startsWith('as')) continue;

            // Read the implementation off `this`, so a subclass override wins.
            const method = self[name];
            if (typeof method === 'function') {
                bound[name] = (method as (...args: unknown[]) => unknown).bind(this);
            }
        }

        this.boundValidators = bound as BoundValidators<Typer<TRegistry>>;
        return this.boundValidators;
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
        const pred = this.resolvePredicate(rawType);
        this.predCache.set(rawType, pred);
        if (pred === null) throw new Error(`Unknown type: ${rawType}`);
        return pred;
    }

    /**
     * Resolves a type name to a boolean predicate **without throwing**,
     * returning `null` when the name is neither a built-in alias nor a
     * registered custom type.
     *
     * The schema compiler needs this non-throwing form because it reports
     * unknown types through the error array rather than as exceptions, and
     * because it resolves every type name once at compile time.
     */
    private resolvePredicate(rawType: string): ((value: unknown) => boolean) | null {
        const norm = rawType.toLowerCase().trim();
        const checker = this.typesMap[norm];
        if (!checker) return null;

        // The fast predicate is only equivalent to the registered checker while
        // that checker is still the original built-in. `registerType(…, true)`
        // can replace a built-in alias, and the override has to win — otherwise
        // it would be silently ignored on every path that uses predicates.
        if (checker === this.builtinCheckers[norm]) {
            const builtin = this.builtinPredicates[norm];
            if (builtin) return builtin;
        }

        // Custom (or overridden) type — wrap the throwing checker into a boolean predicate.
        return (v: unknown): boolean => {
            try { checker.call(this, v); return true; } catch { return false; }
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
        this.invalidateCaches();
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
        this.invalidateCaches();
    }

    /**
     * Drops every cache derived from `typesMap`.
     *
     * Both caches resolve type names eagerly — `predCache` per raw string,
     * `schemaCheckerCache` per schema object at compile time — so registering,
     * overriding or removing a type must invalidate them, otherwise a schema
     * compiled before the change keeps validating against the old definition.
     */
    private invalidateCaches(): void {
        this.predCache.clear();
        // WeakMap has no clear(); replacing it drops every compiled schema.
        this.schemaCheckerCache = new WeakMap();
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

    // -----------------------------------------------------------------------
    //  Built-in type checkers
    //
    //  Since the predicate fast-path was introduced, these run only to *reject*
    //  a value: every success is answered by `builtinPredicates` before a
    //  checker is consulted. They remain the single source of the error
    //  messages, and the fallback for aliases the user has overridden.
    //
    //  TODO(tech-debt): as a result their `return p` statements are unreachable
    //  for built-in aliases and show as the only uncovered lines in the suite.
    //  Collapsing each checker into a (predicate, message) pair would remove
    //  the duplication, at the cost of rewording some errors — a breaking
    //  change deliberately deferred.
    // -----------------------------------------------------------------------

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
        // Resolve the element predicate once instead of re-resolving the type
        // name for every item; only re-enter isType() to build the error
        // message for the first item that actually fails.
        const pred = this.getPred(elementType);
        for (let i = 0; i < arr.length; i++) {
            if (!pred(arr[i])) this.isType(elementType, arr[i]);
        }
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
        if (!Patterns.EMAIL.test(str)) {
            throw issueError('invalid_format', `${p} must be a valid email address.`, 'email');
        }
        return str;
    }

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
    public isInRange(min: number, max: number, p: unknown): number {
        const num = this.isType<number>('number', p);
        // Split so the issue says which end of the range was missed.
        const message = `value must be between ${min} and ${max}`;
        const meta = { minimum: min, maximum: max, value: num };
        if (num < min) throw issueError('too_small', message, `${min}..${max}`, 'number', meta);
        if (num > max) throw issueError('too_big', message, `${min}..${max}`, 'number', meta);
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
            throw issueError('invalid_format', `${p} must be an integer.`, 'integer');
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
            throw issueError('too_small', `${p} must be a non-empty array.`, undefined, undefined, { minimum: 1 });
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
            throw issueError('too_small', `${p} must be a non-empty string.`, undefined, undefined, { minimum: 1 });
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
            throw issueError('invalid_format', `${p} must be a valid phone number.`, 'phone');
        }

        // More restrictive regex for phone number validation
        // Allows: +country code, parentheses, spaces, hyphens, and periods
        // Requires at least 7 digits, max 15 (international standard)
        if (!Patterns.PHONE.test(str)) {
            throw issueError('invalid_format', `${p} must be a valid phone number.`, 'phone');
        }

        // Count actual digits (excluding + sign)
        const digitCount = digitsOnly.replace(Patterns.LEADING_PLUS, '').length;

        // Validate digit count (7-15 digits for international numbers)
        if (digitCount < 7 || digitCount > 15) {
            throw issueError('invalid_format', `${p} must be a valid phone number with 7-15 digits.`, 'phone');
        }

        // Check for invalid patterns
        if (str.includes('..') || str.includes('--') || str.includes('  ')) {
            throw issueError('invalid_format', `${p} must be a valid phone number.`, 'phone');
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
            throw issueError('too_small', `${p} must be a positive number.`, undefined, undefined, { minimum: 0 });
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
            throw issueError('too_small', `${p} must be a positive integer.`, undefined, undefined, { minimum: 0 });
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
            throw issueError('too_big', `${p} must be a negative number.`);
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
            throw issueError('too_big', `${p} must be a negative integer.`, undefined, undefined, { maximum: -1 });
        }
        return num;
    }

    /**
     * Type-safe string validation
     * @param {unknown} value - The value to check
     * @returns {value is string} Type guard for string
     */
    public isString(value: unknown): value is string {
        return typeof value === 'string';
    }

    /**
     * Type-safe number validation
     * @param {unknown} value - The value to check
     * @returns {value is number} Type guard for number
     */
    public isNumber(value: unknown): value is number {
        return typeof value === 'number';
    }

    /**
     * Type-safe boolean validation
     * @param {unknown} value - The value to check
     * @returns {value is boolean} Type guard for boolean
     */
    public isBoolean(value: unknown): value is boolean {
        return typeof value === 'boolean';
    }

    /**
     * Type-safe array validation
     * @template T - The expected element type
     * @param {unknown} value - The value to check
     * @returns {value is T[]} Type guard for array
     */
    public isArray<T = unknown>(value: unknown): value is T[] {
        return Array.isArray(value);
    }

    /**
     * Type-safe object validation
     * @template T - The expected object type
     * @param {unknown} value - The value to check
     * @returns {value is T} Type guard for object
     */
    public isObject<T extends Record<string, unknown> = Record<string, unknown>>(value: unknown): value is T {
        // Mirrors the 'object' alias exactly, including the long-standing quirk
        // that `null` passes because `typeof null === 'object'`. Use
        // `isPlainObject` when you need `null` (and class instances) rejected.
        return typeof value === 'object' && !Array.isArray(value);
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
            throw issueError('invalid_format', `${p} must be a valid URL.`, 'url');
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
     * Declaring the schema in a variable is also what makes it fast: compiled
     * checkers are cached by object identity, so a schema hoisted out of the
     * handler is compiled once, while a literal written inside it is a new
     * object every call and is recompiled every time.
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
    public schema<const S extends ValidateSchema<S, KnownAlias<TRegistry>>>(definition: S): S {
        return definition;
    }

    /**
     * @private
     * Lazily-built cache behind {@link coerce}, for the same reason as
     * {@link boundValidators}: a field declared at construction keeps the
     * instance shape fixed.
     */
    private coercions: Coercions | undefined = undefined;

    /**
     * Validators that convert before validating.
     *
     * Query strings, form data and environment variables arrive as strings, so
     * without these every HTTP handler rewrites the conversion by hand — which
     * is exactly where the mistakes are made. Each one rejects what it cannot
     * convert rather than inventing a value, which is the difference between
     * these and the bare `Number()` / `Boolean()` they replace:
     *
     * | Input | `Number()` / `Boolean()` | `typer.coerce.*` |
     * |---|---|---|
     * | `''` | `0` | rejected |
     * | `'   '` | `0` | rejected |
     * | `null` | `0` | rejected |
     * | `[]` | `0` | rejected |
     * | `'abc'` | `NaN` | rejected |
     * | `'false'` | `true` | `false` |
     * | `'0'` | `true` | `false` |
     *
     * In a schema slot the converted value replaces the original, so the
     * object that comes out of `parse` holds the numbers and dates, not the
     * strings that arrived.
     *
     * @example
     * const query = typer.parse({
     *     page:    typer.coerce.number,
     *     perPage: typer.coerce.number,
     *     archived: typer.coerce.boolean,
     *     since:   typer.coerce.date,
     * }, req.query);
     * // { page: 2, perPage: 50, archived: false, since: Date }
     */
    public get coerce(): Coercions {
        return (this.coercions ??= {
            number: (value: unknown): number => this.coerceNumber(value),
            boolean: (value: unknown): boolean => this.coerceBoolean(value),
            date: (value: unknown): Date => this.coerceDate(value),
        });
    }

    /**
     * Converts to a number, rejecting everything `Number()` would silently turn
     * into `0` or `NaN`.
     *
     * @param value - The value to convert.
     * @throws {TyperError} When the value has no unambiguous numeric reading.
     */
    private coerceNumber(value: unknown): number {
        if (typeof value === 'number') {
            if (Number.isNaN(value)) throw issueError('invalid_type', `NaN cannot be coerced to a number.`, 'number', 'NaN');
            return value;
        }

        if (typeof value === 'string') {
            // `Number('')` and `Number('   ')` are 0 — the classic trap, and
            // the reason an absent query parameter must not read as zero.
            const trimmed = value.trim();
            if (trimmed === '') throw issueError('invalid_type', `"" cannot be coerced to a number.`, 'number', 'string');

            const parsed = Number(trimmed);
            if (Number.isNaN(parsed)) throw issueError('invalid_type', `"${value}" cannot be coerced to a number.`, 'number', 'string');
            return parsed;
        }

        if (typeof value === 'boolean') return value ? 1 : 0;

        if (typeof value === 'bigint') {
            // Outside the safe range the conversion would lose digits without
            // saying so, which is worse than refusing.
            if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
                throw issueError('invalid_type', `${value}n is outside the safe integer range and cannot be coerced to a number.`, 'number', 'bigint');
            }
            return Number(value);
        }

        // `Number(null)`, `Number([])` and `Number([7])` are 0, 0 and 7.
        throw issueError('invalid_type', `${String(value)} cannot be coerced to a number.`, 'number', this.getType(value));
    }

    /**
     * Converts to a boolean by reading the value, not its truthiness —
     * `Boolean('false')` is `true`, which is never what a query string meant.
     *
     * @param value - The value to convert.
     * @throws {TyperError} When the value is not a recognised boolean spelling.
     */
    private coerceBoolean(value: unknown): boolean {
        if (typeof value === 'boolean') return value;

        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            if (TRUTHY_STRINGS.has(normalized)) return true;
            if (FALSY_STRINGS.has(normalized)) return false;
            throw issueError('invalid_type', `"${value}" cannot be coerced to a boolean.`, 'boolean', 'string');
        }

        // Only the two numbers that spell a boolean; 2 is not "true".
        if (value === 1) return true;
        if (value === 0) return false;

        throw issueError('invalid_type', `${String(value)} cannot be coerced to a boolean.`, 'boolean', this.getType(value));
    }

    /**
     * Converts to a valid `Date`, rejecting the `Invalid Date` that the `Date`
     * constructor produces instead of failing.
     *
     * @param value - The value to convert: a `Date`, epoch milliseconds, or a parseable string.
     * @throws {TyperError} When the value does not name a real instant.
     */
    private coerceDate(value: unknown): Date {
        if (value instanceof Date) {
            if (Number.isNaN(value.getTime())) throw issueError('invalid_type', `Invalid Date cannot be coerced to a date.`, 'date', 'date');
            return value;
        }

        if (typeof value === 'number' || typeof value === 'string') {
            if (typeof value === 'string' && value.trim() === '') {
                throw issueError('invalid_type', `"" cannot be coerced to a date.`, 'date', 'string');
            }
            // `new Date(NaN)` and `new Date(Infinity)` are both Invalid Date.
            const date = new Date(typeof value === 'string' ? value.trim() : value);
            if (Number.isNaN(date.getTime())) {
                throw issueError('invalid_type', `${String(value)} cannot be coerced to a date.`, 'date', typeof value);
            }
            return date;
        }

        throw issueError('invalid_type', `${String(value)} cannot be coerced to a date.`, 'date', this.getType(value));
    }

    /**
     * Derives a schema keeping only the listed keys.
     *
     * Real applications derive schemas from each other constantly —
     * `CreateUserDto` from `UserDto` — and rewriting the shape by hand means
     * two copies that diverge at the first change.
     *
     * @template S - The source schema
     * @template K - The keys to keep
     * @param {S} schema - The schema to derive from.
     * @param {readonly K[]} keys - The keys to keep.
     * @returns {PickSchema} A new schema; the source is untouched.
     * @example
     * const userSchema = typer.schema({ id: 'number', name: 'string', password: 'string' });
     * const publicUser = typer.pick(userSchema, ['id', 'name']);
     * type PublicUser = Infer<typeof publicUser>; // { id: number; name: string }
     */
    public pick<S extends Record<string, unknown>, const K extends keyof S>(schema: S, keys: readonly K[]): PickSchema<S, K> {
        const out: Record<string, unknown> = {};
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i] as string;
            if (hasOwnKey(schema, key)) out[key] = schema[key];
        }
        return out as PickSchema<S, K>;
    }

    /**
     * Derives a schema without the listed keys — the complement of {@link pick}.
     *
     * @template S - The source schema
     * @template K - The keys to drop
     * @param {S} schema - The schema to derive from.
     * @param {readonly K[]} keys - The keys to drop.
     * @returns {OmitSchema} A new schema; the source is untouched.
     * @example
     * const createUser = typer.omit(userSchema, ['id']);
     */
    public omit<S extends Record<string, unknown>, const K extends keyof S>(schema: S, keys: readonly K[]): OmitSchema<S, K> {
        const dropped = new Set<unknown>(keys);
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(schema)) {
            if (!dropped.has(key)) out[key] = schema[key];
        }
        return out as OmitSchema<S, K>;
    }

    /**
     * Combines two schemas. Keys of `extension` win where the two overlap.
     *
     * @template A - The base schema
     * @template B - The schema layered on top
     * @param {A} base - The schema to start from.
     * @param {B} extension - The schema whose keys take precedence.
     * @returns {MergeSchema} A new schema; neither source is touched.
     * @example
     * const timestamped = typer.merge(userSchema, { createdAt: 'date', updatedAt: 'date' });
     */
    public merge<A extends Record<string, unknown>, B extends Record<string, unknown>>(base: A, extension: B): MergeSchema<A, B> {
        return { ...base, ...extension } as MergeSchema<A, B>;
    }

    /**
     * Derives a schema with every key optional, or only the listed ones.
     *
     * A type-string slot simply gains the `?` marker. Every other slot kind has
     * no marker of its own in the schema language, so it is wrapped with
     * {@link optional} — which means a **nested schema or array slot made
     * optional reports its failures as one `custom` issue at the slot's path**,
     * rather than one issue per offending field. Pass the keys you actually
     * need if that matters.
     *
     * @template S - The source schema
     * @template K - The keys to make optional; all of them by default
     * @param {S} schema - The schema to derive from.
     * @param {readonly K[]} [keys] - The keys to make optional. Omit for all of them.
     * @returns {PartialSchema} A new schema; the source is untouched.
     * @example
     * const patchUser = typer.partial(typer.omit(userSchema, ['id']));
     * type PatchUser = Infer<typeof patchUser>; // { name?: string | null; … }
     *
     * // Only some keys:
     * const draft = typer.partial(userSchema, ['name']);
     */
    public partial<S extends Record<string, unknown>>(schema: S): PartialSchema<S>;
    public partial<S extends Record<string, unknown>, const K extends keyof S>(schema: S, keys: readonly K[]): PartialSchema<S, K>;
    public partial<S extends Record<string, unknown>>(schema: S, keys?: readonly (keyof S)[]): PartialSchema<S> {
        const targeted = keys === undefined ? null : new Set<unknown>(keys);
        const out: Record<string, unknown> = {};

        for (const key of Object.keys(schema)) {
            out[key] = targeted === null || targeted.has(key)
                ? this.optionalSlot(schema[key])
                : schema[key];
        }

        return out as PartialSchema<S>;
    }

    /**
     * Makes one schema slot optional, whatever kind of slot it is.
     *
     * A malformed slot is passed through untouched, so the schema compiler
     * still reports it as the malformed slot it is rather than as a mismatched
     * value.
     *
     * @param slot - The slot to rewrite.
     */
    private optionalSlot(slot: unknown): unknown {
        if (typeof slot === 'string') return slot.endsWith('?') ? slot : `${slot}?`;
        if (typeof slot === 'function') return this.optional(slot as Validator<unknown>);
        if (Array.isArray(slot)) {
            if (slot.length !== 1) return slot;
            return this.optional(this.arrayOf(this.slotElementValidator(slot[0])));
        }
        if (slot !== null && typeof slot === 'object') {
            return this.optional(this.objectOf(slot as never) as Validator<unknown>);
        }
        return slot;
    }

    /**
     * Turns an array slot's element definition into a validator, so the slot
     * can be rebuilt through {@link arrayOf}.
     *
     * @param element - The element definition: an alias, a validator, or a nested schema.
     */
    private slotElementValidator(element: unknown): Validator<unknown> {
        if (typeof element === 'function') return element as Validator<unknown>;
        if (typeof element === 'string') return (value: unknown) => this.isType(element, value);
        return this.objectOf(element as never) as Validator<unknown>;
    }

    /**
     * Registers a custom type **and tracks it in the instance's type**, so the
     * alias becomes usable in compile-time-checked schemas and resolves to `R`
     * in {@link Infer}.
     *
     * This is the type-aware counterpart of {@link registerType}: same runtime
     * behavior, but it returns a re-typed `Typer` instead of `void`. Chain the
     * calls and keep the returned instance — it is the *same* object, only seen
     * through a wider type.
     *
     * @template N - The alias being registered
     * @template R - The type the validator produces
     * @param {N} name - The alias to register.
     * @param {(value: unknown) => R} validator - Throws on invalid input, returns the value otherwise.
     * @param {boolean} override - Whether to replace an existing registration.
     * @returns {Typer} The same instance, typed with the new alias.
     * @throws {Error} If the alias is already registered and `override` is false.
     * @example
     * const typer = new Typer()
     *     .extend('positive', (v) => {
     *         if (typeof v !== 'number' || v <= 0) throw new TypeError('Must be positive');
     *         return v;
     *     });
     *
     * const schema = typer.schema({ qty: 'positive' }); // accepted
     * type Order = Infer<typeof schema, { positive: number }>; // { qty: number }
     * typer.schema({ qty: 'positiv' }); // compile error: unknown type alias
     */
    public extend<N extends string, R>(name: N, validator: (value: unknown) => R, override = false): Typer<TRegistry & Record<N, R>> {
        this.registerType<unknown, R>(name, validator, override);
        return this as Typer<TRegistry & Record<N, R>>;
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
     * **Declare the schema once, outside the hot path.** Compiled checkers are
     * cached by schema object identity, so a literal written inside a handler
     * is a new object on every call and is recompiled every time — about an
     * order of magnitude slower (78 ns hoisted against 873 ns inline), with
     * nothing to show for it:
     *
     * ```typescript
     * const userSchema = typer.schema({ id: 'number' });   // once
     * app.post('/u', (req) => typer.parse(userSchema, req.body));
     *
     * app.post('/u', (req) => typer.parse({ id: 'number' }, req.body)); // recompiles
     * ```
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
    public parse<const S extends ValidateSchema<S, KnownAlias<TRegistry>>>(schema: S, value: unknown): Infer<S, TRegistry>;
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
            const issues = this.getCompiledChecker(typesOrSchemaOrValidator as Record<string, unknown>)(value, '');
            if (issues.length > 0) {
                throw new TyperError(formatIssues(issues), issues);
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
    public safeParse<const S extends ValidateSchema<S, KnownAlias<TRegistry>>>(schema: S, value: unknown): ParseResult<Infer<S, TRegistry>>;
    public safeParse<T>(types: string | readonly string[], value: unknown): ParseResult<T>;
    public safeParse(typesOrSchemaOrValidator: unknown, value: unknown): ParseResult<unknown> {
        // Schema fast path: report the failure instead of throwing it and
        // catching it one frame later. For safeParse a mismatch is an expected
        // outcome, and building an Error — its stack capture in particular — is
        // by far the most expensive part of a failed validation.
        if (typesOrSchemaOrValidator !== null && typeof typesOrSchemaOrValidator === "object" && !Array.isArray(typesOrSchemaOrValidator)) {
            const issues = this.getCompiledChecker(typesOrSchemaOrValidator as Record<string, unknown>)(value, '');
            return issues.length === 0
                ? { success: true, data: value }
                : Typer.failure(issues);
        }

        // The same fast path, for validators that can report without throwing.
        // `objectOf(schema)` wraps the very checker the branch above uses, so
        // routing it through `parse` made the wrapper cost an order of
        // magnitude more than the schema it wraps.
        if (typeof typesOrSchemaOrValidator === "function") {
            const safeRun = (typesOrSchemaOrValidator as SafeReporting<unknown>)[SAFE_RESULT];
            if (safeRun !== undefined) return safeRun(value);
            return Typer.runCatching(typesOrSchemaOrValidator as Validator<unknown>, value);
        }

        return Typer.runCatching((input: unknown) => this.parse(typesOrSchemaOrValidator as never, input), value);
    }

    /**
     * Runs a throwing validator and reports the outcome as a {@link ParseResult}.
     *
     * The fallback for everything with no non-throwing path of its own: a
     * user-supplied validator, a type alias, an array of aliases.
     *
     * @param validator - The validator to run.
     * @param value - The value to validate.
     */
    private static runCatching<T>(validator: Validator<T>, value: unknown): ParseResult<T> {
        try {
            return { success: true, data: validator(value) };
        } catch (e: unknown) {
            if (e instanceof TyperError) return Typer.failure(e.issues, e);
            const message = e instanceof Error ? e.message : String(e);
            return Typer.failure([makeIssue('invalid_type', '', message)], e instanceof TypeError ? e : undefined);
        }
    }

    /**
     * Builds the failure half of a {@link ParseResult}.
     *
     * `error` is a lazy accessor: constructing an `Error` captures a stack
     * trace, which costs more than the entire validation that produced the
     * issues. Callers that only read `issues` — the recommended path — never
     * pay for it, and callers that do read `error` get the same instance every
     * time.
     *
     * @param issues - The failures to report. Must not be empty.
     * @param existing - An already-built error to hand back instead of a new one.
     */
    private static failure(issues: ValidationIssue[], existing?: TypeError): ParseResult<never> {
        let cached: TypeError | undefined = existing;
        return {
            success: false,
            issues,
            get error(): TypeError {
                return (cached ??= new TyperError(formatIssues(issues), issues));
            },
        };
    }

    /**
     * Cache of compiled schema checkers, keyed by schema **object identity**.
     *
     * Identity, not structure: a schema literal written inside a handler is a
     * new object on every call, so it never hits this cache and is recompiled
     * every time. That costs roughly an order of magnitude — measured at 78 ns
     * hoisted against 873 ns inline — and it is silent, because
     * `typer.parse({ id: 'number' }, req.body)` looks like perfectly ordinary
     * code. Declare the schema once, outside the handler.
     *
     * It is a leak-free cost, not a leak: a `WeakMap` releases the entry as
     * soon as the throwaway schema object is collected.
     */
    private schemaCheckerCache = new WeakMap<object, (value: unknown, rootPath: string) => ValidationIssue[]>();

    /**
     * Separate cache for strict-mode compilations. Strictness changes the
     * generated code (extra-key detection), so the two variants of the same
     * schema object cannot share an entry.
     */
    private strictSchemaCheckerCache = new WeakMap<object, (value: unknown, rootPath: string) => ValidationIssue[]>();

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
    private getCompiledChecker(schema: Record<string, unknown>, strictMode = false): (value: unknown, rootPath: string) => ValidationIssue[] {
        const cache = strictMode ? this.strictSchemaCheckerCache : this.schemaCheckerCache;
        const cached = cache.get(schema);
        if (cached) return cached;

        const compiled = this.compileSchema(schema, strictMode);
        const wrapper = (value: unknown, rootPath: string): ValidationIssue[] => {
            const issues: ValidationIssue[] = [];
            if (value === null || typeof value !== "object" || Array.isArray(value)) {
                const received = this.getType(value);
                issues.push(makeIssue(
                    'invalid_type',
                    rootPath,
                    `Invalid object: must be a non-null object, got ${received}`,
                    'object',
                    received,
                ));
                return issues;
            }
            compiled(value as Record<string, unknown>, issues, rootPath);
            return issues;
        };

        cache.set(schema, wrapper);
        return wrapper;
    }

    /**
     * Compiles a full schema object into a single closure that, given an
     * already-validated parent object, runs every field check in order.
     * Nested schemas are compiled recursively (their compiled checkers are
     * captured by reference).
     */
    private compileSchema(schema: Record<string, unknown>, strictMode = false): FieldChecker {
        const keys = Object.keys(schema);
        const fields: FieldChecker[] = new Array(keys.length);
        for (let i = 0; i < keys.length; i++) {
            fields[i] = this.compileField(keys[i], schema[keys[i]], strictMode);
        }
        const fieldCount = fields.length;

        // A schema is free to declare `constructor` as a field of its own — in
        // that case it is an ordinary key and is validated, not stripped. Which
        // of the three are dangerous *for this schema* is therefore known at
        // compile time, and the hot path only walks the ones that are.
        const unsafe = DANGEROUS_KEYS.filter(key => !keys.includes(key));
        const unsafeCount = unsafe.length;

        if (!strictMode) {
            return (obj, issues, parentPath) => {
                if (unsafeCount > 0) stripDangerousKeys(obj, unsafe, issues, parentPath);
                for (let i = 0; i < fieldCount; i++) {
                    fields[i](obj, issues, parentPath);
                }
            };
        }

        // Declared keys are known at compile time, so strict mode costs one
        // Set lookup per key of the *input* rather than a per-call filter.
        const declared = new Set(keys);
        return (obj, issues, parentPath) => {
            // Stripped before the extra-key sweep: an unsafe key is removed,
            // not reported twice.
            if (unsafeCount > 0) stripDangerousKeys(obj, unsafe, issues, parentPath);
            for (let i = 0; i < fieldCount; i++) {
                fields[i](obj, issues, parentPath);
            }
            for (const key of Object.keys(obj)) {
                if (declared.has(key)) continue;
                const path = joinPath(parentPath, key);
                issues.push(makeIssue('unexpected_key', path, `Unexpected key "${path}" in strict mode`));
            }
        };
    }

    /**
     * Compiles a single key+value pair from a schema into a closure that
     * checks the field in its parent object and pushes any errors found.
     */
    private compileField(key: string, expected: unknown, strictMode: boolean): FieldChecker {
        // Validator function entry — defers all decisions (incl. optional) to the validator itself.
        if (typeof expected === "function") {
            const validator = expected as Validator<unknown>;
            return (obj, issues, parentPath) => {
                try {
                    const result = validator(obj[key]);
                    // Write back only when the validator actually produced
                    // something else. Every `is*`/`as*` validator and
                    // `objectOf` hand back what they were given, so the object
                    // is not touched at all in the overwhelming majority of
                    // slots; `coerce.*`, `transform` and `withDefault` exist to
                    // produce a different value, and used to have that value
                    // silently discarded.
                    if (result !== obj[key]) obj[key] = result;
                } catch (e) {
                    issues.push(Typer.slotIssue(e, joinPath(parentPath, key)));
                }
            };
        }

        // Type-string entry, possibly optional and/or a `a|b|c` union.
        if (typeof expected === "string") {
            return this.compileStringField(key, expected);
        }

        // Array entry: ["string"], [validator], [{nested}].
        if (Array.isArray(expected)) {
            return this.compileArrayField(key, expected as unknown[], strictMode);
        }

        // Nested schema entry.
        if (expected !== null && typeof expected === "object") {
            return this.compileNestedField(key, expected as Record<string, unknown>, strictMode);
        }

        // Anything else (number, boolean, null, …) — invalid schema definition.
        const expectedType = expected === null ? "null" : typeof expected;
        return (_obj, issues, parentPath) => {
            const path = joinPath(parentPath, key);
            issues.push(makeIssue(
                'invalid_schema',
                path,
                `Invalid schema definition at "${path}": expected string, array, or object, got ${expectedType}`,
                'string, array, or object',
                expectedType,
            ));
        };
    }

    /**
     * Builds the issue for a validator that threw inside a schema slot.
     *
     * The message keeps the `Validation failed at "path": …` wrapping it has
     * always had — it is what names the offending key — while `code` and the
     * constraint metadata are taken from the validator when it reported them.
     * Without this every constraint failure arrives as `code: 'custom'`, and
     * "too short" cannot be told from "out of range" except by reading prose.
     *
     * @param error - The value the validator threw.
     * @param path - Dotted path of the slot that failed.
     */
    private static slotIssue(error: unknown, path: string): ValidationIssue {
        const message = error instanceof Error ? error.message : String(error);
        const wrapped = `Validation failed at "${path}": ${message}`;

        const constraint = constraintOf(error);
        if (constraint === undefined) return makeIssue('custom', path, wrapped);

        return makeIssue(
            constraint.code,
            path,
            wrapped,
            constraint.expected,
            constraint.received,
            { minimum: constraint.minimum, maximum: constraint.maximum, value: constraint.value },
        );
    }

    /**
     * Parses a type-string slot (`"string"`, `"string?"`, `"a|b"`, `"a|b?"`)
     * into everything the hot path needs, resolved once at compile time.
     *
     * Predicates are resolved up to the first unknown type name: the legacy
     * behavior is to try each alternative in order and, on reaching an
     * unresolvable name, report `Unknown type: …` instead of the regular
     * mismatch error — so alternatives listed after it are unreachable and are
     * deliberately not compiled.
     */
    private parseTypeSlot(expected: string): TypeSlot | null {
        const isOptional = expected.endsWith("?");
        const baseExpected = isOptional ? expected.slice(0, -1) : expected;
        const types = baseExpected.split("|").map(t => t.trim()).filter(t => t.length > 0);
        if (types.length === 0) return null;

        const predicates: Array<(value: unknown) => boolean> = [];
        let unknownType: string | null = null;
        for (const type of types) {
            const predicate = this.resolvePredicate(type);
            if (predicate === null) {
                unknownType = type;
                break;
            }
            predicates.push(predicate);
        }

        return {
            isOptional,
            types,
            predicates,
            unknownType,
            description: types.length === 1 ? types[0] : `one of [${types.join(", ")}]`,
        };
    }

    /**
     * Compiles a string-typed schema entry (e.g. `"string"`, `"string?"`,
     * `"a|b"`, `"a|b?"`). All string parsing and type resolution happens here,
     * once; the returned closure only reads the value and calls predicates.
     */
    private compileStringField(key: string, expected: string): FieldChecker {
        if (expected.trim() === "") {
            return (_obj, issues, parentPath) => {
                const path = joinPath(parentPath, key);
                issues.push(makeIssue('invalid_schema', path, `Empty type definition at "${path}"`));
            };
        }

        const slot = this.parseTypeSlot(expected);
        if (slot === null) {
            return (_obj, issues, parentPath) => {
                const path = joinPath(parentPath, key);
                issues.push(makeIssue('invalid_schema', path, `Invalid type definition "${expected}" at "${path}"`));
            };
        }

        const { isOptional, predicates, unknownType, description } = slot;
        const predicateCount = predicates.length;

        return (obj, issues, parentPath) => {
            const value = obj[key];

            if (value === undefined) {
                if (!isOptional) {
                    const path = joinPath(parentPath, key);
                    issues.push(makeIssue('missing_key', path, `Missing required key "${path}"`, description, 'undefined'));
                }
                return;
            }
            if (value === null && isOptional) return;

            for (let i = 0; i < predicateCount; i++) {
                if (predicates[i](value)) return;
            }

            const path = joinPath(parentPath, key);
            if (unknownType !== null) {
                issues.push(makeIssue('unknown_type', path, `Unknown type: ${unknownType}`, unknownType));
                return;
            }
            const received = this.getType(value);
            issues.push(makeIssue(
                'invalid_type',
                path,
                `Expected "${path}" to be ${description}, got ${received}`,
                description,
                received,
            ));
        };
    }

    /**
     * Compiles an array-typed schema entry (`tags: ['string']` etc).
     */
    private compileArrayField(key: string, expected: unknown[], strictMode: boolean): FieldChecker {
        if (expected.length === 0) {
            return (_obj, issues, parentPath) => {
                const path = joinPath(parentPath, key);
                issues.push(makeIssue('invalid_schema', path, `Empty array schema definition at "${path}"`));
            };
        }
        if (expected.length > 1) {
            return (_obj, issues, parentPath) => {
                const path = joinPath(parentPath, key);
                issues.push(makeIssue('invalid_schema', path, `Array schema must have exactly one element type definition at "${path}"`));
            };
        }

        const elementDef = expected[0];
        const elementIsValid =
            typeof elementDef === "string"
            || typeof elementDef === "function"
            || (typeof elementDef === "object" && elementDef !== null && !Array.isArray(elementDef));

        if (!elementIsValid) {
            return (_obj, issues, parentPath) => {
                const path = joinPath(parentPath, key);
                issues.push(makeIssue('invalid_schema', path, `Array element type must be a string at "${path}"`));
            };
        }

        const elementCheck = this.compileValue(elementDef, strictMode);

        return (obj, issues, parentPath) => {
            const value = obj[key];

            if (value === undefined) {
                const path = joinPath(parentPath, key);
                issues.push(makeIssue('missing_key', path, `Missing required key "${path}"`, 'array', 'undefined'));
                return;
            }
            if (!Array.isArray(value)) {
                const path = joinPath(parentPath, key);
                const received = this.getType(value);
                issues.push(makeIssue('invalid_type', path, `Expected "${path}" to be an array, got ${received}`, 'array', received));
                return;
            }

            const length = value.length;
            if (length === 0) return;

            // Joined once per array instead of once per element; the element
            // checkers append `[i]` only when they actually report an issue.
            const arrayPath = joinPath(parentPath, key);
            for (let i = 0; i < length; i++) {
                elementCheck(value, i, issues, arrayPath);
            }
        };
    }

    /**
     * Compiles a nested-object schema entry. The nested schema is compiled
     * once and reused for every parent object.
     */
    private compileNestedField(key: string, expected: Record<string, unknown>, strictMode: boolean): FieldChecker {
        const compiledNested = this.compileSchema(expected, strictMode);

        return (obj, issues, parentPath) => {
            const value = obj[key];
            const path = joinPath(parentPath, key);

            if (value === undefined) {
                issues.push(makeIssue('missing_key', path, `Missing required key "${path}"`, 'object', 'undefined'));
                return;
            }
            if (value === null || typeof value !== "object" || Array.isArray(value)) {
                const received = this.getType(value);
                issues.push(makeIssue('invalid_type', path, `Expected "${path}" to be an object, got ${received}`, 'object', received));
                return;
            }

            compiledNested(value as Record<string, unknown>, issues, path);
        };
    }

    /**
     * Compiles a "value-position" schema fragment — currently the element type
     * inside an array field.
     *
     * The returned closure receives the owning array's path plus the element
     * index rather than a pre-built path, so `"tags[3]"` is only assembled when
     * that element actually fails.
     */
    private compileValue(expected: unknown, strictMode: boolean): ValueChecker {
        if (typeof expected === "function") {
            const validator = expected as Validator<unknown>;
            return (array, index, issues, arrayPath) => {
                try {
                    const result = validator(array[index]);
                    // Same write-back rule as a field slot: only a validator
                    // that actually produced something else touches the array.
                    if (result !== array[index]) array[index] = result;
                } catch (e) {
                    issues.push(Typer.slotIssue(e, indexPath(arrayPath, index)));
                }
            };
        }

        if (typeof expected === "string") {
            if (expected.trim() === "") {
                return (_array, index, issues, arrayPath) => {
                    const path = indexPath(arrayPath, index);
                    issues.push(makeIssue('invalid_schema', path, `Empty type definition at "${path}"`));
                };
            }

            const slot = this.parseTypeSlot(expected);
            if (slot === null) {
                return (_array, index, issues, arrayPath) => {
                    const path = indexPath(arrayPath, index);
                    issues.push(makeIssue('invalid_schema', path, `Invalid type definition "${expected}" at "${path}"`));
                };
            }

            const { isOptional, predicates, unknownType, description } = slot;
            const predicateCount = predicates.length;

            return (array, index, issues, arrayPath) => {
                const value = array[index];
                if (isOptional && (value === undefined || value === null)) return;

                for (let i = 0; i < predicateCount; i++) {
                    if (predicates[i](value)) return;
                }

                const path = indexPath(arrayPath, index);
                if (unknownType !== null) {
                    issues.push(makeIssue('unknown_type', path, `Unknown type: ${unknownType}`, unknownType));
                    return;
                }
                const received = this.getType(value);
                issues.push(makeIssue(
                    'invalid_type',
                    path,
                    `Expected "${path}" to be ${description}, got ${received}`,
                    description,
                    received,
                ));
            };
        }

        /* istanbul ignore next — compileArrayField filters arrays out via
         * elementIsValid before delegating here, so this branch is currently
         * unreachable. Kept as a defensive fallback for future call sites. */
        if (Array.isArray(expected)) {
            // Array-of-array isn't supported as a schema; mirror checkStructure error wording.
            return (_array, index, issues, arrayPath) => {
                const path = indexPath(arrayPath, index);
                issues.push(makeIssue('invalid_schema', path, `Array element type must be a string at "${path}"`));
            };
        }

        if (expected !== null && typeof expected === "object") {
            const compiledNested = this.compileSchema(expected as Record<string, unknown>, strictMode);
            return (array, index, issues, arrayPath) => {
                const value = array[index];
                const path = indexPath(arrayPath, index);
                if (value === null || typeof value !== "object" || Array.isArray(value)) {
                    const received = this.getType(value);
                    issues.push(makeIssue('invalid_type', path, `Expected "${path}" to be an object, got ${received}`, 'object', received));
                    return;
                }
                compiledNested(value as Record<string, unknown>, issues, path);
            };
        }

        // compileArrayField's elementIsValid check already rejects
        // non-string/function/object element schemas before we reach this
        // branch. Kept as a defensive fallback for future call sites.
        /* istanbul ignore next */
        return (_array, index, issues, arrayPath) => {
            const expectedType = expected === null ? "null" : typeof expected;
            const path = indexPath(arrayPath, index);
            issues.push(makeIssue(
                'invalid_schema',
                path,
                `Invalid schema definition at "${path}": expected string, array, or object, got ${expectedType}`,
                'string, array, or object',
                expectedType,
            ));
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
     * Builds a validator for a union whose members are told apart by a single
     * key — the shape most API payloads use.
     *
     * {@link union} tries each variant in turn, so its cost grows with the
     * number of variants and its error lists every variant's failure. This
     * reads the discriminant once and goes straight to the one variant that can
     * possibly match, in constant time, and reports against that variant alone.
     *
     * The variants are keyed by discriminant value, so the mapping is exact by
     * construction — there is no literal to extract from a schema and no way to
     * declare two variants with the same tag.
     *
     * @template Key - The discriminant key
     * @template V - The variants, keyed by discriminant value
     * @param {Key} key - The key that tells the variants apart.
     * @param {V} variants - Schema per discriminant value.
     * @param {{ strict?: boolean }} [options] - `strict` rejects keys the selected variant does not declare.
     * @returns {StandardValidator} A validator producing the union of the variants.
     * @throws {TyperError} If the discriminant is missing or unknown, or the selected variant fails.
     * @example
     * const shape = typer.discriminatedUnion('kind', {
     *     circle: { radius: 'number' },
     *     square: { side: 'number' },
     * });
     * shape({ kind: 'circle', radius: 2 });
     * // → { kind: 'circle'; radius: number } | { kind: 'square'; side: number }
     */
    public discriminatedUnion<const Key extends string, const V extends Record<string, Record<string, unknown>>>(key: Key, variants: V, options: { strict?: boolean } = {}): StandardValidator<DiscriminatedUnion<Key, V, TRegistry>> {
        type Out = DiscriminatedUnion<Key, V, TRegistry>;

        const strict = options.strict === true;
        const checkers = new Map<string, (value: unknown, rootPath: string) => ValidationIssue[]>();

        for (const tag of Object.keys(variants)) {
            // The discriminant is declared on the compiled schema even when the
            // variant does not mention it, so strict mode does not flag the very
            // key the union is selected by. Re-checking it costs one `typeof`
            // and keeps the variant free to declare it itself.
            const declared = variants[tag];
            const schema = hasOwnKey(declared, key) ? declared : { [key]: 'string', ...declared };
            checkers.set(tag, this.getCompiledChecker(schema, strict));
        }

        const tags = Object.keys(variants);
        const expected = `one of [${tags.join(', ')}]`;

        const run = (value: unknown): ValidationIssue[] => {
            if (value === null || typeof value !== 'object' || Array.isArray(value)) {
                const received = this.getType(value);
                return [makeIssue('invalid_type', '', `Invalid object: must be a non-null object, got ${received}`, 'object', received)];
            }

            const tag = (value as Record<string, unknown>)[key];
            if (tag === undefined) {
                return [makeIssue('missing_key', key, `Missing required key "${key}"`, expected, 'undefined')];
            }

            const checker = typeof tag === 'string' ? checkers.get(tag) : undefined;
            if (checker === undefined) {
                return [makeIssue('invalid_type', key, `Expected "${key}" to be ${expected}, got ${String(tag)}`, expected, this.getType(tag))];
            }

            return checker(value, '');
        };

        const validator = (value: unknown): Out => {
            const issues = run(value);
            if (issues.length > 0) throw new TyperError(formatIssues(issues), issues);
            return value as Out;
        };

        return Typer.asStandard(validator, (value) => {
            const issues = run(value);
            return issues.length === 0 ? { success: true, data: value as Out } : Typer.failure(issues);
        });
    }

    /**
     * Builds a validator accepting only the listed literal values.
     *
     * The returned validator narrows to the union of those literals, so it is
     * the composable counterpart of {@link isOneOf}.
     *
     * @template T - Tuple of accepted literals
     * @param {...(string|number|boolean|null)} values - The accepted values.
     * @returns {Validator} A validator narrowing to `values[number]`.
     * @throws {TypeError} If the value is none of them.
     * @example
     * const role = typer.literal('admin', 'user', 'guest');
     * role('admin'); // 'admin' | 'user' | 'guest'
     * typer.parse({ role: typer.literal('a', 'b') }, payload);
     */
    public literal<const T extends readonly (string | number | boolean | null)[]>(
        ...values: T
    ): Validator<T[number]> {
        const allowed = new Set<unknown>(values);
        return (value: unknown): T[number] => {
            if (!allowed.has(value)) {
                throw new TypeError(`${String(value)} must be one of [${values.join(', ')}].`);
            }
            return value as T[number];
        };
    }

    /**
     * Builds a validator for an array whose elements all satisfy `element`,
     * optionally constraining the length.
     *
     * Every failing element is reported, not just the first.
     *
     * @template T - The element type
     * @param {Validator} element - Validator applied to each element.
     * @param {{ min?: number, max?: number }} [bounds] - Inclusive length bounds.
     * @returns {Validator} A validator producing `T[]`.
     * @throws {TypeError} If the value is not an array, is out of bounds, or has invalid elements.
     * @example
     * const tags = typer.arrayOf((v) => typer.asString(v), { min: 1 });
     * tags(['a', 'b']); // string[]
     */
    public arrayOf<T>(element: Validator<T>, bounds: { min?: number; max?: number } = {}): Validator<T[]> {
        const { min, max } = bounds;
        return (value: unknown): T[] => {
            if (!Array.isArray(value)) {
                throw new TypeError(`${String(value)} must be an array, is ${this.getType(value)}`);
            }
            if (min !== undefined && value.length < min) {
                throw issueError('too_small', `array length must be >= ${min}, is ${value.length}`, undefined, undefined, { minimum: min });
            }
            if (max !== undefined && value.length > max) {
                throw issueError('too_big', `array length must be <= ${max}, is ${value.length}`, undefined, undefined, { maximum: max });
            }

            const out: T[] = new Array(value.length);
            const issues: ValidationIssue[] = [];
            for (let i = 0; i < value.length; i++) {
                try {
                    out[i] = element(value[i]);
                } catch (e) {
                    const message = e instanceof Error ? e.message : String(e);
                    const path = `[${i}]`;
                    issues.push(makeIssue('custom', path, `Validation failed at "${path}": ${message}`));
                }
            }
            if (issues.length > 0) throw new TyperError(formatIssues(issues), issues);
            return out;
        };
    }

    /**
     * Builds a validator for a dictionary object: any set of keys, all values
     * satisfying `value`.
     *
     * Rejects arrays and `null`, unlike the `'object'` alias.
     *
     * Keys that are dangerous to copy (`__proto__`, `constructor`,
     * `prototype`) are dropped rather than written to the result: assigning
     * `out['__proto__']` would set the output's prototype instead of a field.
     *
     * @template T - The value type
     * @param {Validator} value - Validator applied to each own enumerable value.
     * @returns {Validator} A validator producing `Record<string, T>`.
     * @throws {TypeError} If the input is not a plain dictionary or a value fails.
     * @example
     * const scores = typer.record((v) => typer.asNumber(v));
     * scores({ alice: 1, bob: 2 }); // Record<string, number>
     */
    public record<T>(value: Validator<T>): Validator<Record<string, T>> {
        return (input: unknown): Record<string, T> => {
            if (input === null || typeof input !== 'object' || Array.isArray(input)) {
                throw new TypeError(`${String(input)} must be an object, is ${this.getType(input)}`);
            }

            const out: Record<string, T> = {};
            const issues: ValidationIssue[] = [];
            for (const key of Object.keys(input)) {
                if (DANGEROUS_KEYS.includes(key)) continue;
                try {
                    out[key] = value((input as Record<string, unknown>)[key]);
                } catch (e) {
                    const message = e instanceof Error ? e.message : String(e);
                    issues.push(makeIssue('custom', key, `Validation failed at "${key}": ${message}`));
                }
            }
            if (issues.length > 0) throw new TyperError(formatIssues(issues), issues);
            return out;
        };
    }

    /**
     * Builds a validator for a fixed-length, heterogeneous array.
     *
     * @template T - Tuple of element validators
     * @param {Validator[]} validators - One validator per position.
     * @returns {Validator} A validator producing the corresponding tuple type.
     * @throws {TypeError} If the value is not an array of exactly that length, or an element fails.
     * @example
     * const point = typer.tuple([(v) => typer.asNumber(v), (v) => typer.asNumber(v)]);
     * point([1, 2]); // [number, number]
     */
    public tuple<const T extends readonly Validator<unknown>[]>(validators: T): Validator<{ -readonly [K in keyof T]: T[K] extends Validator<infer U> ? U : never }> {
        type Out = { -readonly [K in keyof T]: T[K] extends Validator<infer U> ? U : never };
        return (value: unknown): Out => {
            if (!Array.isArray(value)) {
                throw new TypeError(`${String(value)} must be an array, is ${this.getType(value)}`);
            }
            if (value.length !== validators.length) {
                const message = `tuple must have exactly ${validators.length} elements, has ${value.length}`;
                const bounds = { minimum: validators.length, maximum: validators.length };
                throw issueError(value.length < validators.length ? 'too_small' : 'too_big', message, undefined, undefined, bounds);
            }

            const out = new Array(validators.length);
            const issues: ValidationIssue[] = [];
            for (let i = 0; i < validators.length; i++) {
                try {
                    out[i] = validators[i](value[i]);
                } catch (e) {
                    const message = e instanceof Error ? e.message : String(e);
                    const path = `[${i}]`;
                    issues.push(makeIssue('custom', path, `Validation failed at "${path}": ${message}`));
                }
            }
            if (issues.length > 0) throw new TyperError(formatIssues(issues), issues);
            return out as Out;
        };
    }

    /**
     * Adds a constraint to an existing validator without changing its type.
     *
     * @template T - The validated type
     * @param {Validator} validator - The validator to run first.
     * @param {(value: T) => boolean} predicate - Must return true for the value to be accepted.
     * @param {string} message - Error message used when the predicate fails.
     * @returns {Validator} A validator producing `T`.
     * @throws {TypeError} If the base validator fails, or the predicate returns false.
     * @example
     * const even = typer.refine((v) => typer.asNumber(v), (n) => n % 2 === 0, 'must be even');
     */
    public refine<T>(validator: Validator<T>, predicate: (value: T) => boolean, message: string): Validator<T> {
        return (value: unknown): T => {
            const parsed = validator(value);
            if (!predicate(parsed)) throw new TypeError(message);
            return parsed;
        };
    }

    /**
     * Maps a validated value to another shape. Validation runs first, so the
     * transformer only ever sees a well-typed input.
     *
     * @template T - The validated type
     * @template U - The produced type
     * @param {Validator} validator - The validator to run first.
     * @param {(value: T) => U} transformer - Applied to the validated value.
     * @returns {Validator} A validator producing `U`.
     * @example
     * const trimmed = typer.transform((v) => typer.asString(v), (s) => s.trim());
     */
    public transform<T, U>(validator: Validator<T>, transformer: (value: T) => U): Validator<U> {
        return (value: unknown): U => transformer(validator(value));
    }

    /**
     * Substitutes a default when the value is `undefined`, and validates
     * everything else.
     *
     * Pass a factory (`() => T`) for object or array defaults so each call gets
     * its own instance. A plain function default must be wrapped in a factory,
     * since functions are treated as factories.
     *
     * @template T - The validated type
     * @param {Validator} validator - Applied when the value is present.
     * @param {T | (() => T)} fallback - Value, or factory, used when `undefined`.
     * @returns {Validator} A validator producing `T`.
     * @example
     * const limit = typer.withDefault((v) => typer.asNumber(v), 10);
     * limit(undefined); // 10
     */
    public withDefault<T>(validator: Validator<T>, fallback: T | (() => T)): Validator<T> {
        return (value: unknown): T => {
            if (value !== undefined) return validator(value);
            return typeof fallback === 'function' ? (fallback as () => T)() : fallback;
        };
    }

    /**
     * Defers building a validator until first use, which is what makes
     * self-referential (recursive) shapes expressible.
     *
     * The factory runs at most once; the result is reused.
     *
     * @template T - The validated type
     * @param {() => Validator} factory - Returns the real validator.
     * @returns {Validator} A validator producing `T`.
     * @example
     * type Node = { name: string; children?: Node[] };
     * const node: Validator<Node> = typer.lazy(() => typer.objectOf({
     *     name: 'string',
     *     children: typer.optional(typer.arrayOf(node)),
     * }) as Validator<Node>);
     */
    public lazy<T>(factory: () => Validator<T>): Validator<T> {
        let resolved: Validator<T> | undefined;
        return (value: unknown): T => (resolved ??= factory())(value);
    }

    /**
     * Composable form of {@link isInstanceOf}.
     *
     * @template T - The instance type
     * @param {Function} ctor - The constructor to check against.
     * @returns {Validator} A validator producing `T`.
     * @example
     * typer.parse({ when: typer.instanceOf(Date) }, payload);
     */
    public instanceOf<T>(ctor: new (...args: never[]) => T): Validator<T> {
        return (value: unknown): T => this.isInstanceOf(ctor, value);
    }

    /**
     * Turns a schema into a `Validator`, so object shapes can be nested inside
     * the other combinators.
     *
     * The schema is compiled once and cached like any other, so this is as fast
     * as calling {@link parse} directly.
     *
     * The returned validator is also a {@link https://standardschema.dev Standard Schema},
     * so it can be handed straight to tRPC, Hono, TanStack Form and friends.
     *
     * @template S - The schema
     * @param {S} schema - The shape to validate against.
     * @param {{ strict?: boolean }} [options] - `strict` rejects keys the schema does not declare.
     * @returns {StandardValidator} A validator producing `Infer<S>`, carrying `~standard`.
     * @throws {TyperError} With one issue per problem found.
     * @example
     * const users = typer.arrayOf(typer.objectOf({ id: 'number', name: 'string' }));
     * users(payload); // { id: number; name: string }[]
     */
    public objectOf<const S extends ValidateSchema<S, KnownAlias<TRegistry>>>(schema: S, options: { strict?: boolean } = {}): StandardValidator<Infer<S, TRegistry>> {
        const checker = this.getCompiledChecker(schema as Record<string, unknown>, options.strict === true);

        const validator = (value: unknown): Infer<S, TRegistry> => {
            const issues = checker(value, '');
            if (issues.length > 0) throw new TyperError(formatIssues(issues), issues);
            return value as Infer<S, TRegistry>;
        };

        return Typer.asStandard(validator, (value) => {
            const issues = checker(value, '');
            return issues.length === 0
                ? { success: true, data: value as Infer<S, TRegistry> }
                : Typer.failure(issues);
        });
    }

    /**
     * Turns any schema, validator or type alias into a
     * {@link https://standardschema.dev Standard Schema}.
     *
     * Standard Schema is the common contract that lets a validation library be
     * accepted by tRPC, Hono, TanStack Form and Router, Nuxt and the rest,
     * without a per-library adapter. The returned value is still a plain
     * validator function, so it also keeps working everywhere a `Validator`
     * does.
     *
     * Schema literals are the one shape that cannot carry `~standard` on their
     * own — they are inert object literals owned by the caller, and Typer does
     * not mutate them — which is why this wrapper exists.
     *
     * @template S - The schema
     * @param {S} target - A schema object, a `Validator`, or a type alias (or array of aliases).
     * @param {{ strict?: boolean }} [options] - Schema objects only: `strict` rejects undeclared keys.
     * @returns {StandardValidator} The validator, carrying `~standard`.
     * @example
     * const userSchema = typer.standard({ id: 'number', email: 'string' });
     * userSchema['~standard'].validate({ id: 1, email: 'a@b.c' }); // { value: … }
     *
     * // tRPC, Hono, TanStack … accept it directly:
     * router.post('/users', validator('json', userSchema), handler);
     */
    public standard<K extends TypeKey>(target: K | readonly K[]): StandardValidator<TypeMap[K]>;
    public standard<T>(target: Validator<T>): StandardValidator<T>;
    public standard<const S extends ValidateSchema<S, KnownAlias<TRegistry>>>(target: S, options?: { strict?: boolean }): StandardValidator<Infer<S, TRegistry>>;
    public standard<T>(target: string | readonly string[]): StandardValidator<T>;
    public standard(target: unknown, options: { strict?: boolean } = {}): StandardValidator<unknown> {
        // Schemas get the dedicated path: `objectOf` already compiles the
        // checker once and reports issues without building an Error.
        if (target !== null && typeof target === 'object' && !Array.isArray(target)) {
            return this.objectOf(target as never, options) as StandardValidator<unknown>;
        }

        // Never decorate the function the caller handed in: attaching to it
        // would mutate a value they own and may reuse elsewhere. Wrapping also
        // keeps `~standard` off a validator that is passed around as a plain
        // function.
        const inner: Validator<unknown> = typeof target === 'function'
            ? target as Validator<unknown>
            : (value: unknown) => this.parse(target as never, value);

        const wrapper: Validator<unknown> = (value: unknown) => inner(value);

        // Reuse the inner validator's own non-throwing path when it has one,
        // so wrapping an `objectOf` in `standard()` does not reintroduce the
        // throw/catch round trip it was built to avoid.
        const innerSafeRun = (inner as SafeReporting<unknown>)[SAFE_RESULT];
        const safeRun = innerSafeRun ?? ((value: unknown) => Typer.runCatching(inner, value));

        return Typer.asStandard(wrapper, safeRun);
    }

    /**
     * Attaches the Standard Schema properties to a validator function.
     *
     * `~standard` is defined non-enumerable so the validator still serializes,
     * spreads and compares like the plain function it was, and `validate` is
     * built on the non-throwing path rather than on `try`/`catch` around the
     * throwing one.
     *
     * The same non-throwing path is also stored under {@link SAFE_RESULT}, so
     * `safeParse` can use it directly instead of catching what this validator
     * would have thrown.
     *
     * @param validator - The function to decorate, returned as-is. Must be one
     *                    Typer owns — never a function supplied by the caller.
     * @param safeRun - Produces a `ParseResult` without throwing.
     */
    private static asStandard<T>(validator: Validator<T>, safeRun: (value: unknown) => ParseResult<T>): StandardValidator<T> {
        const props: StandardSchemaV1.Props<unknown, T> = {
            version: 1,
            vendor: STANDARD_VENDOR,
            validate: (value: unknown): StandardSchemaV1.Result<T> => {
                const result = safeRun(value);
                return result.success ? { value: result.data } : { issues: toStandardIssues(result.issues) };
            },
        };

        Object.defineProperty(validator, '~standard', {
            value: props,
            enumerable: false,
            configurable: true,
        });

        Object.defineProperty(validator, SAFE_RESULT, {
            value: safeRun,
            enumerable: false,
            configurable: true,
        });

        return validator as StandardValidator<T>;
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
            throw issueError('invalid_format', `${p} must be a finite number.`, 'finite number');
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
            throw issueError('invalid_format', `${p} must be a safe integer.`, 'safe integer');
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
            throw issueError('invalid_format', `${p} must match ${regex}.`, String(regex));
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
    public isLength<T extends string | readonly unknown[]>(bounds: { min?: number; max?: number }, p: unknown): T {
        if (typeof p !== 'string' && !Array.isArray(p)) {
            throw new TypeError(`${p} must be a string or array, is ${this.getType(p)}`);
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
        if (!Patterns.UUID.test(str)) {
            throw issueError('invalid_format', `${p} must be a valid UUID.`, 'uuid');
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
            throw issueError('invalid_format', `${p} must be a valid IPv4 address.`, 'ipv4');
        }
        for (const part of parts) {
            if (!Patterns.DIGITS.test(part)) {
                throw issueError('invalid_format', `${p} must be a valid IPv4 address.`, 'ipv4');
            }
            const n = Number(part);
            // reject leading zeros (except the single "0") and out-of-range octets
            if (n < 0 || n > 255 || (part.length > 1 && part.startsWith('0'))) {
                throw issueError('invalid_format', `${p} must be a valid IPv4 address.`, 'ipv4');
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
            throw issueError('invalid_format', `${p} must be a valid IPv6 address.`, 'ipv6');
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
        if (!Patterns.HEX_COLOR.test(str)) {
            throw issueError('invalid_format', `${p} must be a valid hex color.`, 'hex color');
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
        if (!Patterns.ISO_DATE.test(str)) {
            throw issueError('invalid_format', `${p} must be a valid ISO 8601 date string.`, 'iso date');
        }
        const date = new Date(str);
        if (Number.isNaN(date.getTime())) {
            throw issueError('invalid_format', `${p} must be a valid ISO 8601 date string.`, 'iso date');
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
            throw issueError('invalid_format', `${p} must be a valid Base64 string.`, 'base64');
        }
        return str;
    }

    /**
     * Checks that the parameter is a valid IP address, of either version.
     *
     * @param {unknown} p - The parameter to check
     * @returns {string} The validated address
     * @throws {TypeError} If `p` is neither a valid IPv4 nor a valid IPv6 address
     * @example
     * typer.isIP('192.168.0.1');
     * typer.isIP('::1');
     */
    public isIP(p: unknown): string {
        const str = this.isType<string>('string', p);
        try {
            return this.isIPv4(str);
        } catch {
            // Fall through: an IPv4 miss says nothing about IPv6.
        }
        try {
            return this.isIPv6(str);
        } catch {
            throw issueError('invalid_format', `${p} must be a valid IP address.`, 'ip');
        }
    }

    /**
     * Checks that the parameter is a valid Semantic Versioning 2.0.0 string,
     * including optional pre-release and build metadata.
     *
     * @param {unknown} p - The parameter to check
     * @returns {string} The validated version
     * @throws {TypeError} If `p` is not a valid semver string
     * @example
     * typer.isSemver('1.0.0');
     * typer.isSemver('2.1.0-beta.1+build.5');
     */
    public isSemver(p: unknown): string {
        const str = this.isType<string>('string', p);
        if (!Patterns.SEMVER.test(str)) {
            throw issueError('invalid_format', `${p} must be a valid semver string.`, 'semver');
        }
        return str;
    }

    /**
     * Checks that the parameter is a URL-friendly slug: lowercase alphanumeric
     * groups separated by single hyphens.
     *
     * @param {unknown} p - The parameter to check
     * @returns {string} The validated slug
     * @throws {TypeError} If `p` is not a valid slug
     * @example
     * typer.isSlug('hello-world');
     */
    public isSlug(p: unknown): string {
        const str = this.isType<string>('string', p);
        if (!Patterns.SLUG.test(str)) {
            throw issueError('invalid_format', `${p} must be a valid slug.`, 'slug');
        }
        return str;
    }

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
    public isPort(p: unknown): number {
        const num = this.isInteger(p);
        const message = `${p} must be a valid port number (1-65535).`;
        const bounds = { minimum: 1, maximum: 65535 };
        if (num < 1) throw issueError('too_small', message, undefined, undefined, bounds);
        if (num > 65535) throw issueError('too_big', message, undefined, undefined, bounds);
        return num;
    }

    /**
     * Checks that the parameter is structurally a JSON Web Token: three
     * base64url segments separated by dots.
     *
     * This validates the shape only — it does **not** verify the signature or
     * decode the claims, and must not be used as an authentication check.
     *
     * @param {unknown} p - The parameter to check
     * @returns {string} The validated token
     * @throws {TypeError} If `p` does not have the shape of a JWT
     */
    public isJWT(p: unknown): string {
        const str = this.isType<string>('string', p);
        if (!Patterns.JWT.test(str)) {
            throw issueError('invalid_format', `${p} must be a valid JWT.`, 'jwt');
        }
        return str;
    }

    /**
     * Checks that the parameter is a MAC address in colon- or hyphen-separated
     * form.
     *
     * @param {unknown} p - The parameter to check
     * @returns {string} The validated address
     * @throws {TypeError} If `p` is not a valid MAC address
     * @example
     * typer.isMACAddress('00:1A:2B:3C:4D:5E');
     */
    public isMACAddress(p: unknown): string {
        const str = this.isType<string>('string', p);
        if (!Patterns.MAC_ADDRESS.test(str)) {
            throw issueError('invalid_format', `${p} must be a valid MAC address.`, 'mac address');
        }
        return str;
    }

    /**
     * Recursively validates an object against a nested schema.
     *
     * Shares the closure compiler with {@link parse} and {@link safeParse}, so
     * a schema validated here is compiled once and reused — and reports the
     * same messages the other entry points do.
     *
     * @param {SchemaDefinition} schema - The expected structure definition.
     * @param {Record<string, unknown>} obj - The object to validate.
     * @param {string} path - The current path for error reporting (internal use).
     * @param {boolean} strictMode - Whether to reject extra keys not in schema.
     * @returns {StructureValidationReturn} - Validation result with `errors` (strings) and `issues` (structured).
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
     * console.log(Typer.checkStructure(schema, obj)); // { isValid: true, errors: [], issues: [] }
     */
    public checkStructure(schema: Record<string, unknown>, obj: Record<string, unknown>, path = '', strictMode = false): StructureValidationReturn {
        if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
            const issues = [makeIssue('invalid_schema', path, `Invalid schema: must be a non-null object`)];
            return { isValid: false, errors: issueMessages(issues), issues };
        }

        const issues = this.getCompiledChecker(schema, strictMode)(obj, path);
        return { isValid: issues.length === 0, errors: issueMessages(issues), issues };
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

// ---------------------------------------------------------------------------
//  Public surface
//
//  The bundle is rolled up from this file, so anything consumers should be
//  able to import has to be re-exported here. Until now only `Typer` itself
//  was reachable, which made the documented `import { type Infer }` fail.
// ---------------------------------------------------------------------------

export { TyperError } from "./Errors/TyperError";
export { STANDARD_VENDOR } from "./Types/StandardSchema";

export type { StandardSchemaV1 } from "./Types/StandardSchema";
export type { BoundValidators, Coercions, DiscriminatedUnion, Infer, IssueMeta, IssueCode, KnownAlias, MergeSchema, OmitSchema, OptionalSlot, ParseResult, PartialSchema, PickSchema, ResolveSchemaValue, ResolveTypeString, Schema, SchemaArrayElement, StandardValidator, StructureValidationReturn, TypeKey, TypeMap, TypeRegistry, TyperExpectTypes, TyperReturn, UnknownAlias, ValidateSchema, ValidationIssue, Validator } from "./Types/Typer";