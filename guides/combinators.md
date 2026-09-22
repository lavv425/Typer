# Combinators

Combinators take validators and produce validators, so they nest freely and
slot into any schema position.

```typescript
import { arrayOf, objectOf, optional, literal } from '@illavv/run_typer/combinators';
```

Importing `optional` and `arrayOf` alone comes to 0.88 KB — the schema compiler
only arrives when something needs it, which `objectOf` does.

## Optionality and unions

| | |
| --- | --- |
| `nullable(v)` | also accepts `null` |
| `optional(v)` | also accepts `undefined`; makes the key optional in `Infer` |
| `union(a, b, …)` | first match wins; the error lists every variant |
| `literal('a', 'b')` | only those values, narrowed to their union |

## Collections

```typescript
arrayOf(asNumber, { min: 1, max: 10 })   // number[], with length bounds
record(asNumber)                          // Record<string, number>
tuple([asNumber, asString])               // [number, string]
```

`arrayOf` and `tuple` report **every** failing element, not just the first.

`record` drops `__proto__`, `constructor` and `prototype` rather than copying
them: it builds a fresh object, and `out['__proto__'] = value` would set that
object's prototype instead of a field.

## Objects

```typescript
objectOf({ id: 'number', name: 'string' })                  // strict by default
objectOf({ id: 'number' }, { strict: false })               // accept extra keys
objectOf({ qty: 'positive' }, { registry })                 // with custom aliases
```

`objectOf` turns a schema into a validator so object shapes nest inside the
other combinators. The result is also a [Standard Schema](standard-schema.md).

## Discriminated unions

For the `{ type: 'a' | 'b' }` payloads that dominate real APIs:

```typescript
const event = discriminatedUnion('type', {
    created: { id: 'string', at: 'date' },
    renamed: { id: 'string', name: 'string' },
    deleted: { id: 'string' },
});

type Event = ReturnType<typeof event>;
// { type: 'created'; id: string; at: Date }
// | { type: 'renamed'; id: string; name: string }
// | { type: 'deleted'; id: string }
```

Unlike `union`, this reads the discriminant once and goes straight to the only
variant that can match — constant time, however many there are — and reports
against that variant alone:

```typescript
safeParse(event, { type: 'renamed', id: 'x', name: 42 }).issues;
// [{ code: 'invalid_type', path: 'name', expected: 'string' }]
// not "none of the 3 variants matched, here is why each one failed"
```

Variants are keyed by discriminant value, so two of them cannot share a tag.
Each member carries its tag as a literal type, so the result narrows on `type`
the way a hand-written union does. The discriminant counts as declared even
when a variant does not mention it, so strict mode does not flag it.

## Transforming

| | |
| --- | --- |
| `refine(v, predicate, message)` | adds a constraint without changing the type |
| `transform(v, fn)` | maps a validated value; `fn` only ever sees valid input |
| `withDefault(v, fallback)` | substitutes for `undefined` — pass a factory for objects/arrays |
| `lazy(() => v)` | defers construction, which is what makes recursion expressible |
| `instanceOf(Ctor)` | composable `isInstanceOf` |

In a schema slot, a transforming validator's result **replaces** the value —
but only when it actually returns something different, so every `is*`/`as*`
validator and `objectOf` leave the object untouched.

```typescript
const payload = { slug: '  Hello  ' };
parse({ slug: transform(asString, (s) => s.trim()) }, payload);
payload.slug; // 'Hello'
```

Recursive shapes need `lazy`:

```typescript
type Node = { name: string; children?: Node[] };

const node: Validator<Node> = lazy(() => objectOf({
    name: 'string',
    children: optional(arrayOf(node)),
}) as Validator<Node>);
```

## Custom aliases

Two forms. `createTyper` binds a registry once and hands back the entry points:

```typescript
import { createTyper } from '@illavv/run_typer/core';

const { parse, schema } = createTyper({
    positive: (v: unknown): number => {
        if (typeof v !== 'number' || v <= 0) throw new TypeError('Must be positive');
        return v;
    },
});

parse({ qty: 'positive' }, payload);   // { qty: number }
```

`createRegistry` is the unbound form, when you would rather pass it explicitly:

```typescript
import { createRegistry, parse } from '@illavv/run_typer/core';

const registry = createRegistry({ positive: … });
parse({ qty: 'positive' }, payload, { registry });
```

Either way the alias is checked at compile time — `'positiv'` will not compile —
and an alias from a different registry is rejected. To read the inferred type
off a declared schema, `InferWith` takes the registry value rather than a
hand-written map:

```typescript
type Order = InferWith<typeof orderSchema, typeof registry>;
```

A custom alias shadows a built-in of the same name, which is the explicit form
of what `registerType(name, fn, true)` does on the class.
