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
    /**
     * The same failures in structured form — `code`, `path`, `expected` and
     * `received` per problem. Prefer this over parsing `errors`.
     */
    issues: ValidationIssue[];
};

// ---------------------------------------------------------------------------
//  Structured validation errors
// ---------------------------------------------------------------------------

/**
 * Machine-readable reason a value failed validation.
 *
 * Prefer branching on this over matching the human-readable `message`, which
 * is formatted for people and is not part of the stable API.
 */
export type IssueCode =
    /** The value was present but did not match any of the expected types. */
    | 'invalid_type'
    /** A required key was absent from the object. */
    | 'missing_key'
    /** The schema referenced a type name that is not registered. */
    | 'unknown_type'
    /** The schema itself is malformed (empty type string, array with 2 entries, …). */
    | 'invalid_schema'
    /** Strict mode only: the object carried a key the schema does not declare. */
    | 'unexpected_key'
    /** A `Validator` function supplied in the schema threw. */
    | 'custom';

/**
 * A single, structured validation failure.
 *
 * One failed `parse` can produce many issues — validation collects every
 * problem rather than stopping at the first.
 */
export type ValidationIssue = {
    /** Machine-readable reason, safe to branch on. */
    code: IssueCode;
    /**
     * Dotted path to the offending value, e.g. `"address.city"` or
     * `"tags[2]"`. Empty string when the failure is about the root value.
     */
    path: string;
    /** Human-readable description. Matches the legacy `errors[]` strings. */
    message: string;
    /** What the schema asked for, when meaningful (e.g. `"number"`). */
    expected?: string;
    /** What was actually found, when meaningful (e.g. `"string"`). */
    received?: string;
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
 *
 * On failure, prefer `issues` over `error`: it is structured, and reading it
 * does not force the (comparatively expensive) construction of an `Error`
 * with its stack trace, which `error` performs lazily on first access.
 *
 * @template T - The validated value type on success
 */
export type ParseResult<T> =
    | { success: true; data: T }
    | {
        success: false;
        /**
         * Every problem found, in schema order. Structured and cheap to read.
         */
        issues: ValidationIssue[];
        /**
         * The equivalent thrown error. Built on first access and then cached —
         * a `TyperError`, which extends `TypeError`.
         */
        readonly error: TypeError;
    };

/**
 * A validator function: takes an unknown value and either returns the
 * narrowed value or throws a `TypeError`. Used by combinators
 * (`nullable`, `optional`, `union`) to compose validators.
 * @template T - The narrowed value type on success
 */
export type Validator<T> = (value: unknown) => T;

// ---------------------------------------------------------------------------
//  Schema compiler internals
// ---------------------------------------------------------------------------

/**
 * A compiled check for one schema field. Reads the field out of its parent
 * object and appends any failure to `issues`.
 *
 * `parentPath` is passed down rather than pre-joined so the dotted error path
 * is only materialised when a check actually fails.
 */
export type FieldChecker = (obj: Record<string, unknown>, issues: ValidationIssue[], parentPath: string) => void;

/**
 * A compiled check for a value in an anonymous position — currently an array
 * element, which has an owning array path plus an index but no key of its own.
 */
export type ValueChecker = (value: unknown, issues: ValidationIssue[], arrayPath: string, index: number) => void;

/**
 * Everything the hot path needs from a type-string slot (`"string"`,
 * `"string?"`, `"a|b"`, `"a|b?"`), resolved once at compile time.
 */
export type TypeSlot = {
    /** Whether the slot was marked optional with a trailing `?`. */
    isOptional: boolean;
    /** The type names, in declaration order, with whitespace trimmed. */
    types: string[];
    /** Boolean predicates for the type names up to the first unresolvable one. */
    predicates: Array<(value: unknown) => boolean>;
    /** First unresolvable type name, or `null` when every name resolved. */
    unknownType: string | null;
    /** Pre-rendered `to be …` fragment of the mismatch message. */
    description: string;
};

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
export type ResolveTypeString<S extends string, R extends TypeRegistry = {}> =
    S extends `${infer A}|${infer B}`
    ? ResolveTypeString<Trim<A>, R> | ResolveTypeString<Trim<B>, R>
    : Trim<S> extends keyof TypeMap
    ? TypeMap[Trim<S>]
    : Trim<S> extends keyof R
    ? R[Trim<S>]
    : unknown;

/**
 * Resolves a single schema entry value to its TypeScript type.
 *  - `'string'`    → `string`
 *  - `'string?'`   → `string | null`  (key becomes optional in `Infer`)
 *  - `'a|b'`       → `a | b`
 *  - `['string']`  → `string[]`
 *  - nested object → recursive `Infer`
 *  - validator fn  → its return type
 *
 * @template V - The schema slot to resolve
 * @template R - Custom aliases registered on the instance, if any
 */
export type ResolveSchemaValue<V, R extends TypeRegistry = {}> =
    V extends Validator<infer T> ? T
    : V extends string
    ? V extends `${infer Base}?` ? ResolveTypeString<Base, R> | null : ResolveTypeString<V, R>
    : V extends readonly (infer E)[]
    ? E extends string ? ResolveTypeString<E, R>[] : ResolveSchemaValue<E, R>[]
    : V extends Record<string, unknown>
    ? Infer<V, R>
    : unknown;

/**
 * Keys of `S` that must be present: not marked optional with `'foo?'`, and
 * not backed by a validator that accepts `undefined` (e.g. `typer.optional`).
 */
type RequiredKeys<S> = {
    [K in keyof S]: S[K] extends `${string}?` ? never
    : S[K] extends Validator<infer T> ? (undefined extends T ? never : K)
    : K
}[keyof S];

/** Keys of `S` that may be absent — the complement of {@link RequiredKeys}. */
type OptionalKeys<S> = {
    [K in keyof S]: S[K] extends `${string}?` ? K
    : S[K] extends Validator<infer T> ? (undefined extends T ? K : never)
    : never
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
 * Pass `R` when the schema uses aliases registered through `Typer#extend`, so
 * they resolve to their real types instead of `unknown`.
 *
 * @template S - The schema to derive a type from
 * @template R - Custom aliases registered on the instance, if any
 * @example
 * const userSchema = { id: 'number', name: 'string', email: 'string?' };
 * type User = Infer<typeof userSchema>;
 * // → { id: number; name: string; email?: string | null }
 */
export type Infer<S, R extends TypeRegistry = {}> = Prettify<
    & { [K in RequiredKeys<S>]: ResolveSchemaValue<S[K], R> }
    & { [K in OptionalKeys<S>]?: ResolveSchemaValue<S[K], R> }
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

// ---------------------------------------------------------------------------
//  Compile-time schema checking
//
//  Without this, a typo like `{ id: 'nubmer' }` silently resolves to `unknown`
//  and only fails at runtime. These types turn it into a compile error whose
//  message names the offending alias.
// ---------------------------------------------------------------------------

/**
 * Custom aliases registered on a `Typer` instance, as a `name -> type` map.
 * Populated by `Typer#extend`; `{}` for a plain `new Typer()`.
 */
export type TypeRegistry = Record<string, unknown>;

/** Every alias a given instance accepts: the built-ins plus its registry. */
export type KnownAlias<R extends TypeRegistry> = (keyof TypeMap & string) | (keyof R & string);

/**
 * The type a schema slot is reported as when it names an alias that is not
 * registered. Surfacing it as a string literal makes TypeScript print the
 * offending alias in the assignability error.
 */
export type UnknownAlias<S extends string> = `Typer: unknown type alias in "${S}" — register it with extend() or fix the spelling`;

/** True when every alternative of a `a|b|c` string is a known alias. */
type IsKnownUnion<S extends string, Known extends string> =
    S extends `${infer A}|${infer B}`
    ? Trim<A> extends Known ? IsKnownUnion<B, Known> : false
    : Trim<S> extends Known ? true : false;

/**
 * True when a schema type string is made only of known aliases.
 *
 * A non-literal `string` (e.g. a schema typed as `Record<string, string>`)
 * carries no information to check, so it is allowed through rather than
 * rejected — strictness must not punish dynamically built schemas.
 */
type IsKnownTypeString<S extends string, Known extends string> =
    string extends S ? true
    : S extends `${infer Base}?` ? IsKnownUnion<Base, Known>
    : IsKnownUnion<S, Known>;

/** Validates one element slot of an array schema (`tags: ['string']`). */
type ValidateElement<E, Known extends string> =
    E extends string
    ? IsKnownTypeString<E, Known> extends true ? E : UnknownAlias<E>
    : E extends Validator<unknown> ? E
    : E extends Record<string, unknown> ? ValidateSchema<E, Known>
    : E;

/**
 * Maps a schema to itself when every alias it names is known, and to a
 * descriptive string literal at the offending slots when one is not.
 *
 * Used as a self-referential constraint — `<const S extends ValidateSchema<S, …>>` —
 * so the error is reported on the schema literal itself.
 *
 * @example
 * typer.schema({ id: 'nubmer' });
 * // Type '"nubmer"' is not assignable to type
 * // '`Typer: unknown type alias in "nubmer" — …`'
 */
/**
 * The `is*` / `as*` validators of a `Typer`, as a plain object of bound
 * functions. Signatures are preserved exactly, so multi-argument helpers such
 * as `isInRange` keep their arity.
 *
 * `is` and `isType` are excluded: they take the type as their first argument,
 * so they are not `Validator`s.
 */
export type BoundValidators<T> = {
    [K in keyof T as K extends 'is' | 'isType'
    ? never
    : K extends `is${string}` | `as${string}` ? K : never]: T[K]
};

export type ValidateSchema<S, Known extends string> = {
    [K in keyof S]:
    S[K] extends string
    ? IsKnownTypeString<S[K], Known> extends true ? S[K] : UnknownAlias<S[K]>
    : S[K] extends Validator<unknown> ? S[K]
    : S[K] extends readonly (infer E)[] ? readonly ValidateElement<E, Known>[]
    : S[K] extends Record<string, unknown> ? ValidateSchema<S[K], Known>
    : S[K];
};
