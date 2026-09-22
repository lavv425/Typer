import type { Infer, KnownAlias, ParseResult, TypeRegistry, ValidateSchema, ValidationIssue, Validator } from "../../Types/Typer";
import type { ParseOptions } from "../Parse";
import { BUILTIN_CONTEXT } from "../Registry";
import { getCompiledChecker, slotIssue } from "../Compile";
import { failure } from "../Result";
import { TyperError } from "../../Errors/TyperError";
import { formatIssues, issueError } from "../../Utils/Issues";
import { indexPath, joinPath } from "../../Utils/Path";

/**
 * Asynchronous validation, for the checks that have to touch something else —
 * an email that must be unique, a token that must still be valid.
 *
 * Two decisions shape this:
 *
 * **Async is declared, never sniffed.** An ordinary function returning a
 * promise is indistinguishable from an `async` one, and `constructor.name`
 * lies as soon as anything is transpiled. So an async check is wrapped with
 * {@link asyncRefine}, which marks it, and the schema compiler needs no
 * knowledge of it at all.
 *
 * **The synchronous path fails loudly.** A marked validator throws when called
 * synchronously, so `parse` on a schema containing one reports an issue naming
 * the offending key rather than validating half the object and returning
 * `success: true`. That is the same principle as everything else here: a check
 * that quietly does not run is worse than one that fails.
 */

/** Marks a validator as asynchronous, and carries its real implementation. */
const ASYNC_VALIDATOR = Symbol('typer.asyncValidator');

/** A validator that must be awaited. */
type AsyncCapable<T> = Validator<T> & {
    [ASYNC_VALIDATOR]?: (value: unknown) => Promise<T>;
};

/**
 * Wraps an asynchronous check so it can sit in a schema slot.
 *
 * The base validator runs first and synchronously, so the async predicate only
 * ever sees a well-typed value — there is no point asking a database whether
 * an email is taken before knowing it is an email.
 *
 * @template T - The validated type
 * @param validator - Runs first, synchronously.
 * @param predicate - The asynchronous check. Must resolve `true` to accept.
 * @param message - Reported when the predicate resolves `false`.
 * @returns A validator for `parseAsync`; using it with `parse` is an error.
 * @example
 * const userSchema = {
 *     email: asyncRefine(isEmail, async (e) => !(await taken(e)), 'email already registered'),
 * };
 *
 * await parseAsync(userSchema, payload);
 */
export const asyncRefine = <T>(
    validator: Validator<T>,
    predicate: (value: T) => Promise<boolean>,
    message: string,
): Validator<T> => {
    const sync = (_value: unknown): T => {
        throw issueError(
            'custom',
            `This slot requires parseAsync: ${message}`,
            'an awaited check',
        );
    };

    (sync as AsyncCapable<T>)[ASYNC_VALIDATOR] = async (value: unknown): Promise<T> => {
        const parsed = validator(value);
        if (!(await predicate(parsed))) throw issueError('custom', message);
        return parsed;
    };

    return sync;
};

/** The async implementation a slot carries, if it is an async slot. */
const asyncOf = (slot: unknown): ((value: unknown) => Promise<unknown>) | undefined =>
    typeof slot === 'function' ? (slot as AsyncCapable<unknown>)[ASYNC_VALIDATOR] : undefined;

/** One awaited slot: where it is, what runs it, and what it runs on. */
type PendingSlot = {
    readonly path: string;
    readonly run: (value: unknown) => Promise<unknown>;
    readonly value: unknown;
    /** Writes the resolved value back, mirroring the synchronous slot rule. */
    readonly write: (resolved: unknown) => void;
};

/**
 * Walks a schema alongside a value, collecting the slots that must be awaited.
 *
 * Only the async slots are visited: everything else is left to the compiled
 * checker, which is faster than anything this could do and is already correct.
 */
const collect = (schema: Record<string, unknown>, value: unknown, path: string, into: PendingSlot[]): void => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return;
    const obj = value as Record<string, unknown>;

    for (const key of Object.keys(schema)) {
        const slot = schema[key];
        const here = joinPath(path, key);
        const run = asyncOf(slot);

        if (run !== undefined) {
            into.push({ path: here, run, value: obj[key], write: (resolved) => { obj[key] = resolved; } });
            continue;
        }

        if (Array.isArray(slot)) {
            const element = slot[0];
            const elementRun = asyncOf(element);
            const items = obj[key];
            if (!Array.isArray(items)) continue;

            for (let i = 0; i < items.length; i++) {
                if (elementRun !== undefined) {
                    const index = i;
                    into.push({
                        path: indexPath(here, index),
                        run: elementRun,
                        value: items[index],
                        write: (resolved) => { items[index] = resolved; },
                    });
                } else if (element !== null && typeof element === 'object') {
                    collect(element as Record<string, unknown>, items[i], indexPath(here, i), into);
                }
            }
            continue;
        }

        if (slot !== null && typeof slot === 'object') {
            collect(slot as Record<string, unknown>, obj[key], here, into);
        }
    }
};

