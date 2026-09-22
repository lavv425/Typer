import type { JSONSchemaDocument, JSONSchemaFragment, ToJSONSchemaOptions } from "@/Types/JSONSchema";
import type { SlotBound } from "@/Types/Typer";
import { splitBound } from "@/Core/Compile";
import type { SelfDescribing } from "@/Constants/Symbols";
import { JSON_SCHEMA } from "@/Constants/Symbols";
import { TyperError } from "@/Errors/TyperError";
import { makeIssue } from "@/Utils/Issues";
import { indexPath, joinPath } from "@/Utils/Path";

/**
 * Conversion from a Typer schema to a JSON Schema document.
 *
 * Kept out of `Typer.ts`: nothing here needs the instance except the set of
 * registered aliases, and that arrives as a plain lookup.
 */

/** The dialect declared when the caller does not ask for another. */
const DEFAULT_DIALECT = 'https://json-schema.org/draft/2020-12/schema';

/**
 * Key `optional()` sets on the fragment it wraps, so the converter can move
 * the key out of `required`. Stripped before the fragment is emitted.
 */
export const OPTIONAL_MARKER = '$typerOptional';

/**
 * Built-in aliases that have a JSON Schema equivalent.
 *
 * The ones that are absent are absent on purpose: `symbol`, `function`,
 * `undefined`, `map`, `set`, `regexp`, `array_buffer`, `data_view`,
 * `typed_array` and `dom` describe runtime values that JSON cannot carry, so
 * there is nothing honest to emit for them.
 *
 * `date` maps to a date-time string because that is what a `Date` becomes the
 * moment it is serialized, which is the only form a JSON Schema ever sees.
 */
const ALIAS_FRAGMENTS: Readonly<Record<string, JSONSchemaFragment>> = {
    string: { type: 'string' }, s: { type: 'string' }, str: { type: 'string' },
    number: { type: 'number' }, n: { type: 'number' }, num: { type: 'number' },
    boolean: { type: 'boolean' }, b: { type: 'boolean' }, bool: { type: 'boolean' },
    bigint: { type: 'integer' }, bi: { type: 'integer' }, bint: { type: 'integer' },
    null: { type: 'null' },
    array: { type: 'array' }, a: { type: 'array' }, arr: { type: 'array' },
    object: { type: 'object' }, o: { type: 'object' }, obj: { type: 'object' },
    date: { type: 'string', format: 'date-time' }, dt: { type: 'string', format: 'date-time' },
    json: { type: 'string', contentMediaType: 'application/json' },
    j: { type: 'string', contentMediaType: 'application/json' },
};

/** Collects the paths of slots that could not be expressed. */
type Conversion = {
    readonly strict: boolean;
    readonly unrepresentable: string[];
};

/**
 * Reads the fragment a Typer validator carries, if it carries one.
 *
 * @param validator - The function in a schema slot.
 */
const fragmentOf = (validator: object): JSONSchemaFragment | undefined => (validator as SelfDescribing)[JSON_SCHEMA];

/**
 * Records a slot that has no JSON Schema equivalent and returns the fragment
 * that accepts anything.
 */
const unrepresentable = (conversion: Conversion, path: string): JSONSchemaFragment => {
    conversion.unrepresentable.push(path === '' ? '(root)' : path);
    return {};
};

/**
 * Merges the alternatives of a `a|b` union.
 *
 * When every alternative is a bare `{ type: … }` the result is the compact
 * `type: ['a', 'b']` form, which is both smaller and what a hand-written
 * schema would say. Anything richer falls back to `anyOf`.
 */
const unionOf = (fragments: JSONSchemaFragment[]): JSONSchemaFragment => {
    if (fragments.length === 1) return fragments[0];

    const simple = fragments.every((f) => Object.keys(f).length === 1 && typeof f.type === 'string');
    if (!simple) return { anyOf: fragments };

    const types = Array.from(new Set(fragments.map((f) => f.type as string)));
    return types.length === 1 ? { type: types[0] } : { type: types };
};

/** Adds `null` to a fragment, for Typer's `?` marker. */
const nullableOf = (fragment: JSONSchemaFragment): JSONSchemaFragment => {
    if (Object.keys(fragment).length === 1 && typeof fragment.type === 'string') {
        return { type: [fragment.type, 'null'] };
    }
    if (Array.isArray(fragment.type)) {
        return { ...fragment, type: Array.from(new Set([...(fragment.type as string[]), 'null'])) };
    }
    return { anyOf: [fragment, { type: 'null' }] };
};

/**
 * Applies an inline bound to the fragment of the alias it was written on.
 *
 * JSON Schema names the same constraint three ways depending on what is being
 * measured, so the keyword follows the type rather than the syntax.
 *
 * @param fragment - The alias's own fragment.
 * @param bound - The bound declared on it.
 */
const withBound = (fragment: JSONSchemaFragment, bound: SlotBound): JSONSchemaFragment => {
    const { min, max } = bound;
    const out: JSONSchemaFragment = { ...fragment };

    const keywords = fragment.type === 'string'
        ? ['minLength', 'maxLength']
        : fragment.type === 'array'
            ? ['minItems', 'maxItems']
            : ['minimum', 'maximum'];

    if (min !== undefined) out[keywords[0]] = min;
    if (max !== undefined) out[keywords[1]] = max;
    return out;
};

