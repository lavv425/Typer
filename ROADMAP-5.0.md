# Typer 5.0 — plan

> Status: **complete.** All eight steps are implemented on
> `feat/5.0-modularization`; see §2.1 for what the split measured.
> Written for the maintainer and contributors, as the follow-up to item 10 of
> the 4.0.0 audit — the two items that audit explicitly deferred:
> **P2-7** (modularization) and **P2-4** (async validation).
>
> The 4.0.0 audit's rule applies here too: every number below comes from a
> measurement or a working prototype, and where something is an estimate it
> says so.

---

## 1. Why 5.0 exists

Three problems that 4.1 could not fix, and one it created.

**The bundle cannot shrink.** The whole API hangs off a class instance, so a
consumer who validates one flat schema still ships every format validator,
every combinator, the JSON Schema converter and the legacy surface. Nothing
tree-shakes, ever — not because the code is badly written but because a class
is a single reachable object.

**4.1 made that worse.** Standard Schema, schema composition, coercion,
discriminated unions and JSON Schema output took the bundle from **6.7 KB to
9.7 KB gzip**. Every one of those is opt-in at the API level and mandatory at
the bundle level. Adding features to Typer currently costs every consumer,
which is not a position a library sold on its size can hold for long.

**One file absorbs every change.** `src/Typer.ts` is **3,426 lines** (2,669 at
4.0.0) with **81 public and 50 private members** out of 4,805 lines of source.
Every contribution touches it, so every contribution conflicts.

**Async validation needs the engine open anyway.** `parseAsync` (P2-4) cannot
be bolted on: the compiled checker is synchronous by construction. If the
compiler is going to be reworked, it should be reworked once.

---

## 2. What a modular Typer would actually weigh

Not an estimate. A working prototype of the schema-validation path, rewritten
as free functions with no class and no instance state, reusing the real
`Utils/Issues`, `Utils/Path`, `Utils/Sanitize` and `Errors/TyperError` modules
unchanged, bundled with the project's own rollup + terser and gzipped:

| Consumer imports | gzip | vs today |
| --- | ---: | ---: |
| `parse` + `safeParse` only | **1.72 KB** | −82% |
| … + 1 format validator (`isEmail`) | 1.84 KB | −81% |
| … + 4 format validators | 2.03 KB | −79% |
| **today: `new Typer()`** | **9.69 KB** | — |
| *(reference)* `zod/mini` | 4.8 KB | |

Each additional format validator costs roughly **100–125 B gzip**. A realistic
application — schema validation plus a handful of format checks — lands around
**2–2.5 KB**, roughly **half of `zod/mini`** and a quarter of Typer today.

The prototype is functional, not a stub: it validates nested objects, arrays,
optional and union type strings and validator slots, reports the same issue
codes and dotted paths, and strips dangerous keys. It is deliberately
incomplete — no custom type registry, no strict mode, no `is`/`isType`, no
legacy surface — so **treat 1.72 KB as a floor, not a promise.** Restoring the
registry and strict mode will add to it. It will not add 8 KB.

### 2.1 What it actually measured, once built

The prototype above predicted a floor. Here is the **shipped** entry point,
built by `npm run build` and measured by `npm run size`:

| Consumer imports | gzip | vs the class |
| --- | ---: | ---: |
| `optional` + `arrayOf` only | **0.88 KB** | −91% |
| `core` — `parse`, `safeParse`, `schema`, registries | **3.35 KB** | −67% |
| `core` + `isEmail` + 3 combinators | 4.84 KB | −54% |
| every validator (44), no class | 3.93 KB | −60% |
| every combinator, no class | 6.24 KB | −40% |
| `async` — `parseAsync`, `asyncRefine` | 3.65 KB | |
| the class | 10.46 KB | — |
| *(reference)* `zod/mini` | 4.8 KB | |

**The target is met.** A realistic app — schema validation plus a few format
checks — ships around **4 KB against the class's 10 KB**, under `zod/mini`,
and the budgets in `scripts/check-bundle-size.mjs` hold every entry point
there. `optional` + `arrayOf` at 0.88 KB is the proof that the schema
compiler really does drop out when nothing needs it.

