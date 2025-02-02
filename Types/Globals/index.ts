export type Error = {
    /** The error message */
    message: string;
    /** The error type */
    name?: string;  
    /** Where the error occured in the call stack */
    stack?: string; 
    /** Additional contextual information like the code*/
    code?: string | number;
    /** Additional properties */
    [key: string]: unknown;
};