/**
 * Converts a type-string slot (`'string'`, `'string?'`, `'a|b'`, `'a|b?'`).
 */
const convertTypeString = (expected: string, conversion: Conversion, path: string): JSONSchemaFragment => {
    const optional = expected.endsWith('?');
    const base = optional ? expected.slice(0, -1) : expected;

    const names = base.split('|').map((name) => name.trim().toLowerCase()).filter((name) => name.length > 0);
    if (names.length === 0) return unrepresentable(conversion, path);

    const fragments: JSONSchemaFragment[] = [];
    for (const name of names) {
        const parsed = splitBound(name);
        if (parsed === null) return unrepresentable(conversion, path);

        const fragment = ALIAS_FRAGMENTS[parsed.name];
        // A runtime-registered alias is a validator function Typer cannot look
        // inside, exactly like a non-serializable built-in.
        if (fragment === undefined) return unrepresentable(conversion, path);
        fragments.push(parsed.bound === null ? fragment : withBound(fragment, parsed.bound));
    }

    const merged = unionOf(fragments);
    return optional ? nullableOf(merged) : merged;
};

/**
 * One converted slot: the fragment, plus whether the key holding it may be
 * absent. JSON Schema records optionality on the *parent* (`required`), so it
 * has to travel back up rather than live in the fragment.
 */
type ConvertedSlot = { readonly fragment: JSONSchemaFragment; readonly optional: boolean };

/** Converts one schema slot, whatever kind it is. */
const convertSlot = (slot: unknown, conversion: Conversion, path: string): ConvertedSlot => {
    if (typeof slot === 'string') {
        return { fragment: convertTypeString(slot, conversion, path), optional: slot.endsWith('?') };
    }

    if (typeof slot === 'function') {
        const described = fragmentOf(slot);
        if (described === undefined) return { fragment: unrepresentable(conversion, path), optional: false };

        // `optional()` marks the fragment it wraps; the marker is bookkeeping
        // between it and this function, never part of the emitted document.
        const { [OPTIONAL_MARKER]: optional, ...fragment } = described;
        return { fragment, optional: optional === true };
    }

    if (Array.isArray(slot)) {
        if (slot.length !== 1) return { fragment: unrepresentable(conversion, path), optional: false };
        const element = convertSlot(slot[0], conversion, indexPath(path, 0));
        return { fragment: { type: 'array', items: element.fragment }, optional: false };
    }

    if (slot !== null && typeof slot === 'object') {
        return { fragment: convertObject(slot as Record<string, unknown>, conversion, path), optional: false };
    }

    return { fragment: unrepresentable(conversion, path), optional: false };
};

/**
 * Converts an object schema into `properties` plus `required`.
 *
 * A key is required unless its type string carries the `?` marker or its
 * validator declared itself optional — the same rule `Infer` applies, so the
 * emitted schema and the inferred type agree on which keys may be absent.
 */
const convertObject = (schema: Record<string, unknown>, conversion: Conversion, path: string): JSONSchemaFragment => {
    const properties: Record<string, JSONSchemaFragment> = {};
    const required: string[] = [];

    for (const key of Object.keys(schema)) {
        const { fragment, optional } = convertSlot(schema[key], conversion, joinPath(path, key));
        properties[key] = fragment;
        if (!optional) required.push(key);
    }

    const out: JSONSchemaFragment = { type: 'object', properties };
    if (required.length > 0) out.required = required;
    if (conversion.strict) out.additionalProperties = false;
    return out;
};

/**
 * Converts a Typer schema into a JSON Schema document.
 *
 * @param schema - The schema to convert.
 * @param options - Dialect, metadata, strictness, and what to do with slots
 *                  that have no JSON Schema equivalent.
 * @throws {TyperError} With `unrepresentable: 'throw'`, when a slot cannot be expressed.
 */
export const toJSONSchema = (schema: Record<string, unknown>, options: ToJSONSchemaOptions = {}): JSONSchemaDocument => {
    // Strict by default, matching validation: an emitted schema that omitted
    // `additionalProperties: false` would describe a laxer contract than the
    // one `parse` actually enforces.
    const conversion: Conversion = { strict: options.strict !== false, unrepresentable: [] };
    const body = convertObject(schema, conversion, '');

    if (conversion.unrepresentable.length > 0 && options.unrepresentable === 'throw') {
        const issues = conversion.unrepresentable.map((path) => makeIssue(
            'invalid_schema',
            path === '(root)' ? '' : path,
            `No JSON Schema equivalent for the slot at "${path}"`,
        ));
        throw new TyperError(
            `Cannot convert to JSON Schema: ${conversion.unrepresentable.length} slot(s) have no equivalent — ${conversion.unrepresentable.join(', ')}`,
            issues,
        );
    }

    const head: JSONSchemaFragment = {};
    if (options.$schema !== false) head.$schema = options.$schema ?? DEFAULT_DIALECT;
    if (options.id !== undefined) head.$id = options.id;
    if (options.title !== undefined) head.title = options.title;
    if (options.description !== undefined) head.description = options.description;

    return { ...head, ...body };
};
