/**
 * A JSON Schema fragment — the object describing one slot.
 *
 * Deliberately loose: JSON Schema is open-ended by design, and pinning it to a
 * closed type would mean re-typing the specification to gain nothing here.
 */
export type JSONSchemaFragment = Record<string, unknown>;

/** A complete JSON Schema document, as produced by `toJSONSchema`. */
export type JSONSchemaDocument = JSONSchemaFragment;

/** How `toJSONSchema` should treat a slot it cannot express. */
export type UnrepresentablePolicy =
    /** Emit `{}`, which accepts anything, and carry on. The default. */
    | 'any'
    /** Throw, listing every offending path. Use in a build step. */
    | 'throw';

/** Options accepted by `toJSONSchema`. */
export type ToJSONSchemaOptions = {
    /**
     * The `$schema` dialect to declare. Defaults to draft 2020-12; pass
     * `false` to omit the keyword entirely, which is what you want when the
     * result is embedded in a larger document such as an OpenAPI spec.
     */
    $schema?: string | false;
    /** Value for the document's `$id`. */
    id?: string;
    /** Value for the document's `title`. */
    title?: string;
    /** Value for the document's `description`. */
    description?: string;
    /** Emit `additionalProperties: false`, mirroring Typer's strict mode. */
    strict?: boolean;
    /** What to do with a slot that has no JSON Schema equivalent. Defaults to `'any'`. */
    unrepresentable?: UnrepresentablePolicy;
};
