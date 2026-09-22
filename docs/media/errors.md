# Errors

Every failure is structured. Branch on `code` and `path`; treat `message` as
prose for humans, not as an API.

```typescript
const result = safeParse({ id: 'number', addr: { city: 'string' } },
                         { id: 'nope', addr: {} });

result.issues;
// [
//   { code: 'invalid_type', path: 'id',        expected: 'number', received: 'string', message: '…' },
//   { code: 'missing_key',  path: 'addr.city', expected: 'string', received: 'undefined', message: '…' },
// ]
```

Validation collects every problem rather than stopping at the first.

## Issue codes

| Code | Means | Extra fields |
| --- | --- | --- |
| `invalid_type` | present, but not one of the expected types | `expected`, `received` |
| `missing_key` | a required key was absent | `expected` |
| `unknown_type` | the schema named an alias that is not registered | `expected` |
| `invalid_schema` | the schema itself is malformed | `expected`, `received` |
| `unexpected_key` | a key the schema does not declare | |
| `too_small` | below a lower bound — too short, too few, too small | `minimum` |
| `too_big` | above an upper bound | `maximum` |
| `invalid_format` | right type, wrong shape: not an email, not a UUID | `expected` |
| `dangerous_key` | an unsafe key could not be stripped (frozen object) | |
| `custom` | a validator threw without reporting a reason | |

## Paths

Dotted for keys, bracketed for indices: `address.city`, `tags[2]`,
`items[0].qty`. An empty path means the failure is about the root value.

## Constraint failures carry their reason

A validator's own code survives into the schema, so "too short" is
distinguishable from "out of range" without parsing prose:

```typescript
safeParse({
    name: (v) => isLength({ min: 3, max: 50 }, v),
    pin:  (v) => isInRange(1000, 9999, v),
}, { name: 'ab', pin: 42 }).issues;

// [{ code: 'too_small', path: 'name', minimum: 3 },
//  { code: 'too_small', path: 'pin',  minimum: 1000, maximum: 9999 }]
```

## Throwing, and the lazy error

`parse` throws a `TyperError`, which extends `TypeError`, so existing
`instanceof TypeError` handling keeps working:

```typescript
import { TyperError } from '@illavv/run_typer/core';

try {
    parse(userSchema, payload);
} catch (e) {
    if (e instanceof TyperError) {
        e.issues;    // the structured list
        e.flatten(); // { 'address.city': ['Expected "address.city" to be string, got number'] }
    }
}
```

`safeParse` returns `{ success: false, issues, error }`. **Prefer `issues`.**
`error` is built on first access — constructing an `Error` captures a stack
trace, which costs more than the validation that produced it.

## Sensitive values stay out of messages

Type errors never include the value they rejected, and neither do numeric
bounds: a range check is exactly what guards a PIN, a one-time code or an
amount, and messages end up in logs.

```typescript
isInRange(1000, 9999, 4242);
// message: 'value must be between 1000 and 9999'   — not the 4242
```

The value is on the issue's `value` field instead, for callers that want to
show it. It is deliberately left out of the
[Standard Schema](standard-schema.md) output, which is the boundary where an
issue is handed to a framework that may log it whole.
