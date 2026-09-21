# Typer 5.0 — plan

> Status: **proposal, not committed work.** Nothing here is implemented.
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

### Where today's 9.69 KB goes

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

### 3.4 Risks

- **Type inference is the hard part, not the runtime.** `Infer`,
  `ValidateSchema` and `KnownAlias` currently thread `TRegistry` through the
  class's type parameter. With a free `parse`, the registry has to come from
  the `options` argument, so `parse(schema, value, { registry })` must infer
  the alias map from `typeof registry`. This needs a spike before anything
  else is committed; the existing type-level test suite is the safety net.
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
| 1 | Type-level spike: registry through `options`, not a class type parameter | no |
| 2 | Move the compiler and entry points to `core/`, class becomes a facade | no |
| 3 | Split validators and combinators into modules, one export each | no |
| 4 | Re-express the size budget per entry point; document the free-function API as primary | no |
| 5 | `strict` by default | **yes** |
| 6 | Declarative constraints + the JSON Schema keywords they unlock | no |
| 7 | Retire `validate` / `assert` / `expect` | **yes** |
| 8 | `parseAsync`, only if asked for | no |

Steps 1–4 could ship as **4.2**, since nothing in them breaks. That would get
the bundle win to consumers without waiting for the breaking changes to be
agreed — worth considering, because the bundle win is the whole point.

---

## 7. Open questions

1. **Does the class stay forever, or is it deprecated on a timetable?** The
   plan assumes forever. Deprecating it would let 6.0 delete the facade.
2. **Is `createRegistry` the right shape**, or should custom aliases be dropped
   in favour of plain validator functions in schema slots? Slots already accept
   validators, so the registry may be redundant surface — and dropping it would
   remove the hardest part of the type-level work.
3. **Ship steps 1–4 as 4.2**, or hold everything for one 5.0?
4. **Is `parseAsync` wanted at all**, or is the service layer the right home?

---

*Measurements in this document: Node 26.8.1, darwin arm64, rollup + terser from
this repository's devDependencies, gzip level 9. The prototype lives outside
the repository; it is a measuring instrument, not a deliverable, and should be
rebuilt from scratch when the work starts.*
