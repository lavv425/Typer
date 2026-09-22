import type { ParseResult, ValidationIssue, Validator } from "@/Types/Typer";
import { TyperError } from "@/Errors/TyperError";
import { formatIssues, makeIssue } from "@/Utils/Issues";

/**
 * Building blocks for the non-throwing half of the API, shared by the free
 * entry points, the combinators and the class so all three report identically.
 */

/**
 * Builds the failure half of a {@link ParseResult}.
 *
 * `error` is a lazy accessor: constructing an `Error` captures a stack trace,
 * which costs more than the entire validation that produced the issues.
 * Callers that only read `issues` — the recommended path — never pay for it,
 * and callers that do read `error` get the same instance every time.
 *
 * @param issues - The failures to report. Must not be empty.
 * @param existing - An already-built error to hand back instead of a new one.
 */
export const failure = (issues: ValidationIssue[], existing?: TypeError): ParseResult<never> => {
    let cached: TypeError | undefined = existing;
    return {
        success: false,
        issues,
        get error(): TypeError {
            return (cached ??= new TyperError(formatIssues(issues), issues));
        },
    };
};

/**
 * Runs a throwing validator and reports the outcome as a {@link ParseResult}.
 *
 * The fallback for everything with no non-throwing path of its own: a
 * user-supplied validator, a type alias, an array of aliases.
 *
 * @param validator - The validator to run.
 * @param value - The value to validate.
 */
export const runCatching = <T>(validator: Validator<T>, value: unknown): ParseResult<T> => {
    try {
        return { success: true, data: validator(value) };
    } catch (e: unknown) {
        if (e instanceof TyperError) return failure(e.issues, e);
        const message = e instanceof Error ? e.message : String(e);
        return failure([makeIssue('invalid_type', '', message)], e instanceof TypeError ? e : undefined);
    }
};
