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
