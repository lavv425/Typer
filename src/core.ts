/**
 * The schema-validation core, without the class.
 *
 * Importing from here gets the compiler, the built-in alias predicates and the
 * entry points that use them — and nothing else. No format validators, no
 * combinators, no JSON Schema converter, no legacy surface, because none of it
 * is reachable from these exports and a bundler can prove it.
 *
 * @example
 * import { parse, safeParse, schema } from '@illavv/run_typer/core';
 *
 * const userSchema = schema({ id: 'number', email: 'string', note: 'string?' });
 * const user = parse(userSchema, payload);
 */

export { parse, safeParse, schema, createTyper } from './Core/Parse';
export { createRegistry } from './Core/Registry';

export type { BoundTyper, InferWith, ParseOptions } from './Core/Parse';
export type { Registry, RegistryOf, TypesOf } from './Core/Registry';

export { TyperError } from './Errors/TyperError';

export type {
    Infer,
    IssueCode,
    IssueMeta,
    KnownAlias,
    ParseResult,
    ResolveSchemaValue,
    ResolveTypeString,
    Schema,
    SchemaArrayElement,
    TypeKey,
    TypeMap,
    TypeRegistry,
    UnknownAlias,
    ValidateSchema,
    ValidationIssue,
    Validator,
} from './Types/Typer';
