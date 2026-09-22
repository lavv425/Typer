"use strict";

import type { Error } from "./Types/Globals";
import type { StandardSchemaV1 } from "./Types/StandardSchema";
import type { BoundValidators, Coercions, DiscriminatedUnion, FieldChecker, Infer, KnownAlias, MergeSchema, OmitSchema, ParseResult, PartialSchema, PickSchema, Schema, StandardValidator, StructureValidationReturn, TypeKey, TypeMap, TyperReturn, TypeRegistry, TypeSlot, ValidateSchema, ValidationIssue, Validator, ValueChecker } from "./Types/Typer";
import { TyperError } from "./Errors/TyperError";
import { constraintOf, formatIssues, issueError, issueMessages, makeIssue, toStandardIssues } from "./Utils/Issues";
import * as Patterns from "./Constants/Patterns";
import { STANDARD_VENDOR } from "./Types/StandardSchema";
import { describing, describingLazy, JSON_SCHEMA, SAFE_RESULT } from "./Constants/Symbols";
import type { SafeReporting, SelfDescribing } from "./Constants/Symbols";
import type { JSONSchemaDocument, JSONSchemaFragment, ToJSONSchemaOptions } from "./Types/JSONSchema";
import { OPTIONAL_MARKER, toJSONSchema } from "./Utils/JSONSchema";
import { DANGEROUS_KEYS, stripDangerousKeys } from "./Utils/Sanitize";
import { indexPath, joinPath } from "./Utils/Path";
import { BUILTIN_PREDICATES, getType } from "./Core/Predicates";
import { BUILTIN_CHECKERS } from "./Core/Checkers";
import * as Strings from "./Validators/Strings";
import * as Numbers from "./Validators/Numbers";
import * as Sizes from "./Validators/Sizes";
import * as Guards from "./Validators/Guards";
import * as Basic from "./Combinators/Basic";
import * as Collections from "./Combinators/Collections";
import * as Objects from "./Combinators/Objects";
import { failure, runCatching } from "./Core/Result";
import { createContext, getCompiledChecker, slotIssue } from "./Core/Compile";
import type { CompiledChecker, CompileContext } from "./Core/Compile";
import type { Predicate } from "./Core/Predicates";

/**
 * Own-property test that does not go through the object being tested, so a
 * schema carrying a `hasOwnProperty` key of its own cannot shadow it.
 */
const hasOwnKey = (target: object, key: string): boolean => Object.prototype.hasOwnProperty.call(target, key);

/**
 * The JSON Schema fragment a validator carries, or the permissive `{}` when it
 * carries none.
 *
 * A validator is an opaque function: unless Typer built it, there is nothing
 * to read, and `{}` — "anything" — is the only honest answer. `toJSONSchema`
 * reports those slots separately, so the gap is visible rather than silent.
 */
const describedFragment = (validator: unknown): JSONSchemaFragment => {
    if (typeof validator !== 'function' && (validator === null || typeof validator !== 'object')) return {};
    return (validator as SelfDescribing)[JSON_SCHEMA] ?? {};
};

/** Widens a fragment to also accept `null`. */
const nullableFragment = (fragment: JSONSchemaFragment): JSONSchemaFragment => {
    if (Object.keys(fragment).length === 0) return {};
    if (typeof fragment.type === 'string') return { ...fragment, type: [fragment.type, 'null'] };
    if (Array.isArray(fragment.type)) return { ...fragment, type: Array.from(new Set([...(fragment.type as string[]), 'null'])) };
    return { anyOf: [fragment, { type: 'null' }] };
};

/**
 * Strings `coerce.boolean` reads as `true`. Anything not listed here or in
 * {@link FALSY_STRINGS} is rejected rather than guessed at.
 */
const TRUTHY_STRINGS = new Set(['true', '1', 'yes', 'on']);

/** Strings `coerce.boolean` reads as `false`. */
const FALSY_STRINGS = new Set(['false', '0', 'no', 'off']);

/**
 * JSON Schema equivalents of the built-in validators, keyed by method name.
 *
 * A validator is an opaque function, so `toJSONSchema` cannot work out that
 * `isEmail` accepts email addresses. The bound validators carry these, which
 * is the difference between emitting `{ type: 'string', format: 'email' }` and
 * emitting `{}`.
 *
 * Only validators with an honest equivalent are listed. `isPhoneNumber` and
 * `isSlug`, for instance, have no registered `format`, so they are described
 * by the pattern-free `{ type: 'string' }` their values satisfy rather than by
 * a made-up keyword.
 */
