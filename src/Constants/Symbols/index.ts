import type { JSONSchemaFragment } from "../../Types/JSONSchema";
import type { ParseResult } from "../../Types/Typer";

/**
 * These use `Symbol.for`, not `Symbol()`, and that is load-bearing.
 *
 * Each published entry point is its own self-contained bundle, so each one
 * carries its own copy of this module. With `Symbol()` every copy would mint a
 * *different* symbol, and a marker attached by `@illavv/run_typer/validators`
 * would be invisible to `@illavv/run_typer/core` — which is precisely the
 * mixed-import usage the documentation recommends. The global registry makes
 * the key the same whoever created it.
 *
 * The `typer.` prefix is what keeps the registry keys from colliding with
 * another library's.
 */

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
export const SAFE_RESULT = Symbol.for('typer.safeResult');

/**
 * A validator that carries a non-throwing counterpart under {@link SAFE_RESULT}.
 *
 * @internal
 */
export type SafeReporting<T> = { [SAFE_RESULT]?: (value: unknown) => ParseResult<T> };

/**
 * Internal marker: a validator that knows how to describe itself in JSON
 * Schema carries that fragment here.
 *
 * A validator is an opaque function — `toJSONSchema` cannot look inside one to
 * learn that it accepts email addresses. Rather than emit `{}` for every
 * validator slot, Typer's own validators and combinators carry the fragment
 * they correspond to, and the converter reads it.
 *
 * @internal Not part of the public API.
 */
export const JSON_SCHEMA = Symbol.for('typer.jsonSchema');

/**
 * A validator that carries its JSON Schema fragment under {@link JSON_SCHEMA}.
 *
 * @internal
 */
export type SelfDescribing = { [JSON_SCHEMA]?: JSONSchemaFragment };

/**
 * Attaches a JSON Schema fragment to a validator, non-enumerably so the
 * function still spreads, serializes and compares as the plain function it is.
 *
 * @param validator - The function to describe. Must be one Typer owns.
 * @param fragment - The JSON Schema equivalent of what it accepts.
 * @returns The same function.
 * @internal
 */
export const describing = <T extends object>(validator: T, fragment: JSONSchemaFragment): T => {
    Object.defineProperty(validator, JSON_SCHEMA, {
        value: fragment,
        enumerable: false,
        configurable: true,
    });
    return validator;
};

/**
 * Same as {@link describing}, but the fragment is built on first read.
 *
 * Setup cost is the one benchmark Typer clearly wins, and most callers never
 * ask for a JSON Schema — so a combinator whose fragment costs real work to
 * build (converting a whole nested schema, say) must not charge every caller
 * for it up front. Building `objectOf`'s fragment eagerly was measured at
 * +42% on its setup time.
 *
 * The result is memoized, so repeated reads cost one property access.
 *
 * @param validator - The function to describe. Must be one Typer owns.
 * @param build - Produces the fragment; called at most once.
 * @returns The same function.
 * @internal
 */
export const describingLazy = <T extends object>(validator: T, build: () => JSONSchemaFragment): T => {
    let fragment: JSONSchemaFragment | undefined;
    Object.defineProperty(validator, JSON_SCHEMA, {
        get: (): JSONSchemaFragment => (fragment ??= build()),
        enumerable: false,
        configurable: true,
    });
    return validator;
};