/**
 * Stands in for an async slot during the synchronous pass: the key stays
 * declared, so strict mode does not report it, and the value is left for the
 * awaited pass to check.
 */
const PASSTHROUGH = (value: unknown): unknown => value;

/** Cache of the synchronous view of a schema, by schema identity. */
const syncOnlyCache = new WeakMap<object, Record<string, unknown>>();

/**
 * Derives the schema the compiled checker should see: the same shape, with
 * each async slot replaced by a pass-through so it stays declared while the
 * awaited pass does the real check.
 */
const syncOnly = (schema: Record<string, unknown>): Record<string, unknown> => {
    const cached = syncOnlyCache.get(schema);
    if (cached !== undefined) return cached;

    let changed = false;
    const out: Record<string, unknown> = {};

    for (const key of Object.keys(schema)) {
        const slot = schema[key];

        if (asyncOf(slot) !== undefined) {
            // Declared, but deferred. Dropping the key would make strict mode
            // report it as undeclared on the value — the async pass is what
            // actually checks it.
            out[key] = PASSTHROUGH;
            changed = true;
            continue;
        }

        if (Array.isArray(slot) && slot.length === 1) {
            const element = slot[0];
            if (asyncOf(element) !== undefined) {
                // The elements are awaited individually; the array itself is
                // still checked for being an array.
                out[key] = 'array';
                changed = true;
                continue;
            }
            if (element !== null && typeof element === 'object') {
                const inner = syncOnly(element as Record<string, unknown>);
                if (inner !== element) changed = true;
                out[key] = [inner];
                continue;
            }
        }

        if (slot !== null && typeof slot === 'object' && !Array.isArray(slot) && typeof slot !== 'function') {
            const inner = syncOnly(slot as Record<string, unknown>);
            if (inner !== slot) changed = true;
            out[key] = inner;
            continue;
        }

        out[key] = slot;
    }

    // Reusing the original object when nothing was removed keeps the compiled
    // checker cache warm — a derived copy would be a new identity every time.
    const result = changed ? out : schema;
    syncOnlyCache.set(schema, result);
    return result;
};

/** Runs the synchronous part and the awaited part, and merges the issues. */
const run = async <R extends TypeRegistry>(
    schema: Record<string, unknown>,
    value: unknown,
    options: ParseOptions<R> | undefined,
): Promise<ValidationIssue[]> => {
    const context = options?.registry?.context ?? BUILTIN_CONTEXT;
    const issues = getCompiledChecker(context, syncOnly(schema), options?.strict !== false)(value, '');

    const pending: PendingSlot[] = [];
    collect(schema, value, '', pending);
    if (pending.length === 0) return issues;

    // Started together rather than awaited in turn: these are independent I/O,
    // and a five-field form should not cost five round trips.
    const settled = await Promise.all(pending.map(async (slot) => {
        try {
            slot.write(await slot.run(slot.value));
            return null;
        } catch (e) {
            return slotIssue(e, slot.path);
        }
    }));

    for (const issue of settled) {
        if (issue !== null) issues.push(issue);
    }
    return issues;
};

/**
 * Validates a value against a schema that contains asynchronous checks.
 *
 * A schema with no async slots is validated entirely synchronously and the
 * result is simply resolved, so reaching for this "just in case" costs a
 * promise and nothing else.
 *
 * @template S - The schema
 * @template R - Custom aliases, inferred from `options.registry`
 * @param schema - The shape to validate against.
 * @param value - The value to validate.
 * @param options - Registry and strictness.
 * @returns The same value, typed.
 * @throws {TyperError} With one issue per problem found.
 */
export const parseAsync = async <const S extends ValidateSchema<S, KnownAlias<R>>, R extends TypeRegistry = {}>(
    schema: S,
    value: unknown,
    options?: ParseOptions<R>,
): Promise<Infer<S, R>> => {
    const issues = await run(schema as Record<string, unknown>, value, options);
    if (issues.length > 0) throw new TyperError(formatIssues(issues), issues);
    return value as Infer<S, R>;
};

/**
 * The non-throwing counterpart of {@link parseAsync}.
 *
 * @template S - The schema
 * @template R - Custom aliases, inferred from `options.registry`
 * @param schema - The shape to validate against.
 * @param value - The value to validate.
 * @param options - Registry and strictness.
 */
export const safeParseAsync = async <const S extends ValidateSchema<S, KnownAlias<R>>, R extends TypeRegistry = {}>(
    schema: S,
    value: unknown,
    options?: ParseOptions<R>,
): Promise<ParseResult<Infer<S, R>>> => {
    const issues = await run(schema as Record<string, unknown>, value, options);
    return issues.length === 0
        ? { success: true, data: value as Infer<S, R> }
        : failure(issues);
};

