/**
 * Defines the expected input and output types for a function.
 */
export type TyperExpectTypes = {
    /** The expected type(s) of the function's parameters */
    paramTypes: string[];
    /** The expected return type(s) of the function */
    returnType: string[];
};

/**
 * Defines the return type of a type-checked function.
 * @template T - The expected return type
 */
export type TyperReturn<T> = T | never | void;

/**
 * Represents the result of a structure validation check.
 */
export type StructureValidationReturn = {
    /** Indicates whether the validation was successful */
    isValid: boolean;
    /** Array of error messages if validation fails */
    errors: string[];
};

/**
 * Maps every built-in type alias accepted by `Typer` to the runtime type it
 * resolves to. Used to make `isType`/`is`/`safeParse` return the correct
 * static type when called with a string literal known at compile time.
 */
export type TypeMap = {
    string: string;
    s: string;
    str: string;
    number: number;
    n: number;
    num: number;
    boolean: boolean;
    b: boolean;
    bool: boolean;
    bigint: bigint;
    bi: bigint;
    bint: bigint;
    symbol: symbol;
    sym: symbol;
    undefined: undefined;
    u: undefined;
    undef: undefined;
    void: undefined;
    null: null;
    array: unknown[];
    a: unknown[];
    arr: unknown[];
    object: object;
    o: object;
    obj: object;
    date: Date;
    dt: Date;
    regex: RegExp;
    reg: RegExp;
    regexp: RegExp;
    map: Map<unknown, unknown>;
    set: Set<unknown>;
    function: (...args: unknown[]) => unknown;
    f: (...args: unknown[]) => unknown;
    funct: (...args: unknown[]) => unknown;
    json: string;
    j: string;
    array_buffer: ArrayBuffer;
    ab: ArrayBuffer;
    arr_buff: ArrayBuffer;
    data_view: DataView;
    dv: DataView;
    dt_v: DataView;
    typed_array: ArrayBufferView;
    ta: ArrayBufferView;
    typ_arr: ArrayBufferView;
    dom: HTMLElement;
    domel: HTMLElement;
    domelement: HTMLElement;
};

/**
 * Union of every recognized built-in type alias.
 */
export type TypeKey = keyof TypeMap;

/**
 * Result returned by `safeParse`: a discriminated union with either
 * the validated value or the encountered error.
 * @template T - The validated value type on success
 */
export type ParseResult<T> =
    | { success: true; data: T }
    | { success: false; error: TypeError };

/**
 * A validator function: takes an unknown value and either returns the
 * narrowed value or throws a `TypeError`. Used by combinators
 * (`nullable`, `optional`, `union`) to compose validators.
 * @template T - The narrowed value type on success
 */
export type Validator<T> = (value: unknown) => T;

// ---------------------------------------------------------------------------
//  Schema inference — derive a TypeScript type from a runtime schema literal
// ---------------------------------------------------------------------------

/** Removes leading/trailing whitespace at the type level. */
type Trim<S extends string> =
    S extends ` ${infer R}` ? Trim<R>
    : S extends `${infer R} ` ? Trim<R>
    : S;

/**
 * Resolves a single type-name string (possibly a `a|b|c` union) to its
 * runtime TypeScript type. Falls back to `unknown` for unknown aliases.
 */
export type ResolveTypeString<S extends string> =
    S extends `${infer A}|${infer B}`
    ? ResolveTypeString<Trim<A>> | ResolveTypeString<Trim<B>>
    : Trim<S> extends keyof TypeMap
    ? TypeMap[Trim<S>]
    : unknown;

/**
 * Resolves a single schema entry value to its TypeScript type.
 *  - `'string'`    → `string`
 *  - `'string?'`   → `string | null`  (key becomes optional in `Infer`)
 *  - `'a|b'`       → `a | b`
 *  - `['string']`  → `string[]`
 *  - nested object → recursive `Infer`
 *  - validator fn  → its return type
 */
export type ResolveSchemaValue<V> =
    V extends Validator<infer T> ? T
    : V extends string
    ? V extends `${infer Base}?` ? ResolveTypeString<Base> | null : ResolveTypeString<V>
    : V extends readonly (infer E)[]
    ? E extends string ? ResolveTypeString<E>[] : ResolveSchemaValue<E>[]
    : V extends Record<string, unknown>
    ? Infer<V>
    : unknown;

/** Keys of `S` whose value is *not* marked optional (`'foo?'`). */
type RequiredKeys<S> = {
    [K in keyof S]: S[K] extends `${string}?` ? never : K
}[keyof S];

/** Keys of `S` whose value *is* marked optional (`'foo?'`). */
type OptionalKeys<S> = {
    [K in keyof S]: S[K] extends `${string}?` ? K : never
}[keyof S];

/**
 * Flatten an intersection so editor hover shows a single object type rather
 * than `A & B`. Pure type-level transform, no runtime cost.
 */
type Prettify<T> = { [K in keyof T]: T[K] } & {};

/**
 * Derives the TypeScript type of an object that satisfies the given schema.
 * Use directly on a schema literal — no `as const` required when calling
 * `parse`/`safeParse`, thanks to the `<const S>` parameter.
 *
 * @example
 * const userSchema = { id: 'number', name: 'string', email: 'string?' };
 * type User = Infer<typeof userSchema>;
 * // → { id: number; name: string; email?: string | null }
 */
export type Infer<S> = Prettify<
    & { [K in RequiredKeys<S>]: ResolveSchemaValue<S[K]> }
    & { [K in OptionalKeys<S>]?: ResolveSchemaValue<S[K]> }
>;

/**
 * Element types allowed inside an array-schema slot, e.g. `tags: ['string']`
 * or `users: [userSchema]` or `ids: [validator]`.
 */
export type SchemaArrayElement = string | Schema | Validator<unknown>;

/**
 * Recursive schema definition accepted by `parse`/`safeParse`/`checkStructure`.
 * Each key can be a type-name string (with optional `?` suffix and `|` unions),
 * an array describing element type, a nested schema, or a `Validator<T>` function.
 *
 * Note: the array slot accepts any-length arrays at the type level so that
 * schemas declared as plain `const` variables (without `as const`) still
 * satisfy the constraint. The runtime requires exactly one element and will
 * surface a clear error message otherwise.
 */
export type Schema = {
    readonly [key: string]: string | readonly SchemaArrayElement[] | Schema | Validator<unknown>;
};