const VALIDATOR_JSON_SCHEMA: Readonly<Record<string, JSONSchemaFragment>> = {
    isString: { type: 'string' },
    asString: { type: 'string' },
    isNonEmptyString: { type: 'string', minLength: 1 },
    isNumber: { type: 'number' },
    asNumber: { type: 'number' },
    isFiniteNumber: { type: 'number' },
    isInteger: { type: 'integer' },
    isSafeInteger: { type: 'integer' },
    isPositiveNumber: { type: 'number', minimum: 0 },
    isPositiveInteger: { type: 'integer', minimum: 0 },
    isNegativeNumber: { type: 'number', exclusiveMaximum: 0 },
    isNegativeInteger: { type: 'integer', maximum: -1 },
    isPort: { type: 'integer', minimum: 1, maximum: 65535 },
    isBoolean: { type: 'boolean' },
    asBoolean: { type: 'boolean' },
    isArray: { type: 'array' },
    asArray: { type: 'array' },
    isNonEmptyArray: { type: 'array', minItems: 1 },
    isObject: { type: 'object' },
    asObject: { type: 'object' },
    isPlainObject: { type: 'object' },
    isEmail: { type: 'string', format: 'email' },
    isURL: { type: 'string', format: 'uri' },
    isUUID: { type: 'string', format: 'uuid' },
    isIPv4: { type: 'string', format: 'ipv4' },
    isIPv6: { type: 'string', format: 'ipv6' },
    isISODate: { type: 'string', format: 'date-time' },
    isHexColor: { type: 'string' },
    isBase64: { type: 'string', contentEncoding: 'base64' },
    isJWT: { type: 'string' },
    isMACAddress: { type: 'string' },
    isSemver: { type: 'string' },
    isSlug: { type: 'string' },
    isPhoneNumber: { type: 'string' },
    isIP: { type: 'string' },
};

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
    private builtinPredicates!: Readonly<Record<string, Predicate>>;

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
        // Seeded from the shared built-in map. A copy, not the map itself:
        // `registerType` mutates this per instance.
        //
        // Null-prototype, and that is load-bearing rather than tidiness: with
        // an ordinary object, `typesMap['constructor']` resolves to
        // `Object.prototype.constructor`, so `resolvePredicate` treated
        // `'constructor'` as a registered type and wrapped it — and because
        // `Object(value)` never throws, `{ role: 'constructor' }` accepted
        // *every* value. A schema typo silently disabled validation for that
        // key.
        this.typesMap = Object.assign(Object.create(null) as Record<string, (value: unknown) => unknown>, BUILTIN_CHECKERS);

        this.builtinPredicates = BUILTIN_PREDICATES;
        this.builtinCheckers = Object.assign(Object.create(null) as Record<string, (value: unknown) => unknown>, this.typesMap);
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
                const validator = (method as (...args: unknown[]) => unknown).bind(this);
                // Carrying the JSON Schema equivalent here is what lets
                // `toJSONSchema` emit `{ type: 'string', format: 'email' }`
                // for `{ email: typer.validators.isEmail }` instead of giving
                // up on an opaque function.
                const fragment = VALIDATOR_JSON_SCHEMA[name];
                bound[name] = fragment === undefined ? validator : describing(validator, fragment);
            }
        }

        this.boundValidators = bound as BoundValidators<Typer<TRegistry>>;
        return this.boundValidators;
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
     * Both caches resolve type names eagerly — `predCache` per raw string, the
     * compile context per schema object at compile time — so registering,
     * overriding or removing a type must invalidate them, otherwise a schema
     * compiled before the change keeps validating against the old definition.
     */
    private invalidateCaches(): void {
        this.predCache.clear();
        // WeakMap has no clear(); replacing the context drops every compiled
        // schema, in both the strict and the permissive cache.
        this.context = createContext((rawType: string) => this.resolvePredicate(rawType));
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

    // -----------------------------------------------------------------------
    //  Validators, delegating to `Validators/*`
    //
    //  The implementations moved out so they can be imported one at a time;
    //  these keep the instance API working unchanged. `validators` still
    //  binds them, so passing `typer.validators.isEmail` around behaves
    //  exactly as before.
    // -----------------------------------------------------------------------

    /** @see {@link Strings.isEmail} — moved to `Validators/Strings`, kept here for the instance API. */
    public isEmail(p: unknown): string {
        return Strings.isEmail(p);
    }

    /** @see {@link Strings.isURL} — moved to `Validators/Strings`, kept here for the instance API. */
    public isURL(p: unknown): string {
        return Strings.isURL(p);
    }

    /** @see {@link Strings.isUUID} — moved to `Validators/Strings`, kept here for the instance API. */
    public isUUID(p: unknown): string {
        return Strings.isUUID(p);
    }

    /** @see {@link Strings.isIPv4} — moved to `Validators/Strings`, kept here for the instance API. */
    public isIPv4(p: unknown): string {
        return Strings.isIPv4(p);
    }

    /** @see {@link Strings.isIPv6} — moved to `Validators/Strings`, kept here for the instance API. */
    public isIPv6(p: unknown): string {
        return Strings.isIPv6(p);
    }

    /** @see {@link Strings.isIP} — moved to `Validators/Strings`, kept here for the instance API. */
    public isIP(p: unknown): string {
        return Strings.isIP(p);
    }

    /** @see {@link Strings.isSemver} — moved to `Validators/Strings`, kept here for the instance API. */
    public isSemver(p: unknown): string {
        return Strings.isSemver(p);
    }

    /** @see {@link Strings.isSlug} — moved to `Validators/Strings`, kept here for the instance API. */
    public isSlug(p: unknown): string {
        return Strings.isSlug(p);
    }

    /** @see {@link Strings.isJWT} — moved to `Validators/Strings`, kept here for the instance API. */
    public isJWT(p: unknown): string {
        return Strings.isJWT(p);
    }

    /** @see {@link Strings.isMACAddress} — moved to `Validators/Strings`, kept here for the instance API. */
    public isMACAddress(p: unknown): string {
        return Strings.isMACAddress(p);
    }

    /** @see {@link Strings.isHexColor} — moved to `Validators/Strings`, kept here for the instance API. */
    public isHexColor(p: unknown): string {
        return Strings.isHexColor(p);
    }

    /** @see {@link Strings.isISODate} — moved to `Validators/Strings`, kept here for the instance API. */
    public isISODate(p: unknown): Date {
        return Strings.isISODate(p);
    }

    /** @see {@link Strings.isBase64} — moved to `Validators/Strings`, kept here for the instance API. */
    public isBase64(p: unknown, opts: { urlSafe?: boolean; requirePadding?: boolean } = {}): string {
        return Strings.isBase64(p, opts);
    }

    /** @see {@link Strings.isPhoneNumber} — moved to `Validators/Strings`, kept here for the instance API. */
    public isPhoneNumber(p: unknown): string {
        return Strings.isPhoneNumber(p);
    }

    /** @see {@link Strings.matches} — moved to `Validators/Strings`, kept here for the instance API. */
    public matches(regex: RegExp, p: unknown): string {
        return Strings.matches(regex, p);
    }

    /** @see {@link Strings.isNonEmptyString} — moved to `Validators/Strings`, kept here for the instance API. */
    public isNonEmptyString(p: unknown): string {
        return Strings.isNonEmptyString(p);
    }

    /** @see {@link Numbers.isInteger} — moved to `Validators/Numbers`, kept here for the instance API. */
    public isInteger(p: unknown): number {
        return Numbers.isInteger(p);
    }

    /** @see {@link Numbers.isInRange} — moved to `Validators/Numbers`, kept here for the instance API. */
    public isInRange(min: number, max: number, p: unknown): number {
        return Numbers.isInRange(min, max, p);
    }

    /** @see {@link Numbers.isPositiveNumber} — moved to `Validators/Numbers`, kept here for the instance API. */
    public isPositiveNumber(p: unknown): number {
        return Numbers.isPositiveNumber(p);
    }

    /** @see {@link Numbers.isPositiveInteger} — moved to `Validators/Numbers`, kept here for the instance API. */
    public isPositiveInteger(p: unknown): number {
        return Numbers.isPositiveInteger(p);
    }

    /** @see {@link Numbers.isNegativeNumber} — moved to `Validators/Numbers`, kept here for the instance API. */
    public isNegativeNumber(p: unknown): number {
        return Numbers.isNegativeNumber(p);
    }

    /** @see {@link Numbers.isNegativeInteger} — moved to `Validators/Numbers`, kept here for the instance API. */
    public isNegativeInteger(p: unknown): number {
        return Numbers.isNegativeInteger(p);
    }

    /** @see {@link Numbers.isFiniteNumber} — moved to `Validators/Numbers`, kept here for the instance API. */
    public isFiniteNumber(p: unknown): number {
        return Numbers.isFiniteNumber(p);
    }

    /** @see {@link Numbers.isSafeInteger} — moved to `Validators/Numbers`, kept here for the instance API. */
    public isSafeInteger(p: unknown): number {
        return Numbers.isSafeInteger(p);
    }

    /** @see {@link Numbers.isPort} — moved to `Validators/Numbers`, kept here for the instance API. */
    public isPort(p: unknown): number {
        return Numbers.isPort(p);
    }

    /** @see {@link Sizes.isLength} — moved to `Validators/Sizes`, kept here for the instance API. */
    public isLength<T extends string | readonly unknown[]>(bounds: { min?: number; max?: number }, p: unknown): T {
        return Sizes.isLength<T>(bounds, p);
    }

    /** @see {@link Sizes.isEmpty} — moved to `Validators/Sizes`, kept here for the instance API. */
    public isEmpty(p: unknown): unknown {
        return Sizes.isEmpty(p);
    }

    /** @see {@link Sizes.isNonEmpty} — moved to `Validators/Sizes`, kept here for the instance API. */
    public isNonEmpty<T = unknown>(p: unknown): T {
        return Sizes.isNonEmpty<T>(p);
    }

    /** @see {@link Sizes.isNonEmptyArray} — moved to `Validators/Sizes`, kept here for the instance API. */
    public isNonEmptyArray<T = unknown>(p: unknown): T[] {
        return Sizes.isNonEmptyArray<T>(p);
    }

    /** @see {@link Sizes.isOneOf} — moved to `Validators/Sizes`, kept here for the instance API. */
    public isOneOf<T>(values: readonly T[], p: unknown): T {
        return Sizes.isOneOf<T>(values, p);
    }

    /** @see {@link Guards.isString} — moved to `Validators/Guards`, kept here for the instance API. */
    public isString(value: unknown): value is string {
        return Guards.isString(value);
    }

    /** @see {@link Guards.isNumber} — moved to `Validators/Guards`, kept here for the instance API. */
    public isNumber(value: unknown): value is number {
        return Guards.isNumber(value);
    }

    /** @see {@link Guards.isBoolean} — moved to `Validators/Guards`, kept here for the instance API. */
    public isBoolean(value: unknown): value is boolean {
        return Guards.isBoolean(value);
    }

    /** @see {@link Guards.isArray} — moved to `Validators/Guards`, kept here for the instance API. */
    public isArray<T = unknown>(value: unknown): value is T[] {
        return Guards.isArray<T>(value);
    }

    /** @see {@link Guards.isObject} — moved to `Validators/Guards`, kept here for the instance API. */
    public isObject<T extends Record<string, unknown> = Record<string, unknown>>(value: unknown): value is T {
        return Guards.isObject<T>(value);
    }

    /** @see {@link Guards.asString} — moved to `Validators/Guards`, kept here for the instance API. */
    public asString(value: unknown): string {
        return Guards.asString(value);
    }

    /** @see {@link Guards.asNumber} — moved to `Validators/Guards`, kept here for the instance API. */
    public asNumber(value: unknown): number {
        return Guards.asNumber(value);
    }

    /** @see {@link Guards.asBoolean} — moved to `Validators/Guards`, kept here for the instance API. */
    public asBoolean(value: unknown): boolean {
        return Guards.asBoolean(value);
    }

    /** @see {@link Guards.asArray} — moved to `Validators/Guards`, kept here for the instance API. */
    public asArray<T = unknown>(value: unknown): T[] {
        return Guards.asArray<T>(value);
    }

    /** @see {@link Guards.asObject} — moved to `Validators/Guards`, kept here for the instance API. */
    public asObject<T extends Record<string, unknown> = Record<string, unknown>>(value: unknown): T {
        return Guards.asObject<T>(value);
    }

    /** @see {@link Guards.isPlainObject} — moved to `Validators/Guards`, kept here for the instance API. */
    public isPlainObject<T extends Record<string, unknown> = Record<string, unknown>>(p: unknown): T {
        return Guards.isPlainObject<T>(p);
    }

    /** @see {@link Guards.isPromise} — moved to `Validators/Guards`, kept here for the instance API. */
    public isPromise<T = unknown>(p: unknown): Promise<T> {
        return Guards.isPromise<T>(p);
    }

    /** @see {@link Guards.isInstanceOf} — moved to `Validators/Guards`, kept here for the instance API. */
    public isInstanceOf<T>(ctor: new (...args: never[]) => T, p: unknown): T {
        return Guards.isInstanceOf<T>(ctor, p);
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
            // The fragments describe the *wire* shape these accept, which is
            // the point of coercion and the shape a JSON Schema documents.
            number: describing((value: unknown): number => this.coerceNumber(value), { type: ['number', 'string'] }),
            boolean: describing((value: unknown): boolean => this.coerceBoolean(value), { type: ['boolean', 'string', 'number'] }),
            date: describing((value: unknown): Date => this.coerceDate(value), { type: ['string', 'number'], format: 'date-time' }),
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
        throw issueError('invalid_type', `${String(value)} cannot be coerced to a number.`, 'number', getType(value));
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

        throw issueError('invalid_type', `${String(value)} cannot be coerced to a boolean.`, 'boolean', getType(value));
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

        throw issueError('invalid_type', `${String(value)} cannot be coerced to a date.`, 'date', getType(value));
    }

    /**
     * Converts a schema into a JSON Schema document — the input OpenAPI and
     * Swagger tooling expects, and the main reason people reach for TypeBox.
     *
     * Type strings, `?` markers, `|` unions, arrays and nested objects all
     * have exact equivalents. Validator slots do not: a validator is an opaque
     * function, so Typer's own validators and combinators carry the fragment
     * they correspond to (`isEmail` becomes
     * `{ type: 'string', format: 'email' }`, `arrayOf(…, { min: 1 })` becomes
     * `minItems: 1`), and a validator the caller wrote becomes `{}` — which
     * accepts anything.
     *
     * Aliases with no JSON counterpart — `symbol`, `function`, `map`, `set`,
     * `regexp`, the buffer types, and anything registered with `extend` — are
     * in the same position. Pass `unrepresentable: 'throw'` in a build step to
     * be told about them instead of shipping a schema that quietly accepts
     * anything at those keys.
     *
     * @template S - The schema to convert
     * @param {S} schema - The schema to convert.
     * @param {ToJSONSchemaOptions} [options] - Dialect, metadata, strictness, and the unrepresentable-slot policy.
     * @returns {JSONSchemaDocument} A JSON Schema document, draft 2020-12 by default.
     * @throws {TyperError} With `unrepresentable: 'throw'`, listing every slot that has no equivalent.
     * @example
     * typer.toJSONSchema({ id: 'number', email: typer.validators.isEmail, note: 'string?' });
     * // {
     * //   $schema: 'https://json-schema.org/draft/2020-12/schema',
     * //   type: 'object',
     * //   properties: {
     * //     id:    { type: 'number' },
     * //     email: { type: 'string', format: 'email' },
     * //     note:  { type: ['string', 'null'] },
     * //   },
     * //   required: ['id', 'email'],
     * // }
     */
    public toJSONSchema<const S extends ValidateSchema<S, KnownAlias<TRegistry>>>(
        schema: S,
        options: ToJSONSchemaOptions = {},
    ): JSONSchemaDocument {
        return toJSONSchema(schema as Record<string, unknown>, options);
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
            const issues = this.getCompiledChecker(typesOrSchemaOrValidator as Record<string, unknown>, true)(value, '');
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
            const issues = this.getCompiledChecker(typesOrSchemaOrValidator as Record<string, unknown>, true)(value, '');
            return issues.length === 0
                ? { success: true, data: value }
                : failure(issues);
        }

        // The same fast path, for validators that can report without throwing.
        // `objectOf(schema)` wraps the very checker the branch above uses, so
        // routing it through `parse` made the wrapper cost an order of
        // magnitude more than the schema it wraps.
        if (typeof typesOrSchemaOrValidator === "function") {
            const safeRun = (typesOrSchemaOrValidator as SafeReporting<unknown>)[SAFE_RESULT];
            if (safeRun !== undefined) return safeRun(value);
            return runCatching(typesOrSchemaOrValidator as Validator<unknown>, value);
        }

        return runCatching((input: unknown) => this.parse(typesOrSchemaOrValidator as never, input), value);
    }

    // -----------------------------------------------------------------------
    //  Schema-backed combinators, delegating to `Combinators/Objects`
    //
    //  These need the compile context, which for an instance means its own
    //  registered types. A registry is structurally just `{ context }`, so the
    //  instance hands its context over in that shape.
    // -----------------------------------------------------------------------

    /** The instance's compile context, in the shape the free combinators take. */
    private get asRegistry(): { context: CompileContext } {
        return { context: this.context };
    }

    /** @see {@link Objects.objectOf} — moved to `Combinators/Objects`, kept here for the instance API. */
    public objectOf<const S extends ValidateSchema<S, KnownAlias<TRegistry>>>(schema: S, options: { strict?: boolean } = {}): StandardValidator<Infer<S, TRegistry>> {
        return Objects.objectOf(schema as never, { ...options, registry: this.asRegistry }) as StandardValidator<Infer<S, TRegistry>>;
    }

    /** @see {@link Objects.discriminatedUnion} — moved to `Combinators/Objects`, kept here for the instance API. */
    public discriminatedUnion<const Key extends string, const V extends Record<string, Record<string, unknown>>>(key: Key, variants: V, options: { strict?: boolean } = {}): StandardValidator<DiscriminatedUnion<Key, V, TRegistry>> {
        return Objects.discriminatedUnion(key, variants, { ...options, registry: this.asRegistry }) as StandardValidator<DiscriminatedUnion<Key, V, TRegistry>>;
    }

    /**
     * Turns any schema, validator or type alias into a Standard Schema.
     *
     * @see {@link Objects.standard}
     */
    public standard<K extends TypeKey>(target: K | readonly K[]): StandardValidator<TypeMap[K]>;
    public standard<T>(target: Validator<T>): StandardValidator<T>;
    public standard<const S extends ValidateSchema<S, KnownAlias<TRegistry>>>(target: S, options?: { strict?: boolean }): StandardValidator<Infer<S, TRegistry>>;
    public standard<T>(target: string | readonly string[]): StandardValidator<T>;
    public standard(target: unknown, options: { strict?: boolean } = {}): StandardValidator<unknown> {
        // A bare alias has to go through this instance's `isType`, which knows
        // the types registered on it; the free `standard` only knows built-ins.
        if (target === null || typeof target !== 'object' || Array.isArray(target)) {
            if (typeof target !== 'function') {
                const inner: Validator<unknown> = (value: unknown) => this.isType(target as string | readonly string[], value);
                return Objects.asStandard((value: unknown) => inner(value), (value) => runCatching(inner, value));
            }
        }
        return Objects.standard(target, { ...options, registry: this.asRegistry });
    }



    /**
     * Alias resolution and the compiled-checker caches for this instance.
     *
     * The compiler itself lives in `Core/Compile` and takes this as an
     * argument, so it can run without a `Typer` at all. What stays here is
     * the per-instance part: `registerType` makes one instance resolve a
     * name differently from another, and the caches must be invalidated
     * with it.
     */
    private context: CompileContext = createContext((rawType: string) => this.resolvePredicate(rawType));

    /**
     * Returns a cached, closure-compiled checker for the given schema,
     * resolved against this instance's registered types.
     *
     * @param schema - The schema to compile.
     * @param strictMode - Whether to reject keys the schema does not declare.
     */
    private getCompiledChecker(schema: Record<string, unknown>, strictMode = true): CompiledChecker {
        return getCompiledChecker(this.context, schema, strictMode);
    }

    // -----------------------------------------------------------------------
    //  Combinators, delegating to `Combinators/*`
    // -----------------------------------------------------------------------

    /** @see {@link Basic.nullable} — moved to `Combinators/Basic`, kept here for the instance API. */
    public nullable<T>(validator: Validator<T>): Validator<T | null> {
        return Basic.nullable<T>(validator);
    }

    /** @see {@link Basic.optional} — moved to `Combinators/Basic`, kept here for the instance API. */
    public optional<T>(validator: Validator<T>): Validator<T | undefined> {
        return Basic.optional<T>(validator);
    }

    /** @see {@link Basic.union} — moved to `Combinators/Basic`, kept here for the instance API. */
    public union<T extends readonly unknown[]>(
    ...validators: { [K in keyof T]: Validator<T[K]> }
): Validator<T[number]> {
        return Basic.union<T>(...validators);
    }

    /** @see {@link Basic.literal} — moved to `Combinators/Basic`, kept here for the instance API. */
    public literal<const T extends readonly (string | number | boolean | null)[]>(
    ...values: T
): Validator<T[number]> {
        return Basic.literal<T>(...values);
    }

    /** @see {@link Basic.refine} — moved to `Combinators/Basic`, kept here for the instance API. */
    public refine<T>(validator: Validator<T>, predicate: (value: T) => boolean, message: string): Validator<T> {
        return Basic.refine<T>(validator, predicate, message);
    }

    /** @see {@link Basic.transform} — moved to `Combinators/Basic`, kept here for the instance API. */
    public transform<T, U>(validator: Validator<T>, transformer: (value: T) => U): Validator<U> {
        return Basic.transform<T, U>(validator, transformer);
    }

    /** @see {@link Basic.withDefault} — moved to `Combinators/Basic`, kept here for the instance API. */
    public withDefault<T>(validator: Validator<T>, fallback: T | (() => T)): Validator<T> {
        return Basic.withDefault<T>(validator, fallback);
    }

    /** @see {@link Basic.lazy} — moved to `Combinators/Basic`, kept here for the instance API. */
    public lazy<T>(factory: () => Validator<T>): Validator<T> {
        return Basic.lazy<T>(factory);
    }

    /** @see {@link Basic.instanceOf} — moved to `Combinators/Basic`, kept here for the instance API. */
    public instanceOf<T>(ctor: new (...args: never[]) => T): Validator<T> {
        return Basic.instanceOf<T>(ctor);
    }

    /** @see {@link Collections.arrayOf} — moved to `Combinators/Collections`, kept here for the instance API. */
    public arrayOf<T>(element: Validator<T>, bounds: { min?: number; max?: number } = {}): Validator<T[]> {
        return Collections.arrayOf<T>(element, bounds);
    }

    /** @see {@link Collections.record} — moved to `Combinators/Collections`, kept here for the instance API. */
    public record<T>(value: Validator<T>): Validator<Record<string, T>> {
        return Collections.record<T>(value);
    }

    /** @see {@link Collections.tuple} — moved to `Combinators/Collections`, kept here for the instance API. */
    public tuple<const T extends readonly Validator<unknown>[]>(validators: T): Validator<{ -readonly [K in keyof T]: T[K] extends Validator<infer U> ? U : never }> {
        return Collections.tuple<T>(validators);
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
    public checkStructure(schema: Record<string, unknown>, obj: Record<string, unknown>, path = '', strictMode = true): StructureValidationReturn {
        if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
            const issues = [makeIssue('invalid_schema', path, `Invalid schema: must be a non-null object`)];
            return { isValid: false, errors: issueMessages(issues), issues };
        }

        const issues = this.getCompiledChecker(schema, strictMode)(obj, path);
        return { isValid: issues.length === 0, errors: issueMessages(issues), issues };
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
export type { JSONSchemaDocument, JSONSchemaFragment, ToJSONSchemaOptions, UnrepresentablePolicy } from "./Types/JSONSchema";
export type { BoundValidators, Coercions, DiscriminatedUnion, Infer, IssueMeta, IssueCode, KnownAlias, MergeSchema, OmitSchema, OptionalSlot, ParseResult, PartialSchema, PickSchema, ResolveSchemaValue, ResolveTypeString, Schema, SchemaArrayElement, StandardValidator, StructureValidationReturn, TypeKey, TypeMap, TypeRegistry, TyperReturn, UnknownAlias, ValidateSchema, ValidationIssue, Validator } from "./Types/Typer";