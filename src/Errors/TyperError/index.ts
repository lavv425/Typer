import type { ValidationIssue } from "@/Types/Typer";

/**
 * The error every validation failure raises.
 *
 * It extends `TypeError` so existing `catch (e) { if (e instanceof TypeError) }`
 * code keeps working, and adds `issues`: the structured, machine-readable list
 * of everything that went wrong. Branch on `issue.code` and `issue.path`
 * rather than parsing `message`, which is formatted for humans and may change.
 *
 * @example
 * try {
 *     typer.parse({ id: 'number', email: 'string' }, payload);
 * } catch (e) {
 *     if (e instanceof TyperError) {
 *         for (const issue of e.issues) {
 *             console.error(issue.path, issue.code, issue.expected, issue.received);
 *         }
 *     }
 * }
 */
export class TyperError extends TypeError {
    /** Every problem found during validation, in schema order. Never empty. */
    public readonly issues: ValidationIssue[];

    /**
     * @param message - The aggregated, human-readable message.
     * @param issues - The structured failures behind that message.
     */
    constructor(message: string, issues: ValidationIssue[]) {
        super(message);
        this.name = 'TyperError';
        this.issues = issues;
        // Required when targeting ES5/ES2015 down-levelling: without it,
        // `instanceof TyperError` fails for subclasses of built-ins.
        Object.setPrototypeOf(this, TyperError.prototype);
    }

    /**
     * Groups the issues by their dotted path — the shape most form libraries
     * expect when mapping validation output onto fields.
     *
     * @returns A record of `path` to the messages reported at that path.
     * @example
     * const result = typer.safeParse(schema, payload);
     * if (!result.success) {
     *     const byField = (result.error as TyperError).flatten();
     *     // { "address.city": ["Expected \"address.city\" to be string, got number"] }
     * }
     */
    public flatten(): Record<string, string[]> {
        const grouped: Record<string, string[]> = {};
        for (const issue of this.issues) {
            (grouped[issue.path] ??= []).push(issue.message);
        }
        return grouped;
    }
}
