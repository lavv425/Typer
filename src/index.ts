import { Typer } from './Typer';

/**
 * A ready-to-use shared instance, for callers that do not need their own
 * type registry.
 */
export default new Typer();

// Re-exported so `src/index.ts` and the rolled-up bundle (which is built from
// `src/Typer.ts`) expose the same named surface.
export { Typer, TyperError, STANDARD_VENDOR } from './Typer';
export type { StandardSchemaV1 } from './Typer';
export type { BoundValidators, Coercions, DiscriminatedUnion, Infer, IssueMeta, IssueCode, KnownAlias, MergeSchema, OmitSchema, OptionalSlot, ParseResult, PartialSchema, PickSchema, ResolveSchemaValue, ResolveTypeString, Schema, SchemaArrayElement, StandardValidator, StructureValidationReturn, TypeKey, TypeMap, TypeRegistry, TyperExpectTypes, TyperReturn, UnknownAlias, ValidateSchema, ValidationIssue, Validator } from './Typer';