# Schemas

A schema is a plain object. Every key maps to one of four things: a **type
string**, an **array**, a **nested schema**, or a **validator function**.

```typescript
import { parse, schema } from '@illavv/run_typer/core';
import type { Infer } from '@illavv/run_typer/core';

const orderSchema = schema({
    id:      'number',                      // type string
    tags:    ['string'],                    // array of
    address: { city: 'string' },            // nested
    email:   isEmail,                       // validator
});

type Order = Infer<typeof orderSchema>;
```

## Type strings

| Written | Accepts |
| --- | --- |
| `'string'` | a string |
| `'string?'` | a string, `null`, or the key being absent |
| `'string\|number'` | either |
| `'string(3,50)'` | a string of 3 to 50 characters |
| `'number(1,)'` | a number of at least 1 |
| `'array(,10)'` | an array of at most 10 elements |

Aliases: `string`/`str`/`s`, `number`/`num`/`n`, `boolean`/`bool`/`b`,
`bigint`, `symbol`, `undefined`/`void`, `null`, `array`/`arr`/`a`,
`object`/`obj`/`o`, `date`/`dt`, `regex`/`regexp`, `map`, `set`, `function`/`f`,
`json`/`j`, `array_buffer`/`ab`, `data_view`/`dv`, `typed_array`/`ta`,
`dom`/`domel`.

Case and surrounding whitespace are ignored: `' STRING '` works.

### Typos are compile errors

```typescript
parse({ id: 'nubmer' }, payload);
//          ~~~~~~~~~
// Type '"nubmer"' is not assignable to type
// 'Typer: unknown type alias in "nubmer" — register it with extend() or fix the spelling'
```

This holds inside nested schemas, inside array slots, and whether or not you
pass a registry of custom aliases.

## Optionality

`'string?'` means **absent or `null`**, and `Infer` makes the key optional:

```typescript
type T = Infer<typeof schema>;   // { note?: string | null }
```

If you want "absent or `undefined`" instead, use the `optional` combinator,
which reads as `T | undefined`:

```typescript
import { optional } from '@illavv/run_typer/combinators';

schema({ note: optional((v) => String(v)) });   // { note?: string | undefined }
```

## Bounds

A bound constrains the value, never its type — a bounded string is still a
`string`. Length for strings and arrays, value for numbers. Either end may be
left out.

```typescript
schema({
    name: 'string(2,50)',
    pin:  'number(1000,9999)',
    tags: 'array(1,)',
});
```

Failures report `too_small` or `too_big` with `minimum`/`maximum`, so you can
branch on them without reading the message:

```typescript
safeParse({ name: 'string(3,)' }, { name: 'ab' }).issues;
// [{ code: 'too_small', path: 'name', minimum: 3,
//    message: 'Expected "name" to have length >= 3, got 2' }]
```

In a union, the bound belongs to the alternative it is written on:
`'string(3,)|number'` constrains the string branch and leaves numbers alone.

A malformed bound — `'string(a,b)'`, `'string(1,2,3)'`, `'string(,)'` — is
reported as an error rather than ignored. A constraint that silently does
nothing is worse than one that fails loudly.

## Arrays and nesting

```typescript
schema({
    tags:  ['string'],                     // string[]
    items: [{ sku: 'string', qty: 'number' }],  // { sku: string; qty: number }[]
    meta:  { source: 'string', at: 'date' },
});
```

Array slots take exactly one element definition: a type string, a nested
schema, or a validator. Error paths use indexed notation — `items[2].qty`.

## Undeclared keys are rejected

Since 5.0, a key the schema does not declare is an error:

```typescript
parse({ id: 'number' }, { id: 1, role: 'admin' });
// throws — unexpected_key at "role"

parse({ id: 'number' }, { id: 1, role: 'admin' }, { strict: false });
// returns the object unchanged
```

`__proto__`, `constructor` and `prototype` are a special case: they are
**stripped** rather than reported, so a payload carrying them stays valid and
the object you get back is safe to spread or hand to an ORM.

## Declare schemas once

Compiled checkers are cached by schema **object identity**, so a literal
written inside a handler is a new object every call and is recompiled every
time — about an order of magnitude slower, and silent, because the code looks
perfectly ordinary:

```typescript
const userSchema = schema({ id: 'number' });          // compiled once
app.post('/u', (req) => parse(userSchema, req.body)); // 78 ns

app.post('/u', (req) => parse({ id: 'number' }, req.body)); // 873 ns
```

It is a cost, not a leak — the cache is a `WeakMap`.

## Deriving one schema from another

```typescript
import { pick, omit, partial, merge } from '@illavv/run_typer';

const publicUser  = pick(userSchema, ['id', 'name']);
const createUser  = omit(userSchema, ['id']);
const patchUser   = partial(omit(userSchema, ['id']));
const timestamped = merge(userSchema, { createdAt: 'date' });
```

All four return a new schema and leave the source untouched. `merge` lets the
second schema win where they overlap.

`partial` gives a type-string slot the `?` marker. Slots with no marker of
their own — validators, arrays, nested schemas — are rebuilt as `optional(...)`
validators, which means a *made-optional* nested slot reports its failures as
one `custom` issue at the slot's path rather than one per field. Pass an
explicit key list if that matters: `partial(schema, ['name', 'email'])`.

## Custom aliases

```typescript
import { createTyper } from '@illavv/run_typer/core';

const { parse, schema } = createTyper({
    positive: (v: unknown): number => {
        if (typeof v !== 'number' || v <= 0) throw new TypeError('Must be positive');
        return v;
    },
});

const orderSchema = schema({ qty: 'positive' });  // alias-checked
parse(orderSchema, payload);                       // { qty: number }
```

`createRegistry` is the unbound form, for when you would rather pass the
registry explicitly: `parse(schema, value, { registry })`. Both are covered in
[the combinators guide](combinators.md#custom-aliases).
