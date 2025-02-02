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