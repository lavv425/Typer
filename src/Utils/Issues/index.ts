import type { IssueCode, ValidationIssue } from "../../Types/Typer";

/**
 * Builds a structured validation issue.
 *
 * Every issue is constructed through this helper so they all share one object
 * shape, and so the human-readable `message` always travels together with the
 * machine-readable `code`/`path` that callers should actually branch on.
 *
 * @param code - Machine-readable reason for the failure.
 * @param path - Dotted path to the offending value (`""` for the root).
 * @param message - Human-readable description.
 * @param expected - What the schema asked for, when meaningful.
 * @param received - What was actually found, when meaningful.
 */
export const makeIssue = (code: IssueCode, path: string, message: string, expected?: string, received?: string): ValidationIssue => ({ code, path, message, expected, received });

/**
 * Renders issues into the aggregated message used by `parse`'s thrown error.
 *
 * @param issues - The issues to render.
 * @returns A `Validation failed:` block with one bulleted line per issue.
 */
export const formatIssues = (issues: ValidationIssue[]): string => {
    let out = 'Validation failed:';
    for (let i = 0; i < issues.length; i++) out += `\n  - ${issues[i].message}`;
    return out;
};

/**
 * Extracts just the human-readable messages, for the legacy `string[]` shape
 * returned by `checkStructure` and `validate`.
 *
 * @param issues - The issues to flatten.
 */
export const issueMessages = (issues: ValidationIssue[]): string[] => {
    const messages: string[] = new Array(issues.length);
    for (let i = 0; i < issues.length; i++) messages[i] = issues[i].message;
    return messages;
};
