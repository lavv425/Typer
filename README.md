# Typer

![Coverage](https://img.shields.io/badge/coverage-97%25%20lines-brightgreen)
![Build](https://img.shields.io/badge/build-passing-success)
![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Version](https://img.shields.io/badge/version-5.0.0-blue)

A TypeScript validation library where the schema *is* the type.

```typescript
import { parse } from '@illavv/run_typer/core';

const user = parse({ id: 'number', email: 'string', note: 'string?' }, payload);
//    ^? { id: number; email: string; note?: string | null }
```

No builder chains. A schema is a plain object, the type comes out of it, and a
typo like `'nubmer'` is a **compile error** rather than a runtime surprise.

---

## Install

```bash
npm install @illavv/run_typer
```

Node 20+. One dependency (`tslib`).

## Why

Three things Typer is good at, and one it is not.

**The schema reads like the shape it describes.** `{ id: 'number', tags: ['string'] }`
is the whole declaration, and `Infer<typeof schema>` gives you the type.

**It is small, and you pay for what you use.** Schema validation is 3.35 KB
gzip; adding a format check costs about 61 bytes. Import four functions, ship
four functions.

**Setup is instant.** Building a schema costs ~1.1 µs — the lowest of the three
libraries measured, against 5.74 µs for Zod and 3.43 µs for TypeBox.

**It is not the fastest validator.** On the hot path it is slower than Zod and
roughly nine times slower than a compiled TypeBox. At ~90 ns per object that
sits far below the point where validation is visible inside an HTTP handler —
but if raw throughput is your constraint, TypeBox is the honest answer. The
numbers, and the context that makes them readable, are in
[the performance guide](guides/performance.md).

## Quick start

```typescript
import { parse, safeParse, schema } from '@illavv/run_typer/core';
import { isEmail } from '@illavv/run_typer/validators';
import type { Infer } from '@illavv/run_typer/core';

// Declare once, outside the handler: schemas are cached by object identity.
const userSchema = schema({
    id:    'number',
    email: isEmail,
    name:  'string(2,50)',   // 2 to 50 characters
    note:  'string?',        // may be absent, or null
    tags:  ['string'],
});

type User = Infer<typeof userSchema>;
// { id: number; email: string; name: string; tags: string[]; note?: string | null }

// Throws a TyperError listing every problem found:
const user = parse(userSchema, payload);

// Or branch on the result instead:
const result = safeParse(userSchema, payload);
if (!result.success) {
    result.issues; // [{ code: 'too_small', path: 'name', minimum: 2, ... }]
}
```

Keys the schema does not declare are **rejected by default**. Pass
`{ strict: false }` to accept them.

## What to import

Four entry points, each independent. The `Typer` class is still there, still
works, and is still the easiest way in if you would rather not think about it.

| Import from | For | gzip |
| --- | --- | ---: |
| `@illavv/run_typer/core` | `parse`, `safeParse`, `schema`, registries | **3.35 KB** |
| `@illavv/run_typer/validators` | `isEmail`, `isPort`, `isUUID`, … (44 of them) | 3.93 KB |
| `@illavv/run_typer/combinators` | `arrayOf`, `objectOf`, `optional`, … | 6.24 KB |
| `@illavv/run_typer/async` | `parseAsync`, `asyncRefine` | 3.65 KB |
| `@illavv/run_typer/jit` | `compile` — generated validators, ~4× faster | 4.76 KB |
| `@illavv/run_typer` | the `Typer` class — everything, on one object | 10.46 KB |

Those are whole-entry-point figures; what you ship is what you import.
`optional` + `arrayOf` on their own come to **0.88 KB**, and a realistic
application — schemas plus a handful of format checks — lands under **4 KB**.
For reference, `zod/mini` is 4.8 KB.

```typescript
import { parse } from '@illavv/run_typer/core';
import { isEmail } from '@illavv/run_typer/validators';
import { arrayOf, objectOf } from '@illavv/run_typer/combinators';

parse({ contacts: arrayOf(objectOf({ email: isEmail })) }, payload);
```

## Guides

| | |
| --- | --- |
| [Schemas](guides/schemas.md) | Type strings, optionality, unions, bounds, nesting, composition |
| [Validators](guides/validators.md) | Formats, numbers, sizes, guards, coercion |
| [Combinators](guides/combinators.md) | `arrayOf`, `objectOf`, unions, `transform`, custom aliases |
| [Errors](guides/errors.md) | Issue codes, paths, and what to branch on |
| [Standard Schema](guides/standard-schema.md) | tRPC, Hono, TanStack, Nuxt — with no adapter |
| [JSON Schema](guides/json-schema.md) | OpenAPI and Swagger output |
| [Async validation](guides/async.md) | Checks that have to touch a database |
| [The Typer class](guides/class.md) | The instance API, and when you still want it |
| [Generated validators](guides/jit.md) | `compile`, for when 4x matters more than `unsafe-eval` |
| [Performance](guides/performance.md) | Where Typer wins, where it does not, and why |

The generated API reference lives in `docs/` after `npm run docs`, and covers all five entry points.

## Upgrading from 4.x

Two things changed:
[undeclared keys are now rejected](MIGRATION.md#1-undeclared-keys-are-now-rejected)
and [`expect`, `validate` and `assert` were removed](MIGRATION.md#2-expect-validate-and-assert-were-removed).
Everything else is additive — the free entry points are new ways in, not
replacements. Full guide in
[MIGRATION.md](MIGRATION.md#migration-guide-v4x--v50).

## Contributing

See [CONTRIBUTING.md](.github/CONTRIBUTING.md). Participation is governed by our
[Code of Conduct](.github/CODE_OF_CONDUCT.md).

| | |
| --- | --- |
| `npm test` | unit suite + type-level suite |
| `npm run lint` | ESLint, type-aware |
| `npm run size` | bundle budgets, enforced by CI |
| `npm run test:dist` | builds, then checks the published bundles against each other |

Source imports use the `@/` alias for the `src` root — `@/Core/Compile`, not
`../../Core/Compile`. The build rewrites those back to relative paths in the
emitted declarations, because a published `.d.ts` carrying `@/…` is not
resolvable by a consumer; `npm run build` fails if any survive.

## License

MIT © [Michael Lavigna](https://michaellavigna.com)