A validator costs **~61 B on top of `core`** — it carries the JSON Schema
fragment that makes it self-describing.
Getting there needed one non-obvious fix: `BUILTIN_CHECKERS` and
`BUILTIN_PREDICATES` are built by a call expression, which rollup cannot
prove side-effect-free, so importing a single validator retained all 19
checkers — 624 B. Both are now annotated `/*#__PURE__*/`. **Any future map
built by a call needs the same annotation**, or it silently reattaches itself
to every bundle.

### Where the class's 9.67 KB goes

By source lines in `Typer.ts`, which is the best available proxy — the minified
bundle shares identifiers across groups, so per-group byte attribution would be
guesswork:

| Group | Members | Lines |
| --- | ---: | ---: |
| combinators | 16 | 569 |
| schema compiler | 11 | 500 |
| format validators | 15 | 357 |
| type registry & predicates | 11 | 295 |
| numeric & size validators | 15 | 286 |
| built-in type checkers (`tArray`, `tString`, …) | 19 | 263 |
| entry points (`parse`, `safeParse`, `is`, …) | 6 | 216 |
| guards & `as*` | 14 | 183 |
| legacy surface (`checkStructure`, `validate`, `assert`, `expect`) | 5 | 157 |
| schema composition | 6 | 143 |
| coercion | 4 | 137 |
| JSON Schema | 1 | 24 |

A consumer validating `{ id: 'number' }` needs the compiler, the entry points
and a handful of predicates. Everything else — roughly two thirds of the file —
is carried and never called.

---

## 3. P2-7 — modularization

### 3.1 The shape

```
src/
  core/
    compile.ts        schema compiler, as free functions
    parse.ts          parse, safeParse, standard
    resolve.ts        alias -> predicate resolution, registry-aware
  predicates/
    builtin.ts        one export per built-in alias
  validators/
    guards.ts         isString, asString, isNumber, …
    strings.ts        isEmail, isURL, isUUID, isSlug, isJWT, …
    numbers.ts        isInRange, isInteger, isPort, …
    sizes.ts          isLength, isEmpty, isNonEmpty, …
  combinators/
    basic.ts          nullable, optional, union, literal, refine, transform, …
    collections.ts    arrayOf, record, tuple
    objects.ts        objectOf, discriminatedUnion
  schema/
    compose.ts        pick, omit, partial, merge
  coerce/index.ts
  jsonschema/index.ts
  legacy/
    typer.ts          the class, assembled from the above
  index.ts            re-exports everything (the convenience entry)
```

Each module keeps the JSDoc and comments it has now — the audit called the code
"ordinato e ben commentato", and this is a move, not a rewrite.

### 3.2 The state problem

The class owns four pieces of mutable state: `typesMap`, `predCache`,
`builtinPredicates`/`builtinCheckers`, and the two schema caches. Free
functions cannot share instance state, and module-level mutable state is the
global-singleton trap the project rightly avoids.

Proposal: **built-ins are static, custom aliases are explicit.**

```ts
// No registry needed — the overwhelmingly common case, fully tree-shakable.
import { parse } from '@illavv/run_typer';
parse({ id: 'number' }, payload);

// Custom aliases become a value you hold, not hidden instance state.
import { createRegistry, parse } from '@illavv/run_typer';

const registry = createRegistry({
    positive: (v: unknown): number => { … },
});

parse({ qty: 'positive' }, payload, { registry });
```

The compiled-checker cache moves from two instance `WeakMap`s to two
module-level `WeakMap`s keyed by schema identity — the same semantics, since
they were already keyed on the schema object rather than on the instance.
A registry carries its own cache, so registering a type still invalidates only
what it should.

### 3.3 Keeping the class

`Typer` stays, implemented as a facade over the free functions:

```ts
export class Typer<TRegistry extends TypeRegistry = {}> {
    #registry = createRegistry();
    parse(schema, value) { return parse(schema, value, { registry: this.#registry }); }
    isEmail(value) { return isEmail(value); }
    // …
}
```

So **P2-7 is additive, not breaking.** Existing code keeps working unchanged;
it simply stops being the only way in. Importing the class still pulls
everything — that is inherent, and it becomes the opt-out rather than the
default.

### 3.4 Spike result — the typing works

**Done, and it resolves open question 2.** The spike compiled three candidate
signatures under `--strict`, with `@ts-expect-error` on every case that must
fail, so a check that silently stopped working would have shown up as an unused
directive rather than passing quietly.

