/**
 * Asynchronous validation, for checks that have to touch something else — an
 * email that must be unique, a token that must still be valid.
 *
 * A separate entry point on purpose. Most schemas are synchronous, and the
 * whole argument for the 5.0 split is that a feature should cost only the
 * consumers who use it: importing `parse` must not drag an async walker in
 * behind it.
 *
 * @example
 * import { parseAsync, asyncRefine } from '@illavv/run_typer/async';
 * import { isEmail } from '@illavv/run_typer/validators';
 *
 * const userSchema = {
 *     email: asyncRefine(isEmail, async (e) => !(await taken(e)), 'email already registered'),
 * };
 *
 * await parseAsync(userSchema, payload);
 */

export { parseAsync, safeParseAsync, asyncRefine } from './Core/Async';

export { TyperError } from './Errors/TyperError';
export type { Infer, ParseResult, ValidationIssue, Validator } from './Types/Typer';
