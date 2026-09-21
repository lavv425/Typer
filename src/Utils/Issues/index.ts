import type { StandardSchemaV1 } from "../../Types/StandardSchema";
import type { IssueMeta, IssueCode, ValidationIssue } from "../../Types/Typer";
import { TyperError } from "../../Errors/TyperError";
import { splitPath } from "../Path";

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
export const makeIssue = (code: IssueCode, path: string, message: string, expected?: string, received?: string, meta?: IssueMeta): ValidationIssue =>
    meta === undefined
        ? { code, path, message, expected, received }
        : { code, path, message, expected, received, minimum: meta.minimum, maximum: meta.maximum, value: meta.value };

/**
 * Builds the error a constraint validator throws.
 *
 * Constraint validators (`isLength`, `isInRange`, `isEmail`, …) used to throw a
 * bare `TypeError`, which the schema compiler could only report as
 * `code: 'custom'` — so "too short" and "out of range" were indistinguishable
 * without reading the message, the one thing the structured errors exist to
 * avoid. Throwing a `TyperError` carrying a single, properly coded issue lets
 * that code survive all the way out, whether the validator was called directly
 * or from inside a schema.
 *
 * The issue's `path` is empty: the validator knows what went wrong, not where
 * it sits in the caller's schema. The compiler fills the path in.
 *
 * @param code - The machine-readable reason.
 * @param message - The human-readable description, reused as the error message.
 * @param expected - The format or type the constraint asked for.
 * @param received - What was found, when it is safe to report.
 * @param bounds - The violated bound, for `too_small` / `too_big`.
 */
export const issueError = (code: IssueCode, message: string, expected?: string, received?: string, bounds?: IssueMeta): TyperError => new TyperError(message, [makeIssue(code, '', message, expected, received, bounds)]);

/**
 * Reads the constraint metadata off an error thrown by a validator, so a
 * schema slot can report `too_small` instead of a flat `custom`.
 *
 * Only a `TyperError` carrying exactly one root-level issue qualifies — that
 * is the shape {@link issueError} produces. A validator that failed for several
 * reasons, or at a path of its own (a nested `objectOf`), keeps the aggregated
 * `custom` reporting it had.
 *
 * @param error - The value thrown by the validator.
 */
export const constraintOf = (error: unknown): ValidationIssue | undefined => {
    if (!(error instanceof TyperError) || error.issues.length !== 1) return undefined;
    const issue = error.issues[0];
    return issue.path === '' ? issue : undefined;
};

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

/**
 * Converts issues into the shape Standard Schema consumers expect.
 *
 * The only structural difference is the path: Typer stores it as a dotted
 * string, the spec wants an array of segments. `code`, `expected` and
 * `received` have no place in the spec's `Issue`, so they are carried along as
 * extra properties — consumers that only read `message`/`path` are unaffected,
 * and the ones that know about Typer keep the machine-readable reason.
 *
 * `value` is the one field deliberately left behind: it carries the offending
 * value, and this is the boundary where an issue is handed to a framework that
 * may log or serialize it whole.
 *
 * @param issues - The issues to convert.
 */
export const toStandardIssues = (issues: ValidationIssue[]): StandardSchemaV1.Issue[] => {
    const out: StandardSchemaV1.Issue[] = new Array(issues.length);
    for (let i = 0; i < issues.length; i++) {
        const { value: _omitted, ...issue } = issues[i];
        out[i] = { ...issue, path: splitPath(issues[i].path) };
    }
    return out;
};
