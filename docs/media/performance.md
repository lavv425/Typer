# Performance

Validation libraries are usually sold on speed. Typer's honest position is
narrower, and worth stating plainly — a library that says where it loses is
easier to trust on where it wins.

## Against the alternatives

From the 4.0.0 audit, against `zod` 4.6.5 and `@sinclair/typebox` 0.34.52 on
Node 26 / darwin arm64, each library measured in its own equivalent-work lane:

| Scenario | Typer | Zod | TypeBox JIT | |
| --- | ---: | ---: | ---: | --- |
| Schema setup | **1.13 µs** | 5.74 µs | 3.43 µs | 🥇 |
| Flat object, valid | 90 ns | 68 ns | 3.3 ns | 🥉 |
| Nested object, 25 items | 1.74 µs | 807 ns | 191 ns | 🥉 |
| Flat object, invalid | 404 ns | 354 ns | 1.05 µs | 🥈 |
| Deep nested, invalid | 2.07 µs | 1.27 µs | 15.19 µs | 🥈 |

**On the hot path Typer is slower than Zod, and about nine times slower than a
compiled TypeBox.** That is not a problem in itself — 90 ns is far below the
point where validation is visible inside an HTTP handler — but it is not the
reason to choose Typer either.

What it does win: **instant setup**, a **small bundle**, and **schemas that read
like the shape they describe**.

## Size

Measured by `npm run size`, which CI enforces:

| Entry point | gzip |
| --- | ---: |
| `optional` + `arrayOf` only | **0.88 KB** |
| `core` | 3.35 KB |
| `core` + `isEmail` + 3 combinators | 4.34 KB |
| all 44 validators, no class | 3.70 KB |
| every combinator, no class | 6.25 KB |
| `async` | 3.65 KB |
| the `Typer` class | 10.07 KB |
| *(reference)* `zod/mini` | 4.8 KB |

The 0.88 KB row is the one that matters: the schema compiler genuinely drops
out when nothing needs it.

## Hoist your schemas

Compiled checkers are cached by schema **object identity**. A literal written
inside a handler is a new object on every call, so it is recompiled every
time — about an order of magnitude slower, and silent, because the code looks
perfectly ordinary:

```typescript
const userSchema = schema({ id: 'number' });          // compiled once
app.post('/u', (req) => parse(userSchema, req.body)); // 78 ns

app.post('/u', (req) => parse({ id: 'number' }, req.body)); // 873 ns
```

It is a cost, not a leak — the cache is a `WeakMap`, so the throwaway schema is
collected normally.

## How it is fast where it is

Schemas compile to closures once: every type name, optional marker and union
alternative is resolved at compile time, so validating is a flat loop over
predicates. Error paths are only built when something actually fails, and a
failed `safeParse` never constructs an `Error` unless you read `.error`.

## Run it yourself

```bash
npm run bench
```

Absolute numbers are machine-dependent; the ratios are what to read.
