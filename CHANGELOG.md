# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] — 5.0

The whole of [ROADMAP-5.0.md](./ROADMAP-5.0.md). Two breaking changes, and a
library you can now import in pieces.

See [MIGRATION.md](./MIGRATION.md#migration-guide-v4x--v50) for the upgrade.

### 💥 Breaking

- **Undeclared keys are rejected.** `parse`, `safeParse`, `objectOf`,
  `standard`, `discriminatedUnion` and `checkStructure` now reject a key the
  schema does not declare. Pass `{ strict: false }` — or `false` as
  `checkStructure`'s fourth argument — to restore 4.x behaviour.

  This is the audit's P0-2 option (a), deferred from 4.1 because it breaks. 4.1
  shipped option (b) and stripped `__proto__`, `constructor` and `prototype`;
  this closes the rest, so `success: true` now means the object has the keys
  the schema declares and no others. Dangerous keys are still *stripped* rather
  than reported, so a payload carrying only those stays valid.

- **`expect`, `validate` and `assert` are removed**, with the
  `TyperExpectTypes` type. They predated `parse`/`safeParse` and duplicated
  them with weaker typing: `validate` returned untyped strings, `assert` only
  logged a warning, and `expect` type-checked function arguments at runtime
  with no compile-time counterpart. `checkStructure` stays — it is the
  documented escape hatch for schemas built at runtime.

### ✨ Added

- **`@illavv/run_typer/core` — schema validation without the class.**

  ```typescript
  import { parse, safeParse, schema } from '@illavv/run_typer/core';

  const userSchema = schema({ id: 'number', email: 'string', note: 'string?' });
  const user = parse(userSchema, payload);
  ```

  **2.86 KB gzip, against 9.67 KB for the class — 70% smaller**, and under
  `zod/mini` (4.8 KB). The whole API hung off a class instance, so a consumer
  validating one flat schema still shipped every format validator, every
  combinator and the JSON Schema converter; a bundler could not prove otherwise.
  Now it can.

  `parse`, `safeParse` and `schema` behave exactly as their methods do — a
  table test runs nine shapes through both and requires identical issues, down
  to paths and codes.

- **`@illavv/run_typer/validators` — the validators, one import at a time.**

  ```typescript
  import { parse } from '@illavv/run_typer/core';
  import { isEmail, isPort } from '@illavv/run_typer/validators';

  parse({ email: isEmail, port: isPort }, payload);
  ```

  A validator costs **~61 B on top of `core`** — it carries the JSON Schema
  fragment that makes it self-describing. All 44 together, without the class,
  are 3.93 KB.

  43 of them moved; `isArrayOf` stays on the class because it resolves its
  element type through the instance registry. Every one is asserted against the
  class method it came from — same result, same message, byte for byte.

- **`@illavv/run_typer/combinators` and `/async`.** The combinators are
  importable one at a time — `optional` + `arrayOf` alone is **0.88 KB**, which
  is the proof the schema compiler drops out when nothing needs it. Async
  validation lives at `/async` rather than in `core`, because putting it in
  `core` took that bundle from 3.35 to 3.94 KB, and a feature every consumer
  pays for is the problem this release exists to fix.

- **Declarative bounds in type strings**: `'string(3,50)'`, `'number(1,)'`,
  `'array(,10)'` — length for a string or array, value for a number. The other
  half of the audit's P1-1, now that 4.1 has given constraint failures their
  own codes: a bound reports `too_small`/`too_big` with `minimum`/`maximum`,
  not a flat `custom`.

  The bound belongs to the alternative it is written on, so `'string(3,)|number'`
  constrains only the string branch. A malformed bound is reported rather than
  ignored. `toJSONSchema` emits them as `minLength`/`maxLength`,
  `minItems`/`maxItems` or `minimum`/`maximum`, the keyword following what is
  being measured.

- **`parseAsync`, `safeParseAsync` and `asyncRefine`.** Async is declared, not
  sniffed — an ordinary function returning a promise is indistinguishable from
  an `async` one. The awaited checks start together rather than in turn, and
  the synchronous path refuses an async schema by naming the offending key
  instead of validating the rest and reporting success.

- **`createRegistry(aliases)` and `createTyper(aliases)`** for custom type
  aliases without an instance. A registry is an ordinary value carrying its own
  compile context, so invalidation is building a new one; `createTyper` binds
  the entry points so the registry is supplied once rather than on every call,
  and still tree-shakes because a consumer destructures only what they use.

  `InferWith<typeof schema, typeof registry>` reads the alias map off the
  registry value, instead of having it written out by hand.

- **The size budget covers both entry points**, so the 2.86 KB is held by CI
  rather than asserted in a changelog.

### 🔧 Changed

- **The class bundle grew ~170 B**, from the 43 methods that now delegate to
  `Validators/*`. That is overhead a consumer of the class pays for a split
  they do not use — the honest price of keeping the instance API working
  unchanged while the implementations move out. The size budget is raised with
  that reason recorded.

- **The schema compiler and the built-in predicates no longer live in the
  class.** They moved to `Core/Compile` and `Core/Predicates` with their logic
  untouched — every message is byte for byte what it was. What the compiler
  used to take from the instance now arrives as an explicit context.

  `src/Typer.ts` is down from 3,426 to 2,893 lines. The class is unchanged for
  callers.

### 🐛 Fixed

- **Markers did not survive between entry points.** Each published bundle is
  self-contained, so each carried its own `Symbol('typer.jsonSchema')` — and a
  fragment attached by `@illavv/run_typer/validators` was invisible to
  `@illavv/run_typer/core`. `import { isEmail } from '…/validators'` emitted
  `{}` from `toJSONSchema` in any real consumer, and `safeParse` missed a
  combinator's non-throwing path, which is precisely the mixed-import usage the
  documentation recommends.

  The three internal markers now use `Symbol.for`, so the key is the same
  whichever bundle created it. Every source test passed throughout — they
  import `src`, where the entry points share one module instance — so
  `tests/built-bundles.test.ts` now runs against `dist`, and `prepublishOnly`
  builds before checking.

- **`registerType` did not invalidate the strict-mode compile cache.**
  `invalidateCaches` replaced only the permissive cache, so a schema already
  compiled in strict mode kept validating against the type registry as it stood
  before the call. Found while extracting the compiler, and pinned by a test
  that fails against the previous implementation.

## [4.1.1] - 2026-09-21

### 🐛 Fixed

- **`@illavv/run_typer/package.json` was not resolvable.** Declaring `exports`
  at all makes every *undeclared* subpath unresolvable, and 4.1.0 declared only
  `"."` — so `require('@illavv/run_typer/package.json')` failed with
  `ERR_PACKAGE_PATH_NOT_EXPORTED`. Tooling reads that file routinely: version
  checks, bundler plugins, some test runners. It is now declared explicitly.

  This was true in 4.0.0 as well; it was found while verifying the 4.1.0
  publish, not introduced by it.

- **The 4.1.0 changelog entry had no version heading**, leaving its notes
  attached to the preamble instead of to a release.

### 🧪 Internal

- **The published manifest is now covered by tests.** `exports`, `files`,
  `sideEffects`, `engines` and the legacy `main`/`module`/`browser`/`types`
  entries are asserted, including that `types` is listed first among the
  conditions — after `import`/`require` it is silently ignored by TypeScript.
  Nothing else in the suite, the build or the type tests reads the manifest, so
  a packaging mistake was invisible until after a publish, and npm does not
  allow republishing a version to correct one.

## [4.1.0] - 2026-09-21

Work from the 4.0.0 adoption roadmap, in the order that audit recommended.

### ✨ Added

- **Standard Schema support.** `typer.standard(schemaOrValidatorOrAlias)` returns
  a validator carrying the `~standard` property described by the
  [Standard Schema](https://standardschema.dev) specification, which is what
  tRPC, Hono, TanStack Form and Router, Nuxt and dozens of other frameworks look
  for when they accept a validation library without a dedicated adapter.
  `objectOf()` now carries the same property.

  The wrapper is needed because a Typer schema is an inert object literal owned
  by the caller — Typer does not mutate it to attach anything. The result is
  still a plain `Validator`, so it composes exactly as before.

  Issue paths are converted to the spec's segment form (`'items[0].qty'` becomes
  `['items', 0, 'qty']`); `code`, `expected` and `received` ride along as extra
  properties, so nothing machine-readable is lost on the way out.

  The specification interface is vendored as `StandardSchemaV1` rather than
  taken as a dependency on `@standard-schema/spec`, keeping the install
  footprint at `tslib` alone. `STANDARD_VENDOR` (`'typer'`) is exported for
  consumers that attribute issues by vendor.

- **`toJSONSchema()`.** Without it there was no way to generate OpenAPI or
  Swagger documentation from a schema, which is the main reason people reach
  for TypeBox.

  ```typescript
  typer.toJSONSchema({ id: 'number', email: typer.validators.isEmail, note: 'string?' });
  // { $schema: '…/2020-12/schema', type: 'object',
  //   properties: { id: { type: 'number' },
  //                 email: { type: 'string', format: 'email' },
  //                 note: { type: ['string', 'null'] } },
  //   required: ['id', 'email'] }
  ```

  Type strings, `?` markers, `|` unions, arrays and nested objects convert
  exactly. Validators cannot be introspected, so Typer's own validators and
  combinators carry the fragment they correspond to — `isEmail` becomes
  `format: 'email'`, `arrayOf(…, { min: 1 })` becomes `minItems: 1`, `literal`
  becomes `enum`, `tuple` becomes `prefixItems`, `record` becomes
  `additionalProperties`, `withDefault` contributes `default`, and
  `discriminatedUnion` becomes a discriminating `oneOf`.

  A validator the caller wrote becomes `{}`, as do the aliases JSON cannot
  carry and anything registered with `extend`. `{ unrepresentable: 'throw' }`
  turns those into an error naming every path, so a build step can refuse
  rather than publish a schema that quietly accepts anything.

  Those fragments are built on first read, not at construction: setup cost is
  the benchmark Typer clearly wins, and most callers never ask for a JSON
  Schema. Building them eagerly cost `objectOf` 42% of its setup time; lazily
  it is 15% (1.21 µs to 1.39 µs, measured interleaved), which leaves the
  margin over Zod's 5.74 µs and TypeBox's 3.43 µs intact. `schema()` and
  `parse()` on a schema literal are untouched.

- **`discriminatedUnion(key, variants)`.** `union` tries each variant in turn,
  so its cost grows with the number of variants and its error lists every
  variant's failure — for the `{ type: 'a' | 'b' }` payloads that dominate real
  APIs, that is both the wrong cost and the wrong error.

  ```typescript
  const event = typer.discriminatedUnion('type', {
      created: { id: 'string', at: 'date' },
      renamed: { id: 'string', name: 'string' },
  });

  typer.safeParse(event, { type: 'renamed', id: 'x', name: 42 }).issues;
  // [{ code: 'invalid_type', path: 'name', expected: 'string' }]
  // rather than the failure of every variant
  ```

  The discriminant is read once and selects the one variant that can match, in
  constant time however many there are. Variants are keyed by discriminant
  value, so the mapping is exact by construction — there is no literal to
  extract from a schema and no way to declare the same tag twice. Each member
  carries its tag as a literal type, so the result narrows on the discriminant.

  The discriminant key is treated as declared even when a variant does not
  mention it, so `strict` mode does not flag the very key the union selects by.

- **Coercion: `typer.coerce.number`, `.boolean`, `.date`.** Query strings, form
  data and environment variables arrive as strings, so every handler was
  rewriting the conversion by hand ahead of validation — precisely where the
  mistakes get through.

  ```typescript
  const query = typer.parse({
      page:     typer.coerce.number,
      archived: typer.coerce.boolean,
      since:    typer.coerce.date,
  }, req.query);
  ```

  The two classic traps are handled rather than inherited: `Number('')` is `0`
  and `Boolean('false')` is `true`. These reject `''`, `'   '`, `null`,
  `undefined`, `NaN`, arrays and objects instead of producing a number, and read
  `'false'`/`'0'`/`'no'`/`'off'` as `false` and `'true'`/`'1'`/`'yes'`/`'on'` as
  `true`, rejecting anything else rather than guessing. A bigint outside the
  safe integer range is refused rather than silently losing digits, and
  `coerce.date` rejects the `Invalid Date` the `Date` constructor would hand
  back.

- **Schema composition: `pick`, `omit`, `partial`, `merge`.** Deriving
  `CreateUserDto` from `UserDto` needed a second copy of the shape written by
  hand, and the two diverged at the first change.

  ```typescript
  const publicUser  = typer.pick(userSchema, ['id', 'name']);
  const createUser  = typer.omit(userSchema, ['id']);
  const patchUser   = typer.partial(typer.omit(userSchema, ['id', 'password']));
  const timestamped = typer.merge(userSchema, { createdAt: 'date' });
  ```

  All four return a new schema and leave their sources untouched, and the
  results parse, infer and compose like any other schema. `merge` lets the
  second schema win on overlapping keys.

  `partial` gives a type-string slot the `?` marker it already understands.
  Validator, array and nested-schema slots have no marker of their own in the
  schema language, so they are rebuilt as `optional(...)` validators — which
  means a *made-optional* nested slot reports its failures as one `custom`
  issue at the slot's path rather than one per field. Passing an explicit key
  list avoids that where it matters.

- **Constraint failures carry a machine-readable code.** Three new
  `IssueCode`s — `too_small`, `too_big`, `invalid_format` — plus `minimum` and
  `maximum` on the issue itself.

  Every constraint used to report `code: 'custom'`, so "too short" and "out of
  range" were indistinguishable unless you read the message — the exact thing
  the structured errors exist to avoid, and a promise the README was making
  only for type errors:

  ```typescript
  typer.safeParse({
      name: (v) => typer.isLength({ min: 3, max: 50 }, v),
      pin:  (v) => typer.isInRange(1000, 9999, v),
  }, { name: 'ab', pin: 42 }).issues;
  // before: both code: 'custom'
  // after:  { code: 'too_small', minimum: 3 }
  //         { code: 'too_small', minimum: 1000, maximum: 9999 }
  ```

  Covers the bounds validators (`isInRange`, `isLength`, `isPort`, the
  positive/negative and empty/non-empty family, `arrayOf` bounds, `tuple`
  length) and the format validators (`isEmail`, `isURL`, `isUUID`, `isIP*`,
  `isSemver`, `isSlug`, `isJWT`, `isMACAddress`, `isHexColor`, `isISODate`,
  `isBase64`, `isPhoneNumber`, `isInteger`, `isFiniteNumber`, `isSafeInteger`,
  `matches`).

  Messages are unchanged, including the `Validation failed at "path": …`
  wrapping inside a schema. Constraint validators now throw a `TyperError`
  rather than a bare `TypeError` — it still extends `TypeError`, so existing
  `catch` blocks and `instanceof` checks are unaffected. A validator that
  throws without reporting a reason still produces `custom`.

- **Bundle-size budget check.** `npm run size` gzips each built artifact and
  fails when it grows past its budget. A small bundle is one of the three
  things the library actually wins on, so a regression in it now fails the
  build like any other. It also runs as part of `prepublishOnly`.

### ⚡ Performance

- **`safeParse` no longer pays for a thrown error when the validator can report
  without one.** `objectOf(schema)` wraps the same compiled checker `safeParse`
  uses directly, but the failure travelled out of it as a `TyperError` —
  constructing the error and capturing its stack — only to be caught one frame
  later and converted back into a `ParseResult`.

  Measured on the same failing payload: `safeParse(objectOf(schema), bad)` went
  from **3.51 µs to 0.46 µs**, which is parity with `safeParse(schema, bad)`
  (0.46 µs). It was 6× slower before.

  This mattered beyond the number: `strict` mode is only reachable through
  `objectOf`, so the safest way to validate was also the slowest one. `parse()`
  and calling the validator directly still throw — that is what they are for.

### 🔒 Security

- **Undeclared `__proto__`, `constructor` and `prototype` are stripped from
  validated objects.** Typer validates in place and returns the same reference,
  so a `JSON.parse` payload carrying those keys used to pass `success: true`
  with them intact — harmless in the returned object itself, dangerous at the
  first spread, `Object.assign` or ORM update downstream.

  They are removed unless the schema declares them as fields of its own, in
  which case they are ordinary keys and are validated normally. A valid payload
  stays valid, and `strict` mode is unchanged for every other extra key.

  When the object is frozen and the key cannot be removed, validation now fails
  with the new `dangerous_key` issue code instead of returning an object it
  could not make safe.

  The hot path is unaffected (measured at 66 ns before and after, on a flat
  four-field object): a three-read probe gates the exact `hasOwnProperty` check,
  so a plain unpolluted object pays ~2.5 ns rather than ~15 ns.

- **`record()` drops dangerous keys instead of copying them.** It builds a new
  object, and `out['__proto__'] = value` sets the result's prototype rather
  than a field — a distinct hole from the one above, in the opposite direction.

### 🐛 Fixed

- **A transforming validator in a schema slot now takes effect.** The compiled
  checker called the validator and discarded its return value, so `transform`,
  `withDefault` and `nullable` were inert inside a schema — including in the
  README's own example, where `withDefault` never wrote its default and
  `transform` never trimmed anything.

  ```typescript
  const payload = { slug: '  Hello  ' };
  typer.parse({ slug: typer.transform((v) => typer.asString(v), (s) => s.trim()) }, payload);
  payload.slug; // '  Hello  ' before, 'Hello' now
  ```

  A slot is written back **only when the validator returned something other
  than what it was given**, so every `is*`/`as*` validator and `objectOf` — all
  of which hand back their input — leave the object untouched, down to property
  identity. Array element slots follow the same rule.

  A validator declared as returning another type (`isISODate`, say) now
  actually replaces the value, which is what `Infer` has always claimed the
  slot holds.

- **`isNegativeInteger` reported the wrong message.** A copy-paste: it said
  `must be a positive integer`. It now says `must be a negative integer`.

### 🔧 Changed

- **`isInRange` no longer puts the failing value in its message.** A numeric
  range is exactly what guards PINs, one-time codes and amounts, and the
  message is what ends up in application logs — where the value was landing
  twice over:

  ```
  before: '42 must be between 1000 and 9999, is 42'
  after:  'value must be between 1000 and 9999'
  ```

  The value moves to the issue's new `value` field, so nothing is lost for
  callers that want to show it. That field is deliberately left out of the
  Standard Schema output, which is the boundary where an issue is handed to a
  framework that may log or serialize it whole. `isLength` already reported
  only the length and is unchanged.

- **The schema-identity cache is documented where it bites.** Compiled checkers
  are cached by schema *object* identity, so a literal written inside a handler
  is a new object on every call and is recompiled every time — 78 ns hoisted
  against 873 ns inline, and silent, because the code looks ordinary. Now
  called out on `parse`, on `schema`, and in a dedicated README section. (It is
  a cost, not a leak: the cache is a `WeakMap`.)

- **The bundle grew from 6.7 KB to 9.7 KB gzip**, and the size budget is
  raised to match. That is the price of this release's features, and none of
  it can be tree-shaken away by a consumer who uses none of them, because the
  whole API hangs off a class instance. It is the concrete argument for the
  5.0 modularization rather than a reason to keep loosening the budget. The
  README's size claims are updated accordingly.

- **The README no longer leads with "High Performance".** On the hot path Typer
  is slower than Zod and about nine times slower than a compiled TypeBox, so
  claiming speed as the headline invited exactly the comparison it loses — and
  buried the three things it does win: instant setup (1.13 µs against 5.74 and
  3.43), a small bundle (7.0 KB gzip), and schemas that read like the shape
  they describe. The full comparison, wins and losses, is now a table in the
  Performance section.

- **Package metadata.** `"sideEffects": false` lets bundlers drop unused code
  with confidence, which was previously impossible to prove and cost exactly
  the selling point the bundle size is meant to make. `engines.node` declares
  the supported floor (`>=20.0.0`), matching what is tested.

- **`src/` is now published.** The source maps in `dist/` point at
  `../src/Typer.ts`, which was not in the tarball — so go-to-definition and
  step-debugging broke for every consumer. Publishing the sources fixes both
  and costs nothing at runtime: the maps and sources are never loaded by the
  bundle, and the gzipped bundle size is unchanged.

## [4.0.0] - 2026-09-18

Three themes: validation failures became structured data, schemas became
compile-time checked, and the schema paths got substantially faster.

See [MIGRATION.md](./MIGRATION.md#migration-guide-v3x--v40) for the upgrade steps.

### 💥 Breaking

- **Schema type strings are now checked at compile time.** `typer.schema`,
  `typer.parse`, `typer.safeParse` and `typer.objectOf` reject aliases they do
  not recognise, so `{ id: 'nubmer' }` is a compile error instead of silently
  inferring `unknown` and failing at runtime. Types registered at runtime with
  `registerType` are invisible to the compiler — register them with the new
  `extend()` instead, or keep using `checkStructure`, which is unchanged.
- **Overriding a built-in alias now takes effect.** `registerType('string', fn, true)`
  was silently ignored by `is`, `isType` and schema validation since 3.2.2,
  because those read from the predicate fast-path table rather than the
  registry. The override now wins everywhere.
- **`checkStructure` shares the schema compiler**, which corrects four classes
  of misleading message. In each case the new message is the accurate one:
  - an unregistered alias reports `Unknown type: x` instead of pretending the
    value mismatched;
  - `['string?']` honours the optional marker on array elements instead of
    treating `string?` as a type name;
  - a malformed element schema is reported as malformed instead of blaming the
    value;
  - a malformed schema on a missing key reports the schema, not the key.
- **The ESM bundle is now `dist/Typer.esm.mjs`** (was `dist/Typer.esm.min.js`).
  The `exports` map is updated, so `import` still resolves; only deep imports
  of the old path break. The `.mjs` extension stops Node from having to sniff
  and reparse the file as a module.

### ✨ Added

- **Structured errors.** Every validation failure now carries
  `ValidationIssue[]` — `code`, `path`, `expected`, `received`, `message` —
  alongside the human-readable string.
  - `parse` throws `TyperError` (extends `TypeError`, so existing
    `instanceof TypeError` checks keep working) with `.issues` and `.flatten()`.
  - `safeParse` failures expose `.issues` directly.
  - `checkStructure` returns `issues` next to the existing `errors`.
  - `IssueCode` is one of `invalid_type`, `missing_key`, `unknown_type`,
    `invalid_schema`, `unexpected_key`, `custom`.
- **Combinators**, all returning a `Validator<T>` so they compose and nest:
  `literal`, `arrayOf`, `record`, `tuple`, `refine`, `transform`,
  `withDefault`, `lazy` (for recursive shapes), `instanceOf`, and `objectOf`
  (turns a schema into a validator, with optional `strict`).
- **`extend(name, validator)`** — `registerType` that also tracks the alias in
  the instance's type, so it is accepted by compile-time-checked schemas and
  resolves to its real type in `Infer`. Returns the same instance, re-typed,
  and chains.
- **`validators`** — the `is*` / `as*` validators pre-bound to the instance, so
  `{ id: typer.validators.isPositiveInteger }` works. A bare
  `typer.isPositiveInteger` loses its `this` and fails with an opaque
  "Cannot read properties of undefined" *even on valid input* — a form the
  README had been recommending. Built on first access and cached in a single
  slot: binding all of them onto the instance was measured to slow every other
  method several-fold by pushing the object out of V8's fast property mode.
- **Format validators**: `isIP`, `isSemver`, `isSlug`, `isPort`, `isJWT`,
  `isMACAddress`.
- **The package finally exports its types.** `Infer`, `Schema`, `Validator`,
  `ParseResult`, `ValidationIssue`, `TyperError` and friends are reachable from
  the package root; previously only the `Typer` class was, which made the
  `import { type Infer }` shown in the README fail.
- **`npm run bench`** — a reproducible benchmark harness (`benchmarks/`).
- **`npm run test:types`** — a type-level test suite (`tests/types/`) asserting
  exact `Infer` output and that invalid schemas are rejected. Wired into `npm test`.

### ⚡ Performance

Measured with `npm run bench` on Node 26, median of 7 batches:

| Operation | 3.2.3 | 4.0.0 | Change |
| --- | ---: | ---: | ---: |
| `safeParse(nested)` — invalid input | 100K ops/sec | 1.7M ops/sec | **17×** |
| `checkStructure(nested)` | 879K ops/sec | 7.0M ops/sec | **8×** |
| `isArrayOf('number', 50 items)` | 2.0M ops/sec | 53M ops/sec | **26×** |
| `parse(nested)` — valid input | 6.0M ops/sec | 8.0M ops/sec | 1.3× |
| `parse(array of 50)` | 2.6M ops/sec | 3.3M ops/sec | 1.3× |
| `isString` type guard | 153M ops/sec | 226M ops/sec | 1.5× |

Where it came from:

- The compiled schema checked each field by **calling a checker that throws**
  and catching it. Every invalid field therefore paid for an exception and its
  stack capture. Fields now go through the same boolean predicates `is()` uses.
- `safeParse` **threw and caught its own error** one frame later. The schema
  path now reports the failure directly, and the `Error` is built lazily on
  first access to `result.error` — code that reads `result.issues` never pays
  for the stack capture, which alone costs more than the validation.
- Error paths were **built eagerly**: every field concatenated its dotted path
  on every validation, even when it passed. Paths are now materialised only
  when something fails.
- `isArrayOf` re-resolved the element type name and re-entered `isType` for
  every item; it now resolves the predicate once.
- The type guards (`isString`, `isNumber`, `isBoolean`, `isArray`, `isObject`)
  used `try`/`catch` around a throwing checker; they are now direct checks.
- `checkStructure` walked the schema on every call. It now shares the compiled,
  cached checker with `parse`, which also removed ~100 lines of duplicated
  validation logic.

### 🐛 Fixed

- **Compiled schemas were never invalidated.** A schema validated before
  `registerType` / `unregisterType` kept its stale type resolutions forever,
  because only the predicate cache was cleared. Both caches are now dropped.
- `registerType(name, fn, true)` overriding a built-in alias is no longer
  ignored (see Breaking).
- The rollup build emitted CommonJS `require()` calls into the "ESM" bundle, so
  every internal module was left unresolved. The build now feeds real ES
  modules to rollup. This only became visible once the source was split across
  files.
- The `exports` map now lists `types` first, as TypeScript's `node16`/`bundler`
  resolution requires.

### 🏗 Internal

- Source split by concern: `src/Errors/`, `src/Utils/`, `src/Constants/`,
  alongside the existing `src/Types/`.
- Regexes moved out of the validators into `src/Constants/Patterns`, so each is
  compiled once instead of on every call.
- Added a `prepublishOnly` hook running the full suite and a fresh build.
  `dist/` is gitignored, so nothing previously guaranteed the published tarball
  was built from the committed source.

### 📉 Coverage

Line coverage is 97.3% (was ~100%). The only uncovered lines are the `return p`
statements of the built-in `t*` checkers: now that predicates answer every
successful check, those checkers only ever run to throw. This is flagged with a
`TODO(tech-debt)` in the source — collapsing each checker into a
(predicate, message) pair would remove the duplication but would reword some
error messages, so it is deferred.

## [3.2.3] - 2026-04-28

### 🧪 Coverage — push from 86% to ~100%

After the predicate fast-path landed in 3.2.2, every built-in `t*`
checker's `return p` line was bypassed by `is()` / `isType()` and
showed up as uncovered. This release adds targeted tests that drive
the missing branches and removes a handful of provably-dead
defensive handlers.

#### Tests added (`tests/coverage-completion.test.ts`, 33 cases)
- A single schema parse that exercises every built-in type-string
  with a passing value, hitting every `t*` method's `return p` via
  the schema compiler's `typesMap` calls.
- `tNull` covered via `'null'` schema with a null value.
- `tUndefined` covered via an array element of type `'undefined'`
  (where `compileValue` falls through the field-level intercept).
- `tDomElement` happy and sad paths covered with a mocked
  `globalThis.HTMLElement`.
- Custom-type predicate-wrapper path inside `getPred`, including
  `predCache` invalidation on `registerType` / `unregisterType`.
- Every closure-compiler error branch (invalid schema, empty type
  definition, unknown type, empty array schema, multiple-element
  array schema, missing fields, type mismatches, validator entries
  inside arrays, nested objects inside arrays, …).
- `getType` formatting branches (date / regexp / map / set in
  error messages).

#### Dead code removed
Per the project rule "don't add error handling for scenarios that
can't happen":
- Removed the two outer `try/catch` wrappers in `checkStructure`
  around `validateSchemaValue` calls — `validateSchemaValue`
  collects errors via the `errors` array and never throws.
- Removed a duplicate `else if` branch in `expect()` that mirrored
  the arg-length check at the top of the same closure.

#### Defensive branches marked
A few branches in the closure compiler (`compileValue` array-of-array
fallback) and `isIPv6` (URL-hostname-bracket guard) are unreachable
through the public API but are kept as safety nets for future
contributors. Marked with `/* istanbul ignore next */` and an inline
comment explaining the rationale.

### Final metrics
|             | Before  | After    |
|---           |---      |---       |
| Statements  | 86.13%  | **99.31%** |
| Branches    | 80.04%  | **95.69%** |
| Functions   | 91.27%  | **100%**   |
| Lines       | 86.71%  | **100%**   |
| Tests       | 256     | **290**    |

## [3.2.2] - 2026-04-28

### 🚀 Performance — Predicate fast-path for `is` / `isType`

`is()` and `isType()` were the next bottleneck after the schema
compiler: each call allocated a one-element array, mapped a
`bind(this)` per type, and went through a try/catch even on the happy
path. This release routes both methods through a parallel boolean
predicate map for built-in aliases, plus a per-raw-string cache.

#### Measured impact (100k iterations, hot literal)
- `is(value, "string")`: **~70M ops/sec**
- `isType("number", value)`: **~74M ops/sec**
- `is(value, ["array","object","string","number"])`: **~23M ops/sec**

#### How
- New `builtinPredicates` map mirrors `typesMap` with direct boolean
  checks (`typeof v === 'string'`, `Array.isArray`, `v instanceof Date`,
  …). Built once in the constructor.
- New `predCache: Map<string, Pred|null>` memoizes the resolved
  predicate **per raw input string** so `toLowerCase().trim()` and the
  `typesMap` lookup happen once per literal.
- `getPred(rawType)` resolves + caches. For built-ins it returns the
  fast predicate. For custom types it wraps the throwing checker once,
  absorbing try/catch into the wrapper. Unknown types are cached as
  `null` and throw fast on subsequent calls.
- `is()` becomes a one-line predicate call on the single-string fast
  path.
- `isType()` predicate-checks first; only on miss does it fall back to
  the original throwing checker to reconstruct the byte-for-byte
  identical error message.
- `registerType` / `unregisterType` clear `predCache` to avoid leaks.

### 🧪 Tests
Extended `tests/parse-perf.test.ts` with two new benchmarks for
`is()` / `isType()` and a 4-type-union short-circuit check. Total:
**256/256 passing**. No behavioral regressions (every error message is
preserved).

## [3.2.1] - 2026-04-28

### 🚀 Performance — Closure-compiled schema cache

Replaced the wrapper-only `getCompiledChecker` introduced in 3.2.0 with
a real closure-based compiler. Schemas are now walked **once** at compile
time; the hot path is a tight `for` loop over pre-built closures with
**zero** per-call string parsing, `bind(this)`, or `checkStructure`
recursion.

#### Measured impact (5k iterations, schema with 7 fields + nested object)
- `parse()` (compiled): **~5ms** — `checkStructure` (raw): **~50ms** —
  **3–10× speedup** depending on machine and JIT state.
- 10k repeated `parse()` calls on a tiny cached schema: **~3ms**
  (≥3M ops/sec).

#### How
- `compileSchema(schema)` walks every field once and returns a flat
  `(obj, errors, parentPath) => void` closure.
- `compileField(key, expected)` dispatches to one of four specialized
  compilers (validator-fn, string-type, array-of, nested-object), each
  pre-resolving everything the runtime would otherwise recompute:
  `split('|')`, `trim`, `endsWith('?')`, `slice(0, -1)`, `toLowerCase`,
  and `typesMap[…]` lookups.
- Nested schemas are compiled recursively; their compiled checkers are
  captured by reference so re-entry is just a function call.
- Error messages remain byte-for-byte identical to `checkStructure` —
  every existing test passes unchanged.

### 🧪 Tests
Added `tests/parse-perf.test.ts` with a comparative smoke test
(`parse(compiled)` ≤ 1.2× `checkStructure`) and a cached-throughput test
(10k tiny schemas under 500ms). Total: **254/254 passing**.

## [3.2.0] - 2026-04-28

### ✨ Added — Typed schema parsing (the "Zod-style" win)

A schema literal alone now drives both runtime validation and the
TypeScript type — no separate `interface User { … }` to keep in sync.

```ts
const user = typer.parse(
  { id: 'number', name: 'string', email: 'string?' },
  payload,
);
// user is typed: { id: number; name: string; email?: string | null }
```

#### New methods
- **`parse<S>(schemaOrTypeOrValidator, value)`** — universal entry point.
  Accepts a type alias, an array of aliases, a `Validator<T>` function, or
  a `Schema` object. Throws on failure, returns the inferred typed value
  on success. Uses `<const S>` so no `as const` is needed for inline schema
  literals.
- **`safeParse<S>(schemaOrTypeOrValidator, value)`** — non-throwing variant
  that returns `{ success: true, data: Infer<S> } | { success: false, error }`.
- **`schema<const S>(definition)`** — identity helper that preserves literal
  types when you want to declare a schema in a variable and derive
  `Infer<typeof schema>` from it.

#### New exported types
- **`Infer<S>`** — derives the TypeScript type from a runtime schema literal.
  Handles `?`-suffix optionals, `|`-unions, array elements, nested objects,
  and embedded `Validator<T>` functions.
- **`Schema`**, **`SchemaArrayElement`**, **`ResolveTypeString`**,
  **`ResolveSchemaValue`** — supporting types for the inference machinery.

#### Schema entries can now be validator functions
Schemas accept `Validator<T>` functions in any slot, mixing string aliases
and custom checks:

```ts
const schema = typer.schema({
  id: typer.isPositiveInteger,
  name: typer.isNonEmptyString,
  color: (v) => typer.isHexColor(v),
  email: 'string?',
  role: 'admin|user|guest',
});
```

When a function is supplied, missing-key handling defers to the validator
itself (so `typer.optional(asString)` correctly accepts `undefined`).

### 🚀 Performance
Added an internal `WeakMap` schema-checker cache so repeated `parse()`
calls on the same schema literal skip re-walking the definition. The
implementation is intentionally a thin wrapper today — designed so a
real closure-based compiler can be slotted in later without changing the
public API.

### 🧪 Tests
Added `tests/parse-schema.test.ts` with 20 cases including 5 compile-time
type assertions (`expectType<AssertEqual<…>>()`) that fail in compile if
the inference machinery breaks. Total: **252/252 passing**.

## [3.1.0] - 2026-04-28

### ✨ Added

#### Strongly-typed `isType` / `is` (no more `<string>` boilerplate)
Both methods now have a built-in overload keyed off the new `TypeMap` type.
A literal alias is enough — no manual generic argument needed:

```ts
const s = typer.isType("string", x);  // s: string
if (typer.is(v, "number")) v.toFixed(2);  // narrows automatically
```

#### `safeParse(types, value)` — non-throwing variant
Returns `{ success: true, data } | { success: false, error }` for callers
who prefer functional flows over try/catch.

#### Combinators (composable validators)
- `nullable(validator)` — accepts `null` plus the underlying type.
- `optional(validator)` — accepts `undefined` plus the underlying type.
- `union(v1, v2, …)` — first-match wins, returns the matching variant.

#### New format / shape validators
- `isUUID` (RFC 4122 v1–v5)
- `isIPv4`, `isIPv6`
- `isHexColor` (`#RGB` / `#RGBA` / `#RRGGBB` / `#RRGGBBAA`)
- `isISODate` — returns the parsed `Date`
- `isBase64` (with `urlSafe` and `requirePadding` options)
- `isFiniteNumber` (rejects `NaN` / `Infinity`)
- `isSafeInteger`
- `isPlainObject` (rejects class instances)
- `isPromise`
- `isInstanceOf(ctor, value)`
- `matches(regex, value)`
- `isLength({min, max}, value)` for strings and arrays
- `isEmpty` / `isNonEmpty` (polymorphic over string, array, Map, Set, object)

### 🧪 Tests
Added `tests/extended-validators.test.ts` (~35 cases) covering every new
method plus the new overload behavior. Total: **232/232 passing**.

### 📚 Types
Added new exported types in `src/Types/Typer/index.ts`: `TypeMap`,
`TypeKey`, `ParseResult<T>`, `Validator<T>`.

## [3.0.7] - 2026-04-28

### 🧹 Changed
- Cleaned up dead `const type = typeof p` locals in 7 internal type-checker
  methods (`tBigint`, `tBoolean`, `tFunction`, `tNumber`, `tString`,
  `tSymbol`, `tUndefined`) — the variables were assigned then re-computed
  inline, hiding the actual check.
- Replaced two `any` casts in `expect()` with `unknown`, complying with the
  team-wide "no implicit `any`" rule.

No behavioral or API changes — purely internal hygiene.

## [3.0.6] - 2026-04-28

### 🔧 Fixed
- **TypeScript 6.0 compatibility**: tests no longer fail to compile with `ts-jest 29` + TypeScript 6 due to the new hybrid-module-kind requirement.
  - Enabled `isolatedModules: true` in `tsconfig.json` (warned about explicitly by `ts-jest`).
  - Switched the type-only imports in `src/Typer.ts` to `import type { … }` so the runtime no longer reaches into a type-only module for a non-existent value (which produced `Globals_1.Error is not a constructor`).

## [3.0.1] - 2025-10-02

### 🔧 Fixed
- Minor documentation and test improvements
- Build configuration optimizations

## [3.0.0] - 2025-10-02

### 🎉 Major Release - Complete TypeScript Overhaul

This is a major release with significant improvements, new features, and breaking changes. The library has been completely rewritten with modern TypeScript features, comprehensive testing, and enhanced developer experience.

### ✨ Added

#### 🔥 **New Generic Type System**
- **Full TypeScript Generic Support**: All methods now support generic types with proper type inference
- **Type Guards**: New `is<T>()` method with TypeScript type narrowing support
- **Type-safe Validation**: `isType<T>()` now returns properly typed values
- **Generic Helper Methods**: `asString()`, `asNumber()`, `asBoolean()`, `asArray<T>()`, `asObject<T>()`

#### 🎯 **Advanced Validation Methods**
- **Phone Number Validation**: `isPhoneNumber()` with international ITU-T E.164 standard support (7-15 digits)
- **Email Validation**: Enhanced `isEmail()` with comprehensive format checking
- **URL Validation**: `isURL()` with proper URL format validation
- **Range Validation**: `isInRange(min, max, value)` for numeric constraints
- **Integer Validation**: `isInteger()` for whole number validation
- **Positive/Negative Validation**: `isPositiveNumber()`, `isPositiveInteger()`, `isNegativeNumber()`, `isNegativeInteger()`
- **Non-empty Validation**: `isNonEmptyString()`, `isNonEmptyArray<T>()`
- **Array Type Validation**: `isArrayOf<T>(elementType, array)` for typed array validation
- **One-of Validation**: `isOneOf<T>(allowedValues, value)` for enum-like validation

#### 🏗️ **Enhanced Structure Validation**
- **Recursive Schema Validation**: Deep nested object structure validation
- **Optional Fields**: Support for optional fields with `fieldName?` syntax
- **Union Types**: Schema support for union types like `"string|number"`
- **Array Schemas**: Validation for arrays with specific element types `["string"]`
- **Strict Mode**: Optional strict validation that rejects extra properties
- **Detailed Error Reporting**: Comprehensive error messages with full path information

#### 🔧 **Extended Type Support**
- **Modern JavaScript Types**: `BigInt`, `TypedArray`, `ArrayBuffer`, `DataView`
- **Advanced Collections**: `Map`, `Set` with proper type checking
- **Specialized Types**: `JSON` string validation, `Symbol` support
- **DOM Elements**: `HTMLElement` validation (browser environment)
- **All Primitive Types**: Enhanced support for all JavaScript primitives

#### 📋 **Type Management System**
- **Custom Type Registration**: Enhanced `registerType()` with override support
- **Type Import/Export**: `exportTypes()` and `importTypes()` for type serialization
- **Case-insensitive Types**: Support for case-insensitive type names
- **Type Aliases**: Short-form aliases like `s` for `string`, `n` for `number`

#### 🛡️ **Function Type Safety**
- **Enhanced Function Wrapping**: Improved `expect()` with better parameter validation
- **Promise Support**: Full async function validation with Promise return types
- **Multiple Parameter Types**: Support for functions with multiple typed parameters
- **Flexible Return Types**: Support for multiple possible return types
- **Error Handling**: Better error messages for parameter and return type mismatches

### 🔄 Changed

#### 💥 **Breaking Changes**
- **Class-based API**: Changed from static methods to instance-based API
  ```typescript
  // Before v3.0.0
  Typer.is(value, 'string')
  
  // After v3.0.0
  const typer = new Typer()
  typer.is<string>(value, 'string')
  ```
- **Generic Type Signatures**: All validation methods now use TypeScript generics
- **Error Types**: Changed from generic `Error` to more specific `TypeError` for validation failures
- **API Method Names**: Some methods renamed for consistency (see migration guide)

#### 📈 **Improvements**
- **Performance**: Optimized validation algorithms for better performance
- **Type Safety**: Removed all `any` types in favor of `unknown` and proper generics
- **Error Messages**: More descriptive and actionable error messages
- **Memory Usage**: Reduced memory footprint for large-scale validations
- **Bundle Size**: Optimized build output for smaller bundle sizes

### 🧪 Testing & Quality

#### 📊 **Comprehensive Test Suite**
- **96.97% Test Coverage**: Extensive test coverage with 197 test cases
- **9 Test Suites**: Organized test files covering all functionality
  - `basic-types.test.ts` - Core type validation
  - `advanced-validations.test.ts` - Specialized validators
  - `structure-validation.test.ts` - Schema validation
  - `type-management.test.ts` - Custom type system
  - `generics-integration.test.ts` - Generic type support
  - `expect-validate-assert.test.ts` - Function validation
  - `edge-cases.test.ts` - Error handling and edge cases
  - `all-type-validators.test.ts` - Complete type coverage
  - `complete-coverage.test.ts` - Final coverage optimization

#### 🔍 **Quality Assurance**
- **Jest Testing Framework**: Modern testing with TypeScript support
- **Coverage Reporting**: Detailed coverage reports with uncovered line tracking
- **Error Path Testing**: Comprehensive error handling validation
- **Edge Case Coverage**: Extensive testing of boundary conditions
- **Type System Testing**: Validation of TypeScript type inference

### 📚 Documentation

#### 📖 **Complete Documentation Overhaul**
- **Comprehensive README**: Professional README with badges, examples, and complete API reference
- **API Documentation**: Detailed documentation for all 40+ methods
- **Usage Examples**: Real-world examples for all major features
- **TypeScript Integration**: Examples showing proper TypeScript usage
- **Migration Guide**: Clear migration path from v2.x to v3.0

#### 🤝 **Community Resources**
- **GitHub Issue Templates**: 5 structured issue templates for different types of reports
  - Bug Report template with environment and reproduction details
  - Feature Request template with use cases and API design
  - Documentation Issue template for doc improvements
  - Question template for usage help
  - Performance Issue template for optimization reports
- **Contributing Guide**: Comprehensive contribution guidelines
- **Pull Request Template**: Structured PR template with checklists
- **Code of Conduct**: Community guidelines and standards

### 🏗️ **Build & Infrastructure**

#### 🔧 **Enhanced Build System**
- **Multiple Output Formats**: UMD, ESM, and CommonJS builds
- **TypeScript Definitions**: Complete `.d.ts` files for all exports
- **Rollup Configuration**: Optimized bundling with tree-shaking
- **Documentation Generation**: Automated TypeDoc generation

#### 📦 **Package Management**
- **NPM Package**: Published as `@illavv/run_typer@3.0.0`
- **Dependency Updates**: Updated all dependencies to latest versions
- **Security**: No security vulnerabilities in dependencies
- **File Organization**: Clean dist structure with only necessary files

### 🛠️ **Developer Experience**

#### 💻 **Development Tools**
- **TypeScript 5.9.3**: Latest TypeScript with strict configuration
- **Jest Configuration**: Optimized Jest setup with TypeScript support
- **VS Code Integration**: Enhanced IntelliSense and type checking
- **Error Reporting**: Better stack traces and debugging information

#### 🎯 **Type Safety**
- **Strict Mode**: Full TypeScript strict mode compliance
- **No Any Types**: Eliminated all `any` types for better type safety
- **Generic Constraints**: Proper generic constraints for type safety
- **Type Guards**: Runtime type checking with TypeScript integration

### 🔧 Migration Guide (v2.x → v3.0)

#### **1. Installation**
```bash
npm install @illavv/run_typer@^3.0.0
```

#### **2. Import Changes**
```typescript
// Before
import Typer from '@illavv/run_typer'

// After
import { Typer } from '@illavv/run_typer'
```

#### **3. API Changes**
```typescript
// Before - Static methods
Typer.is(value, 'string')
Typer.isType('string', value)
Typer.checkStructure(schema, obj)

// After - Instance methods with generics
const typer = new Typer()
typer.is<string>(value, 'string')
typer.isType<string>('string', value)
typer.checkStructure(schema, obj)
```

#### **4. New Generic Features**
```typescript
const typer = new Typer()

// Type-safe validation with generics
const str = typer.isType<string>('string', 'hello') // str: string
const num = typer.asNumber(42) // num: number

// Advanced validations
const email = typer.isEmail('user@example.com')
const phone = typer.isPhoneNumber('+1234567890')
const range = typer.isInRange(1, 10, 5)
```

### 📊 **Statistics**

- **Lines of Code**: 1,200+ lines of TypeScript
- **Test Cases**: 197 comprehensive tests
- **Test Coverage**: 96.97% statement coverage
- **API Methods**: 40+ validation methods
- **Supported Types**: 20+ JavaScript/TypeScript types
- **Documentation**: Complete API reference with examples

### 🙏 **Acknowledgments**

This major release represents a complete rewrite focused on:
- **Developer Experience**: Better TypeScript integration and IntelliSense
- **Type Safety**: Elimination of `any` types and comprehensive generics
- **Reliability**: Extensive testing and error handling
- **Performance**: Optimized validation algorithms
- **Community**: Professional documentation and contribution guidelines

---

## [2.4.1] - Previous Release

### Legacy Version
- Basic type checking functionality
- Static method API
- Limited TypeScript support
- Basic validation methods

---

## How to Update

### From v2.x
This is a **major version** with breaking changes. Please review the migration guide above and update your code accordingly.

### Recommended Update Process
1. Install the new version: `npm install @illavv/run_typer@^3.0.0`
2. Update imports to use named export: `import { Typer } from '@illavv/run_typer'`
3. Create Typer instances: `const typer = new Typer()`
4. Update method calls to use instance methods with generics
5. Run tests to ensure compatibility
6. Leverage new features like advanced validations and schema checking

### Need Help?
- 📖 Read the updated [documentation](https://lavv425.github.io/Typer/)
- 💬 Join our [GitHub Discussions](https://github.com/lavv425/Typer/discussions)
- 🐛 Report issues using our [issue templates](https://github.com/lavv425/Typer/issues/new/choose)

---

**Full Changelog**: [v2.4.1...v3.0.0](https://github.com/lavv425/Typer/compare/v2.4.1...v3.0.0)