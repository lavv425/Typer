# JSON Schema

`toJSONSchema()` turns a schema into the document OpenAPI and Swagger tooling
expects.

```typescript
import { Typer } from '@illavv/run_typer';
const typer = new Typer();

typer.toJSONSchema({ id: 'number', email: isEmail, note: 'string?' });
// {
//   $schema: 'https://json-schema.org/draft/2020-12/schema',
//   type: 'object',
//   properties: {
//     id:    { type: 'number' },
//     email: { type: 'string', format: 'email' },
//     note:  { type: ['string', 'null'] },
//   },
//   required: ['id', 'email'],
//   additionalProperties: false,
// }
```

`additionalProperties: false` because validation is strict by default — the
emitted schema has to say what validation actually does. `{ strict: false }`
drops it.

## What converts exactly

Type strings, `?` markers, `|` unions, arrays, nested objects, and inline
bounds. The bound's keyword follows what is being measured, since JSON Schema
names the same constraint three ways:

| Schema | Emitted |
| --- | --- |
| `'string(3,50)'` | `{ type: 'string', minLength: 3, maxLength: 50 }` |
| `'array(1,10)'` | `{ type: 'array', minItems: 1, maxItems: 10 }` |
| `'number(1000,9999)'` | `{ type: 'number', minimum: 1000, maximum: 9999 }` |
| `'date'` | `{ type: 'string', format: 'date-time' }` |

## Validators describe themselves

A validator is an opaque function, so Typer's own carry the fragment they
correspond to:

| Slot | Emitted |
| --- | --- |
| `isEmail` | `{ type: 'string', format: 'email' }` |
| `isPort` | `{ type: 'integer', minimum: 1, maximum: 65535 }` |
| `literal('a', 'b')` | `{ enum: ['a', 'b'] }` |
| `arrayOf(v, { min: 1 })` | `{ type: 'array', items: …, minItems: 1 }` |
| `tuple([a, b])` | `{ type: 'array', prefixItems: […], minItems: 2, maxItems: 2 }` |
| `record(v)` | `{ type: 'object', additionalProperties: … }` |
| `optional(v)` | the inner fragment, key dropped from `required` |
| `withDefault(v, 10)` | the inner fragment plus `default: 10` |
| `discriminatedUnion(k, …)` | `{ oneOf: […], discriminator: { propertyName: k } }` |

These fragments are built on first read, not at construction — most callers
never ask for a JSON Schema, and setup cost is the benchmark Typer wins.

## What does not convert

A validator **you** wrote becomes `{}` — "anything" — as do the aliases JSON
cannot carry (`symbol`, `function`, `map`, `set`, `regexp`, the buffer types)
and anything registered at runtime.

That is the honest answer, but a silent one. In a build step, ask to be told:

```typescript
typer.toJSONSchema(schema, { unrepresentable: 'throw' });
// TyperError: Cannot convert to JSON Schema: 1 slot(s) have no equivalent — session
```

## Options

| | |
| --- | --- |
| `$schema` | dialect, or `false` to omit it when embedding in a larger document |
| `id`, `title`, `description` | document metadata |
| `strict` | emit `additionalProperties: false` |
| `unrepresentable` | `'any'` (default) or `'throw'` |
