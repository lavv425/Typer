# Async validation

For the checks that have to touch something else: an email that must be
unique, a token that must still be valid.

```typescript
import { parseAsync, asyncRefine } from '@illavv/run_typer/async';
import { isEmail } from '@illavv/run_typer/validators';

const userSchema = {
    email: asyncRefine(
        isEmail,
        async (email) => !(await db.users.exists({ email })),
        'email already registered',
    ),
};

const user = await parseAsync(userSchema, payload);
```

`safeParseAsync` is the non-throwing counterpart.

It is a separate entry point on purpose: most schemas are synchronous, and a
feature should cost only the consumers who use it. Putting this in `core` took
that bundle from 3.35 KB to 3.94 KB.

## Async is declared, not detected

An ordinary function returning a promise is indistinguishable from an `async`
one, and `constructor.name` lies as soon as anything is transpiled. So an async
check is **wrapped**, which marks it — the schema compiler needs no knowledge of
async at all.

The base validator runs first and synchronously, so the async predicate only
ever sees a well-typed value: there is no point asking a database whether an
email is taken before knowing it is an email.

## The synchronous path refuses, loudly

Passing an async schema to `parse` does not half-validate it:

```typescript
parse({ email: uniqueEmail }, payload);
// throws — Validation failed at "email": This slot requires parseAsync: …
```

The offending key is named. A check that quietly does not run is worse than one
that fails.

## Checks run concurrently

Independent I/O is started together and collected with `Promise.all` — a
five-field form costs one round trip, not five.

Async slots work at any depth: nested objects, and elements inside arrays.
Everything else in the schema is validated by the ordinary compiled checker, so
you keep strict mode, bounds, registries and the same issue codes.

```typescript
await safeParseAsync({ rows: [{ token: checkToken }] }, payload);
// issues have paths like rows[1].token
```

Resolved values are written back, following the same rule as a synchronous
slot.

## Should you use it?

Often not. Uniqueness and liveness checks usually belong in a service layer,
where they sit next to the transaction that depends on them — validating that
an email is free and then inserting it are two steps that want to be one. This
exists for when that genuinely does not apply.
