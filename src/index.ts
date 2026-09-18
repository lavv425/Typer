import { Typer } from './Typer';

/**
 * A ready-to-use shared instance, for callers that do not need their own
 * type registry.
 */
export default new Typer();

// Re-exported so `src/index.ts` and the rolled-up bundle (which is built from
// `src/Typer.ts`) expose the same named surface.
export { Typer, TyperError } from './Typer';
export type { BoundValidators, Infer, IssueCode, KnownAlias, ParseResult, ResolveSchemaValue, ResolveTypeString, Schema, SchemaArrayElement, StructureValidationReturn, TypeKey, TypeMap, TypeRegistry, TyperExpectTypes, TyperReturn, UnknownAlias, ValidateSchema, ValidationIssue, Validator } from './Typer';