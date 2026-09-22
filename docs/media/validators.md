# Validators

Every validator is an ordinary function: it returns the value on success and
throws a `TyperError` carrying a coded issue on failure. That is exactly what a
schema slot accepts, so they drop straight in.

```typescript
import { parse } from '@illavv/run_typer/core';
import { isEmail, isPort } from '@illavv/run_typer/validators';

parse({ email: isEmail, port: isPort }, payload);
```

Importing one costs about 61 bytes on top of `core` — four of them come to
328 bytes. Import what you use.

## Formats

All produce `invalid_format` on failure, with `expected` naming the format.

| | |
| --- | --- |
| `isEmail` | RFC-shaped email address |
| `isURL` | parseable by `new URL()` |
| `isUUID` | UUID versions 1–5 |
| `isIPv4` / `isIPv6` / `isIP` | IP addresses |
| `isSemver` | Semantic Versioning 2.0.0, pre-release and build metadata included |
| `isSlug` | lowercase alphanumeric groups separated by single hyphens |
| `isJWT` | three base64url segments — **shape only, not a signature check** |
| `isMACAddress` | colon- or hyphen-separated |
| `isHexColor` | `#RGB`, `#RGBA`, `#RRGGBB`, `#RRGGBBAA` |
| `isISODate` | ISO 8601 string, returns a parsed `Date` |
| `isBase64` | standard or URL-safe; `{ urlSafe, requirePadding }` |
| `isPhoneNumber` | ITU-T E.164, 7–15 digits |
| `matches(regex, value)` | any pattern you supply |

The bundled patterns are anchored and tested against adversarial input up to
50,000 characters with linear time — no ReDoS.

## Numbers

Produce `too_small` / `too_big` with `minimum` / `maximum`, or
`invalid_format` for the shape checks.

| | |
| --- | --- |
| `isInteger`, `isSafeInteger`, `isFiniteNumber` | numeric shape |
| `isPositiveNumber`, `isPositiveInteger` | `>= 0` |
| `isNegativeNumber`, `isNegativeInteger` | `< 0` |
| `isPort` | integer in 1–65535 |
| `isInRange(min, max, value)` | inclusive range |

## Sizes and membership

| | |
| --- | --- |
| `isLength({ min, max }, value)` | length of a string or array |
| `isNonEmptyString`, `isNonEmptyArray` | at least one |
| `isEmpty`, `isNonEmpty` | strings, arrays, `Map`, `Set`, plain objects |
| `isOneOf(values, value)` | membership in a list |

## Guards and assertions

`is*` guards return a boolean and narrow the type. `as*` assert and return.

```typescript
if (isString(value)) value.toUpperCase();   // narrowed
const name = asString(value);               // or throws
```

`isString`, `isNumber`, `isBoolean`, `isArray`, `isObject`, `isPlainObject`,
`isPromise`, `isInstanceOf(ctor, value)` — and `asString`, `asNumber`,
`asBoolean`, `asArray`, `asObject`.

`isType(alias, value)` asserts against a built-in alias by name, and accepts an
array of them.

> `isObject` mirrors the `'object'` alias, including the long-standing quirk
> that `null` passes — `typeof null === 'object'`. Use `isPlainObject` when you
> need `null` and class instances rejected.

## Coercion

Query strings, form data and environment variables arrive as strings. These
convert before validating, and **reject what they cannot convert** rather than
inventing a value:

```typescript
import { Typer } from '@illavv/run_typer';
const typer = new Typer();

const query = typer.parse({
    page:     typer.coerce.number,
    archived: typer.coerce.boolean,
    since:    typer.coerce.date,
}, req.query);
// { page: 2, archived: false, since: Date }
```

The two classic traps are handled rather than inherited:

| Input | `Number()` / `Boolean()` | `coerce.*` |
| --- | --- | --- |
| `''` | `0` | rejected |
| `'   '` | `0` | rejected |
| `null` | `0` | rejected |
| `[]` | `0` | rejected |
| `'abc'` | `NaN` | rejected |
| `'false'` | `true` | `false` |
| `'0'` | `true` | `false` |

`coerce.boolean` reads `true`/`1`/`yes`/`on` and `false`/`0`/`no`/`off`, in any
case and with surrounding whitespace; anything else is rejected rather than
guessed at. A bigint outside the safe-integer range is refused instead of
silently losing digits, and `coerce.date` rejects the `Invalid Date` that the
`Date` constructor would otherwise hand back.

In a schema slot the converted value **replaces** the original, so what comes
out of `parse` holds numbers and dates rather than the strings that arrived.

> Coercion currently lives on the class. If you are using the free entry
> points, reach for it with a small instance — `new Typer().coerce.number` — or
> write the conversion as a plain validator.
