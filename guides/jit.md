# Generated validators

`@illavv/run_typer/jit` compiles a schema into a purpose-built JavaScript
function instead of interpreting it. On the schemas in `benchmarks/` it
validates roughly **4× faster** than the default back end.

It is a separate import because it costs something the rest of the library does
not: it calls `new Function`, which a Content-Security-Policy without
`unsafe-eval` forbids. Whether that is acceptable is a decision about your
deployment, not one a validation library should make on your behalf.

```ts
import { compile } from '@illavv/run_typer/jit';

const user = compile({
    id: 'number',
    email: 'string',
    note: 'string?',
});

user.parse(payload);      // throws TyperError, like parse()
user.safeParse(payload);  // { success, data } | { success, issues }
```

## Turning it on everywhere

`compile` is explicit, one schema at a time. If you would rather not change
every call site, `installJit` routes the whole process through the generator:

```ts
// main.ts, once, at startup
import { installJit } from '@illavv/run_typer/jit';

installJit();
```

From then on `parse`, `safeParse`, `parseAsync`, `objectOf`,
`discriminatedUnion` and the `Typer` class all get generated checkers. Nothing
else in your code changes — the two back ends produce identical results.

Schemas are **not** generated immediately. Each one starts on the closure
compiler and is rewritten once it has served 50 validations, so a schema used
twice never pays the compile cost while one in a request handler upgrades
itself after the first few requests. Generating costs 4.9 µs more than
compiling to closures for a flat schema and 14.1 µs for a nested one, against
a saving of 57 ns and 145 ns per validation — it pays for itself after roughly
85 to 100 uses, and the threshold sits comfortably before that.

```ts
installJit({ threshold: 200 });  // wait longer
installJit({ eager: true });     // generate on first sight
```

The warm-up counts per schema *object*, which is what makes it safe against
the throwaway-schema antipattern: a literal written inside a handler is a new
object every call, so it never accumulates uses and never pays for generation.
A hoisted schema warms up. This is the same reason hoisting matters for the
default back end, described in [Performance](performance.md).

`installJit` returns a disposer:

```ts
const stop = installJit();
stop();  // back to the closure compiler
```

### `installJit` is not quite as fast as `compile`

Installing keeps the per-call lookup: `parse` still has to find the checker for
the schema object it was handed, which costs about 10 ns whichever back end
answers. `compile` does that lookup once and hands you the checker, so the hot
path has nothing left to look up.

| nested schema, strict | ns/validation |
| --- | ---: |
| closure compiler | 203.3 |
| `installJit()` | 69.2 |
| `compile()` | 57.1 |

So `installJit` buys most of the win for one line at startup, and `compile`
buys the rest for the schemas where it is worth naming them.

### Applications may install; libraries must not

`installJit` changes the strategy for the whole process. A library that calls
it decides for the application that hosts it, including for schemas the library
never sees. If you are writing a library and want generated code, use
`compile` on your own schemas.

## When it is worth it

`compile` moves work forward: the schema is analysed and a function is built
once, and every validation afterwards is cheap. That only pays off if the
result is reused.

```ts
// Yes — compiled once at module load, used per request.
const user = compile(userSchema);
app.post('/users', (req, res) => user.parse(req.body));

// No — compiles on every request, and is slower than `parse` would have been.
app.post('/users', (req, res) => compile(userSchema).parse(req.body));
```

Unlike `parse`, `compile` does no caching of its own. Calling it twice with the
same schema generates twice. Hold the result.

## What you get, measured

Median of seven batches, Node 26, against the fixtures in `benchmarks/bench.ts`:

| | `parse`/`safeParse` | `compile` | |
| --- | ---: | ---: | ---: |
| flat schema, 3 keys | 13.0M ops/sec | 57.4M ops/sec | 4.4× |
| nested schema, 6 keys + 3 nested | 4.9M ops/sec | 19.9M ops/sec | 4.1× |
| array of 50 numbers | 3.1M ops/sec | 15.0M ops/sec | 4.8× |
| nested schema, failing | 1.7M ops/sec | 3.1M ops/sec | 1.8× |

The failing case gains least, and that is the honest shape of it: once a value
is invalid the cost moves to building issues, which both back ends do the same
way.

Reproduce with `npm run bench`.

## Where the speed comes from

The default back end compiles a schema into an array of closures. Validating
then costs one indirect call per field, one `obj[key]` lookup through a
captured variable, and one path concatenation per nesting level. None of that
can be removed while the shape of the schema is only known as data.

Generating source removes all three:

- fields become `obj.id` property reads, which the engine can inline-cache;
- resolved predicates are called directly rather than through an array;
- paths known at generation time are folded into one string literal, so
  `address.city` costs a single concatenation instead of one per level — and
  only when that field actually fails.

## What it does not generate

The generator specialises type-string slots, nested objects and arrays of type
strings. Every other field — a validator function, a combinator, an array of
objects, a malformed slot — keeps the closure the ordinary compiler built for
it, and the generated function calls that.

This is deliberate. A form the generator has never heard of cannot be
miscompiled, only delegated. It also means a schema built mostly from
combinators will see little gain: there is nothing to specialise, because the
work is the validators themselves.

## Content-Security-Policy

If `new Function` throws, `compile` falls back to the closure compiler and
reports it:

```ts
const user = compile(userSchema);

if (!user.generated) {
    // Running under a CSP without `unsafe-eval`.
    // Still correct, just not generated.
}
```

Behaviour is identical either way — same results, same issues, same messages.
`generated` exists so that a consumer paying the compile cost can tell whether
they are getting anything for it.

To ask before compiling anything:

```ts
import { canGenerate } from '@illavv/run_typer/jit';

if (canGenerate()) { /* … */ }
```

`canGenerate` probes by actually generating, so the answer reflects the policy
in force rather than a guess from the user agent.

## Everything else is unchanged

`compile` takes the same schemas, the same `{ strict }` and `{ registry }`
options, and produces the same `ParseResult` and the same `TyperError` as
[`parse` and `safeParse`](schemas.md).

```ts
import { createRegistry } from '@illavv/run_typer/core';
import { compile } from '@illavv/run_typer/jit';

const registry = createRegistry({
    positive: (v: unknown): number => {
        if (typeof v !== 'number' || v <= 0) throw new TypeError('Must be positive');
        return v;
    },
});

const order = compile({ qty: 'positive' }, { registry });
```

Strict-by-default applies here too; `{ strict: false }` opts out.

The two back ends are held to that by a parity suite: the same corpus of
schemas and payloads runs through both, and every issue must match, field for
field. If they ever disagree, that is a bug in the generator, not a documented
difference.