**The one real failure, and the fix.** The obvious signature

```ts
function parse<R extends TypeRegistry, const S extends ValidateSchema<S, KnownAlias<R>>>(
    schema: S, value: unknown, options?: { registry: Registry<R> }): Infer<S, R>
```

**silently loses the typo check whenever no registry is passed** — the common
case. With `options` omitted there is nothing to infer `R` from, so it falls
back to its constraint `TypeRegistry` = `Record<string, unknown>`; `KnownAlias<R>`
then widens to `string`, and `parse({ id: 'nubmer' }, payload)` compiles
cleanly. That is a worse failure than not compiling: 4.0's headline feature
would have quietly stopped working.

Defaulting the registry parameter to `{}` fixes it, and putting the schema
first avoids needing a junk default on `S`:

```ts
function parse<const S extends ValidateSchema<S, KnownAlias<R>>, R extends TypeRegistry = {}>(
    schema: S, value: unknown, options?: { registry: Registry<R> }): Infer<S, R>
```

`S`'s constraint forward-references `R`, which was the part in doubt — it
works. Verified: built-in aliases with no registry, custom aliases resolving to
their produced types, typos rejected with and without a registry, an alias from
a *different* registry rejected, built-ins alongside custom aliases, nested
schemas and arrays, and the same through `safeParse` and the `schema()` helper.

**`Infer` reads the registry value, not a hand-written map.** Today custom
aliases must be repeated by hand — `Infer<typeof s, { positive: number }>`.
They can be recovered from the registry's own type:

```ts
type TypesOf<Reg> = Reg extends Registry<infer R> ? R : {};
type InferWith<S, Reg> = Infer<S, TypesOf<Reg>>;

type Order = InferWith<typeof orderSchema, typeof registry>;   // { qty: number }
```

**Open question 2 answered: keep the registry, and bind it.** Passing
`{ registry }` on every call is the real cost of losing the instance. A bound
factory removes it without giving up tree-shaking, because a consumer
destructures only what they use:

```ts
const { parse, schema } = createTyper({ positive: (v) => … });

const orderSchema = schema({ qty: 'positive' });   // alias-checked
parse(orderSchema, payload);                        // { qty: number }
```

This reads like today's instance API, keeps every compile-time check, and never
reaches `toJSONSchema` or the format validators unless they are imported. So
the surface becomes:

- `parse(schema, value)` — free function, no registry, fully tree-shakable;
- `parse(schema, value, { registry })` — explicit, for one-off use;
- `createTyper(aliases)` — bound, for codebases that lean on custom aliases;
- `new Typer()` — unchanged, the compatibility path.

### 3.5 Remaining risks

- **Two ways to do everything** is a documentation cost. The README has to lead
  with one — the free functions — and present the class as the compatibility
  path.
- **The bundle-size budget must be re-expressed per entry point**, otherwise
  `npm run size` measures a bundle nobody ships any more.
- **The runtime split is now the work.** The typing is settled; what remains is
  moving ~3,400 lines without changing behaviour, which the 668-test suite and
  the type-level tests are there to hold.
- **Two ways to do everything** is a documentation cost. The README has to lead
  with one — the free functions — and present the class as the compatibility
  path.
- **The bundle-size budget must be re-expressed per entry point**, otherwise
  `npm run size` measures a bundle nobody ships any more.

---

## 4. P2-4 — async validation

### 4.1 Why it is rated "Alta"

The compiled checker is synchronous by construction: `compileSchema` produces
`FieldChecker` closures returning `void` and pushing into a shared `issues`
array, and the hot path is a flat `for` loop over them. Making that path
`await` anything means a second closure shape and a second walker.

### 4.2 Proposal

**Async is declared, not detected.** Sniffing `AsyncFunction` is unreliable —
an ordinary function returning a promise is indistinguishable — so async
validators are wrapped explicitly, carrying a marker the compiler reads. That
is the pattern already used for `SAFE_RESULT` and `JSON_SCHEMA`:

```ts
const userSchema = typer.schema({
    email: typer.asyncRefine(isEmail, async (e) => !(await emailTaken(e)), 'email already registered'),
});

await typer.parseAsync(userSchema, payload);
```

