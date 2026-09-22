# The Typer class

The class is the original API and still the easiest way in — one object, every
method on it, nothing to import piecemeal.

```typescript
import typer from '@illavv/run_typer';        // a shared instance
import { Typer } from '@illavv/run_typer';    // or your own

typer.parse({ id: 'number' }, payload);
typer.isEmail('a@b.co');
typer.toJSONSchema(userSchema);
```

It costs 10.07 KB gzip, because importing it makes every method reachable and a
bundler cannot prove otherwise. That is the trade: convenience for size. If
that matters, the [free entry points](../README.md#what-to-import) are the same
implementations reached directly.

## When you still want it

**Runtime type registration.** `registerType` and `extend` mutate one
instance's alias table, which the free API deliberately replaces with an
explicit registry value:

```typescript
const typer = new Typer()
    .extend('positive', (v): number => {
        if (typeof v !== 'number' || v <= 0) throw new TypeError('Must be positive');
        return v;
    });

typer.schema({ qty: 'positive' });   // alias-checked, inferred as number
```

`extend` returns the same instance re-typed, so it chains. `registerType` is
the untyped equivalent when you do not need the alias in the type system.

**Coercion.** `typer.coerce.number`, `.boolean`, `.date` live here — see
[the validators guide](validators.md#coercion).

**Schema composition.** `pick`, `omit`, `partial` and `merge`.

**`checkStructure`.** The escape hatch for schemas built at runtime, where the
compile-time alias checking cannot help:

```typescript
const result = typer.checkStructure(dynamicSchema, payload);
// { isValid: boolean, errors: string[], issues: ValidationIssue[] }
```

Note its fourth argument is `strictMode`, defaulting to `true` in 5.0 like
everything else. Pass `false` to accept undeclared keys.

**`typer.validators`.** The `is*`/`as*` methods pre-bound to the instance, so
they can be passed as values without losing `this`:

```typescript
typer.schema({ id: typer.validators.isPositiveInteger });
```

Built on first access and cached — binding them all eagerly was measured to
slow every other method down by pushing the object out of V8's fast property
mode.

## Instances are independent

Each `new Typer()` has its own alias table and its own compiled-schema caches,
so registering a type on one never affects another. The free entry points share
a single built-in table, which is safe precisely because nothing can register
into it.

## What was removed in 5.0

`expect`, `validate` and `assert`. They predated `parse`/`safeParse` and
duplicated them with weaker typing — `validate` returned untyped strings,
`assert` only logged a warning, and `expect` type-checked function arguments at
runtime with no compile-time counterpart. See
[MIGRATION.md](../MIGRATION.md#2-expect-validate-and-assert-were-removed).
