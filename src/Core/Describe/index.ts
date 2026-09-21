import type { JSONSchemaFragment } from "../../Types/JSONSchema";
import type { SelfDescribing } from "../../Constants/Symbols";
import { JSON_SCHEMA } from "../../Constants/Symbols";

/**
 * Helpers shared by the combinators for reading and widening the JSON Schema
 * fragment a validator carries.
 *
 * Extracted from the class so a combinator can describe itself without one.
 */

/**
 * Own-property test that does not go through the object being tested, so a
 * schema carrying a `hasOwnProperty` key of its own cannot shadow it.
 */
export const hasOwnKey = (target: object, key: string): boolean => Object.prototype.hasOwnProperty.call(target, key);

/**
 * The JSON Schema fragment a validator carries, or the permissive `{}` when it
 * carries none.
 *
 * A validator is an opaque function: unless Typer built it, there is nothing
 * to read, and `{}` — "anything" — is the only honest answer. `toJSONSchema`
 * reports those slots separately, so the gap is visible rather than silent.
 */
export const describedFragment = (validator: unknown): JSONSchemaFragment => {
    if (typeof validator !== 'function' && (validator === null || typeof validator !== 'object')) return {};
    return (validator as SelfDescribing)[JSON_SCHEMA] ?? {};
};

/** Widens a fragment to also accept `null`. */
export const nullableFragment = (fragment: JSONSchemaFragment): JSONSchemaFragment => {
    if (Object.keys(fragment).length === 0) return {};
    if (typeof fragment.type === 'string') return { ...fragment, type: [fragment.type, 'null'] };
    if (Array.isArray(fragment.type)) return { ...fragment, type: Array.from(new Set([...(fragment.type as string[]), 'null'])) };
    return { anyOf: [fragment, { type: 'null' }] };
};
