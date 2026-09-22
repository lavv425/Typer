# Standard Schema

[Standard Schema](https://standardschema.dev) is the common contract that lets
a validation library be accepted by tRPC, Hono, TanStack Form and Router, Nuxt
and dozens of others **without a per-library adapter**.

```typescript
import { standard } from '@illavv/run_typer/combinators';

const userSchema = standard({ id: 'number', email: 'string' });

app.post('/users', validator('json', userSchema), handler);    // Hono
publicProcedure.input(userSchema).mutation(({ input }) => …);   // tRPC
```

`objectOf()` carries the contract too, so an existing `objectOf(...)` already
works.

## Why a wrapper

A Typer schema is an inert object literal that you own, and Typer does not
mutate it to attach anything. `standard()` returns a validator that carries the
`~standard` property — and it is still an ordinary `Validator`, so it keeps
working everywhere one does:

```typescript
userSchema({ id: 1, email: 'a@b.co' });   // returns the value, throws on failure
arrayOf(userSchema);                       // composes like anything else
```

It accepts a schema, a validator, or a type alias.

## Issues

Paths follow the spec's segment form, while Typer's machine-readable `code`
rides along:

```typescript
userSchema['~standard'].validate({ id: 'one', email: 'a@b.co' });
// {
//   issues: [{
//     code: 'invalid_type',
//     path: ['id'],                          // segments, not 'id'
//     message: 'Expected "id" to be number, got string',
//     expected: 'number',
//     received: 'string',
//   }]
// }
```

`value` — the field that carries an offending value for numeric bounds — is
deliberately **not** forwarded here. This is the boundary where an issue is
handed to a framework that may log or serialize it whole.

Validation is synchronous: `validate` never returns a Promise.

## Vendor

`STANDARD_VENDOR` is `'typer'`, exported for consumers that attribute issues by
vendor. The specification interface is vendored as `StandardSchemaV1` rather
than taken as a dependency, which keeps the install footprint at `tslib` alone.
