export type TyperExpectTypes = {
    /** The parameter(s) passed to the function */
    paramTypes: string[];
    /** The expected return type(s) of the function */
    returnType: string[];
};

export type TyperReturn<T> = T | never | void

export type StructureValidationReturn = {
    isValid: boolean;
    errors: string[];
}