**Compile-time split.** `compileSchema` already walks every slot, so it can
record whether any slot is async:

- **no async slots** — `parseAsync` runs the existing synchronous checker and
  returns an already-resolved promise. Zero cost, and the common case.
- **async slots present** — a separate async walker awaits those slots and runs
  the rest synchronously, collecting into the same `issues` array.

**Concurrency.** Async constraints are usually independent I/O, so the async
walker should start every async slot and `await Promise.all`, not await them in
sequence. Sequential awaits would make a five-field form five round trips.

**Standard Schema needs no change.** The spec already allows
`~standard.validate` to return `Result | Promise<Result>`, so an async schema
is still a valid Standard Schema and frameworks handle it as-is.

**`parse`/`safeParse` must refuse an async schema** rather than silently
validating only the synchronous slots. A schema carrying an async slot passed
to the synchronous entry point should throw a clear error naming the slot.

### 4.3 The audit's reservation stands

> "spesso questi controlli stanno meglio nel livello di servizio che nello
> schema. Da valutare sulla base di richieste reali, non in anticipo."

That is still right. Uniqueness checks belong in a service layer far more often
than in a schema, and this is the largest change in the plan. **Recommendation:
do P2-7 first, ship it, and build P2-4 only if it is actually asked for.** The
design above exists so the modularization does not accidentally make it harder.

---

## 5. What else belongs in 5.0

The audit's P0-2 offered three options for undeclared keys. 4.1 shipped
option (b) — strip the dangerous ones. Option (a) — **`strict` as the default**
— was deferred precisely because it is a breaking change, and 5.0 is where it
belongs:

```ts
parse(schema, payload);                      // rejects undeclared keys
parse(schema, payload, { strict: false });   // today's behaviour, explicit
```

Also worth deciding for 5.0 (all breaking, all optional):

- **Retire the legacy surface.** `validate`, `assert` and `expect` (157 lines)
  predate `parse`/`safeParse` and duplicate them with weaker typing.
  `checkStructure` is the exception — it is the documented dynamic-schema
  escape hatch and should stay.
- **Declarative constraints in type strings.** `'string(3,50)'` or
  `{ type: 'string', min: 3, max: 50 }`, the other half of P1-1. 4.1 shipped
  the issue codes; the declarative syntax was deferred because it changes
  `ResolveTypeString` and `ValidateSchema`. It is also what would let
  `toJSONSchema` emit `minLength`/`maxLength` instead of `{}` for a
  constrained slot.

---

## 6. Sequencing

| Step | Work | Breaking |
| --- | --- | --- |
| 1 | ~~Type-level spike: registry through `options`~~ — **done, see §3.4** | no |
| 2 | ~~Move the compiler and entry points to `core/`~~ — **done** | no |
| 3 | ~~Split validators and combinators into modules~~ — **done** | no |
| 4 | ~~Re-express the size budget per entry point~~ — **done** | no |
| 5 | ~~`strict` by default~~ — **done** | **yes** |
| 6 | ~~Declarative constraints + the JSON Schema keywords~~ — **done** | no |
| 7 | ~~Retire `validate` / `assert` / `expect`~~ — **done** | **yes** |
| 8 | ~~`parseAsync`~~ — **done** | no |

Steps 1–4 could ship as **4.2**, since nothing in them breaks. That would get
the bundle win to consumers without waiting for the breaking changes to be
agreed — worth considering, because the bundle win is the whole point.

---

## 7. Open questions

1. **Does the class stay forever, or is it deprecated on a timetable?** The
   plan assumes forever. Deprecating it would let 6.0 delete the facade.
2. ~~**Is `createRegistry` the right shape?**~~ **Answered by the spike (§3.4):**
   keep it, and pair it with `createTyper(aliases)` so the registry is bound
   once instead of passed on every call.
3. **Ship steps 1–4 as 4.2**, or hold everything for one 5.0?
4. **Is `parseAsync` wanted at all**, or is the service layer the right home?

---

*Measurements in this document: Node 26.8.1, darwin arm64, rollup + terser from
this repository's devDependencies, gzip level 9. The prototype lives outside
the repository; it is a measuring instrument, not a deliverable, and should be
rebuilt from scratch when the work starts.*
