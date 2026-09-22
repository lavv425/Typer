import type { JSONSchemaFragment } from "../../Types/JSONSchema";
import type { ParseResult } from "../../Types/Typer";

/**
 * Internal markers Typer attaches to the validators it builds.
 *
 * `Symbol.for`, not `Symbol()`: each published entry point is a self-contained
 * bundle with its own copy of this module, so a plain symbol would be a
 * different value in each and a marker set by `/validators` would be invisible
 * to `/core`.
 */

/**
 * A validator that can report failures without throwing carries its
 * non-throwing counterpart here, so `safeParse` can skip building an `Error`
 * only to unwrap it again.
 *
 * @internal
 */
export const SAFE_RESULT = Symbol.for('typer.safeResult');

/** @internal */
export type SafeReporting<T> = { [SAFE_RESULT]?: (value: unknown) => ParseResult<T> };

/**
 * A validator that knows its JSON Schema equivalent carries it here — a
 * validator is otherwise an opaque function that `toJSONSchema` can only
 * describe as `{}`.
 *
 * @internal
 */
export const JSON_SCHEMA = Symbol.for('typer.jsonSchema');

/** @internal */
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
 * Same as {@link describing}, but the fragment is built on first read and
 * memoized. Building `objectOf`'s eagerly cost 42% of its setup time, and most
 * callers never ask for a JSON Schema.
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
