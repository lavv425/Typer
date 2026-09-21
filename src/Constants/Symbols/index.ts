import type { ParseResult } from "../../Types/Typer";

/**
 * Internal marker: a validator that can report failures **without throwing**
 * carries its non-throwing counterpart here.
 *
 * `safeParse` reads it and calls that instead of running the throwing
 * validator inside a `try`/`catch`. Building a `TyperError` — capturing its
 * stack, above all — costs an order of magnitude more than the validation
 * itself, and a failed `safeParse` is an expected outcome rather than an
 * exceptional one.
 *
 * A symbol rather than a string key: it cannot collide with a property a
 * caller put on their own validator, and it stays out of `Object.keys`,
 * `JSON.stringify` and spreads.
 *
 * @internal Not part of the public API.
 */
export const SAFE_RESULT = Symbol('typer.safeResult');

/**
 * A validator that carries a non-throwing counterpart under {@link SAFE_RESULT}.
 *
 * @internal
 */
export type SafeReporting<T> = { [SAFE_RESULT]?: (value: unknown) => ParseResult<T> };
