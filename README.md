# Typer - Advanced TypeScript Type Validation Library

![Coverage Badge](https://img.shields.io/badge/coverage-97%25%20lines-brightgreen)
![Build Status](https://img.shields.io/badge/build-passing-success)
![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Version](https://img.shields.io/badge/version-4.1.0-blue)

Typer is a comprehensive TypeScript validation library that provides robust type checking, schema validation, and runtime type safety. Built with modern TypeScript features including generics, type guards, and advanced type inference.

## ✨ Key Features

- **🔍 Comprehensive Type System**: Support for all JavaScript types including advanced types (BigInt, TypedArrays, etc.)
- **🎯 Type-checked schemas**: `Infer<typeof schema>` derives the static type from the runtime schema, and a typo like `'nubmer'` is a **compile error**, not a runtime surprise *(4.0+)*
- **🧩 Composable validators**: `literal`, `arrayOf`, `record`, `tuple`, `refine`, `transform`, `withDefault`, `lazy`, `objectOf` — all nest freely *(4.0+)*
- **🔎 Structured errors**: every failure carries `code`, `path`, `expected` and `received`, so you branch on data instead of parsing strings *(4.0+)*
- **🤝 [Standard Schema](https://standardschema.dev)**: `typer.standard(schema)` is accepted by tRPC, Hono, TanStack Form and Router, Nuxt and the rest — no adapter *(4.1+)*
- **📋 Schema Validation**: Complex nested object structure validation with strict mode
- **🔧 Extensible Architecture**: Register custom types with `extend()` and keep full type inference
- **🪶 Small and instant**: under 10 KB gzip, and building a schema costs ~1.1 µs — the lowest setup cost of the three libraries measured. See [Performance](#-performance) for where it wins and where it does not
- **📐 JSON Schema output**: `toJSONSchema()` for OpenAPI and Swagger tooling *(4.1+)*
- **🛡️ Runtime Safety**: Catch type errors at runtime with detailed error messages
- **📱 Phone Number Validation**: International phone number validation (ITU-T E.164 standard)
- **📧 Advanced Validations**: Email, URL, UUID, IP, semver, slug, JWT, MAC and more

## 📦 Installation

```bash
npm install @illavv/run_typer
```

## � Quick Start

```typescript
import { Typer } from '@illavv/run_typer';

const typer = new Typer();

// 3.1+: pass a literal alias and the return type is inferred — no <generic> needed
const message = typer.isType('string', 'Hello World');  // message: string
const count = typer.isType('number', 42);                // count: number

// Type guards narrow automatically from the literal alias
if (typer.is(userInput, 'string')) {
    // userInput is now typed as string
    console.log(userInput.toUpperCase());
}

// Non-throwing variant
const result = typer.safeParse('number', userInput);
if (result.success) {
    // result.data: number
}
```

### 🪄 Typed schema parsing — write the schema once, get the type for free *(3.2+)*

```typescript
import { Typer, type Infer } from '@illavv/run_typer';

const typer = new Typer();

// One literal drives both runtime validation and the static type
const user = typer.parse(
    { id: 'number', name: 'string', email: 'string?' },
    payload,
);
// user is typed: { id: number; name: string; email?: string | null }

// Reusable schemas with derived types — no `as const` needed
const userSchema = typer.schema({
    id: 'number',
    name: 'string',
    email: 'string?',
    tags: ['string'],
    address: { city: 'string', zip: 'string?' },
});
type User = Infer<typeof userSchema>;

const u  = typer.parse(userSchema, payload);     // throws + typed as User
const r  = typer.safeParse(userSchema, payload); // { success, data: User } | { error }
```

Mix-and-match validator functions inside a schema — any slot accepts a
`Validator<T>`, whether from a built-in helper, a combinator, or your own:

```typescript
const strict = typer.schema({
    id:    typer.validators.isPositiveInteger,
    name:  typer.validators.isNonEmptyString,
    color: (v) => typer.isHexColor(v),
    role:  typer.literal('admin', 'user', 'guest'),
});
```

> **Use `typer.validators.isX`, not `typer.isX`, when passing a validator as a
> value.** A bare method reference loses its `this` and fails even on valid
> input. `typer.validators` holds the same validators, pre-bound; wrapping in an
> arrow — `(v) => typer.isX(v)` — works just as well.

> Note: a type string like `'admin|user|guest'` means "one of these **type
> aliases**", not "one of these values". Use `typer.literal(...)` for specific
> values.

### 🛑 Typos are compile errors *(4.0+)*

A misspelled alias used to infer `unknown` and blow up at runtime. Now it does
not compile:

```typescript
typer.parse({ id: 'nubmer' }, payload);
//                ~~~~~~~~
// Type '"nubmer"' is not assignable to type
// '`Typer: unknown type alias in "nubmer" — register it with extend() or fix the spelling`'
```

This covers unions, optionals, array elements and nested schemas:

```typescript
typer.schema({ a: 'number|strng' });   // ❌
typer.schema({ b: 'nubmer?' });        // ❌
typer.schema({ c: ['strng'] });        // ❌
typer.schema({ d: { e: 'strng' } });   // ❌
```

Dynamically built schemas carry no literal information to check, so they are
still accepted:

```typescript
const dynamic: Record<string, string> = buildSchema();
typer.checkStructure(dynamic, payload); // fine
```

### 🔎 Structured errors *(4.0+)*

Every failure carries machine-readable issues, so you branch on data rather
than parsing messages:

```typescript
const result = typer.safeParse(
    { id: 'number', address: { city: 'string' } },
    { id: 'nope', address: { city: 1 } },
);

if (!result.success) {
    result.issues;
    // [
    //   { code: 'invalid_type', path: 'id',           expected: 'number', received: 'string', message: '…' },
    //   { code: 'invalid_type', path: 'address.city', expected: 'string', received: 'number', message: '…' },
    // ]
}
```

Paths use dotted and indexed notation (`address.city`, `tags[2]`). `code` is
one of:

| Code | Meaning | Extra fields |
|---|---|---|
| `invalid_type` | present, but not one of the expected types | `expected`, `received` |
| `missing_key` | a required key was absent | `expected` |
| `unknown_type` | the schema named an alias that is not registered | `expected` |
| `invalid_schema` | the schema itself is malformed | `expected`, `received` |
| `unexpected_key` | strict mode: a key the schema does not declare | |
| `too_small` | below a lower bound — too short, too few, too small *(4.1+)* | `minimum` |
| `too_big` | above an upper bound — too long, too many, too large *(4.1+)* | `maximum` |
| `invalid_format` | right type, wrong shape: not an email, not a UUID, not an integer *(4.1+)* | `expected` |
| `dangerous_key` | an unsafe key could not be stripped *(4.1+)* | |
| `custom` | a validator in the schema threw without reporting a reason | |

Constraint validators carry their code all the way out, whether called directly
or from inside a schema — which is what makes "too short" tellable from "out of
range" without reading the message:

```typescript
const result = typer.safeParse({
    name: (v) => typer.isLength({ min: 3, max: 50 }, v),
    pin:  (v) => typer.isInRange(1000, 9999, v),
}, { name: 'ab', pin: 42 });

result.issues;
// [
//   { code: 'too_small', path: 'name', minimum: 3,    message: '…' },
//   { code: 'too_small', path: 'pin',  minimum: 1000, maximum: 9999, message: '…' },
// ]
```

`parse` throws a `TyperError`, which extends `TypeError` — existing
`instanceof TypeError` handling keeps working:

```typescript
import { TyperError } from '@illavv/run_typer';

try {
    typer.parse(userSchema, payload);
} catch (e) {
    if (e instanceof TyperError) {
        e.issues;    // the structured list
        e.flatten(); // { 'address.city': ['Expected "address.city" to be string, got number'] }
    }
}
```

> `result.error` is built on first access. Reading only `result.issues` skips
> constructing an `Error` — whose stack capture costs more than the validation
> itself.

### 📐 JSON Schema output *(4.1+)*

`toJSONSchema()` turns a schema into the document OpenAPI and Swagger tooling
expects:

```typescript
typer.toJSONSchema({ id: 'number', email: typer.validators.isEmail, note: 'string?' });
// {
//   $schema: 'https://json-schema.org/draft/2020-12/schema',
//   type: 'object',
//   properties: {
//     id:    { type: 'number' },
//     email: { type: 'string', format: 'email' },
//     note:  { type: ['string', 'null'] },
//   },
//   required: ['id', 'email'],
// }
```

Type strings, `?` markers, `|` unions, arrays and nested objects have exact
equivalents. Validators do not — a validator is an opaque function — so Typer's
own validators and combinators carry the fragment they correspond to:

| Slot | Emitted |
|---|---|
| `typer.validators.isEmail` | `{ type: 'string', format: 'email' }` |
| `typer.literal('a', 'b')` | `{ enum: ['a', 'b'] }` |
| `typer.arrayOf(v, { min: 1 })` | `{ type: 'array', items: …, minItems: 1 }` |
| `typer.tuple([a, b])` | `{ type: 'array', prefixItems: […], minItems: 2, maxItems: 2 }` |
| `typer.record(v)` | `{ type: 'object', additionalProperties: … }` |
| `typer.optional(v)` | the inner fragment, key dropped from `required` |
| `typer.withDefault(v, 10)` | the inner fragment plus `default: 10` |
| `typer.discriminatedUnion(k, …)` | `{ oneOf: […], discriminator: { propertyName: k } }` |

A validator *you* wrote becomes `{}` — which accepts anything — as do the
aliases JSON cannot carry (`symbol`, `function`, `map`, `set`, `regexp`, the
buffer types) and anything registered with `extend`. Pass
`{ unrepresentable: 'throw' }` in a build step to be told about those instead of
shipping a schema that quietly accepts anything at those keys:

```typescript
typer.toJSONSchema(schema, { unrepresentable: 'throw' });
// TyperError: Cannot convert to JSON Schema: 1 slot(s) have no equivalent — session
```

`{ strict: true }` emits `additionalProperties: false`, and `{ $schema: false }`
omits the dialect keyword for embedding in a larger document.

### 🔁 Coercion *(4.1+)*

Query strings, form data and environment variables arrive as strings. Without
coercion, every handler rewrites the conversion by hand — which is where the
mistakes are:

```typescript
const query = typer.parse({
    page:     typer.coerce.number,
    archived: typer.coerce.boolean,
    since:    typer.coerce.date,
}, req.query);
// { page: 2, archived: false, since: Date }
```

The converted value replaces the original in place, so what comes out of
`parse` holds numbers and dates rather than the strings that arrived.

These reject what they cannot convert instead of inventing a value, which is the
whole difference from the `Number()` / `Boolean()` they replace:

| Input | `Number()` / `Boolean()` | `typer.coerce.*` |
|---|---|---|
| `''` | `0` | rejected |
| `'   '` | `0` | rejected |
| `null` | `0` | rejected |
| `[]` | `0` | rejected |
| `'abc'` | `NaN` | rejected |
| `'false'` | `true` | `false` |
| `'0'` | `true` | `false` |

`coerce.boolean` reads `true`/`1`/`yes`/`on` and `false`/`0`/`no`/`off`, in any
case and with surrounding whitespace; anything else is rejected rather than
guessed at.

### 🧬 Deriving schemas from schemas *(4.1+)*

Real applications derive shapes from each other constantly. Writing the second
copy by hand means the two diverge at the first change:

```typescript
const userSchema = typer.schema({
    id: 'number',
    name: 'string',
    email: 'string',
    password: 'string',
});

const publicUser = typer.pick(userSchema, ['id', 'name']);
const createUser = typer.omit(userSchema, ['id']);
const patchUser  = typer.partial(typer.omit(userSchema, ['id', 'password']));
const timestamped = typer.merge(userSchema, { createdAt: 'date' });

type PatchUser = Infer<typeof patchUser>;
// → { name?: string | null; email?: string | null }
```

All four return a plain new schema and leave the sources untouched, so the
result parses, infers and composes like any other. `merge` lets the second
schema win on overlapping keys.

> `partial` gives a type-string slot the `?` marker it already understands.
> Slots with no marker of their own — a validator, an array, a nested schema —
> are rebuilt as `optional(...)` validators instead, so a *made-optional* nested
> slot reports its failures as one `custom` issue at the slot's path rather than
> one per field. Pass the keys you need if that matters:
> `typer.partial(schema, ['name', 'email'])`.

### 🛡️ Validated means safe to merge *(4.1+)*

Typer validates in place and returns the same reference it was given. That is
what makes it fast, and it used to mean that keys the schema never declared —
including `__proto__` and `constructor` from a `JSON.parse` payload — survived
a `success: true`:

```typescript
const payload = JSON.parse('{"id":1,"__proto__":{"admin":true}}');
typer.parse({ id: 'number' }, payload);

Object.keys(payload);        // ['id']  — was ['id', '__proto__'] before 4.1
{ ...payload }.admin;        // undefined — the spread that used to matter
```

`__proto__`, `constructor` and `prototype` are now removed from every validated
object unless the schema declares them as fields of its own, in which case they
are ordinary keys and are validated like any other. Nothing else about extra
keys changes: use `strict` mode if you want *all* undeclared keys rejected.

If the object is frozen and the key cannot be removed, validation fails with a
`dangerous_key` issue rather than passing an object it could not make safe.

The check costs ~2.5 ns per object: a cheap probe that only falls through to the
exact `hasOwnProperty` test when an object is not a plain, unpolluted one.

### 🤝 Standard Schema *(4.1+)*

[Standard Schema](https://standardschema.dev) is the common contract that lets a
validation library be accepted by tRPC, Hono, TanStack Form and Router, Nuxt and
dozens of others without a per-library adapter. `standard()` produces it from a
schema, a validator, or a type alias:

```typescript
import typer from '@illavv/run_typer';

const userSchema = typer.standard({ id: 'number', email: 'string' });

// Any Standard Schema consumer accepts it as-is:
app.post('/users', validator('json', userSchema), handler);       // Hono
publicProcedure.input(userSchema).mutation(({ input }) => …);     // tRPC
```

The result is still an ordinary `Validator`, so it keeps working everywhere a
validator does — including nested inside another schema:

```typescript
userSchema({ id: 1, email: 'a@b.co' });        // returns the value, throws on failure
typer.arrayOf(userSchema);                      // composes like any other validator
```

`objectOf()` carries the contract as well, so an existing `typer.objectOf(...)`
is already a Standard Schema.

Issue paths follow the spec's segment form, while keeping Typer's machine-readable
`code`:

```typescript
userSchema['~standard'].validate({ id: 'one', email: 'a@b.co' });
// {
//   issues: [{
//     code: 'invalid_type',
//     path: ['id'],                            // segments, not 'id'
//     message: 'Expected "id" to be number, got string',
//     expected: 'number',
//     received: 'string',
//   }]
// }
```

Validation is synchronous: `validate` never returns a Promise.

### 🧩 Combinators *(4.0+)*

All of these return a `Validator<T>`, so they compose with each other and slot
into any schema position:

```typescript
const orderSchema = typer.schema({
    id:       typer.validators.isUUID,
    status:   typer.literal('pending', 'shipped', 'cancelled'),
    qty:      typer.refine((v) => typer.asNumber(v), (n) => n > 0, 'qty must be > 0'),
    coupon:   typer.withDefault((v) => typer.asString(v), ''),
    sizes:    typer.arrayOf((v) => typer.asNumber(v), { min: 1, max: 10 }),
    labels:   typer.record((v) => typer.asString(v)),          // Record<string, string>
    position: typer.tuple([(v) => typer.asNumber(v), (v) => typer.asNumber(v)]), // [number, number]
    placedAt: typer.instanceOf(Date),
    slug:     typer.transform((v) => typer.asString(v), (s) => s.trim().toLowerCase()),
    lines:    typer.arrayOf(typer.objectOf({ sku: 'string', qty: 'number' })),
});
```

`discriminatedUnion` covers the payload shape most APIs actually use — a union
told apart by one key *(4.1+)*:

```typescript
const event = typer.discriminatedUnion('type', {
    created: { id: 'string', at: 'date' },
    renamed: { id: 'string', name: 'string' },
    deleted: { id: 'string' },
});

type Event = ReturnType<typeof event>;
// → { type: 'created'; id: string; at: Date }
//  | { type: 'renamed'; id: string; name: string }
//  | { type: 'deleted'; id: string }
```

Unlike `union`, which tries each variant in turn, this reads the discriminant
once and goes straight to the only variant that can match — in constant time,
however many there are — and reports against that variant alone:

```typescript
typer.safeParse(event, { type: 'renamed', id: 'x', name: 42 }).issues;
// [{ code: 'invalid_type', path: 'name', expected: 'string', received: 'number' }]
// not "none of the 3 variants matched, here is why each one failed"
```

Variants are keyed by discriminant value, so the mapping is exact by
construction. Each member carries its own tag as a literal type, so it narrows
on `type` the way a hand-written union does.

`lazy` makes recursive shapes expressible:

```typescript
type Node = { name: string; children?: Node[] };

const node: Validator<Node> = typer.lazy(() => typer.objectOf({
    name: 'string',
    children: typer.optional(typer.arrayOf(node)),
}) as Validator<Node>);
```

### 🔧 Custom types that the compiler knows about *(4.0+)*

`extend()` is `registerType` that also records the alias in the instance's
type, so it works in compile-checked schemas and resolves in `Infer`:

```typescript
const typer = new Typer()
    .extend('positive', (v): number => {
        if (typeof v !== 'number' || v <= 0) throw new TypeError('Must be positive');
        return v;
    })
    .extend('slug', (v): string => new Typer().isSlug(v));

const schema = typer.schema({ qty: 'positive', handle: 'slug' });
type Product = Infer<typeof schema, { positive: number; slug: string }>;
// → { qty: number; handle: string }
```

It returns the same instance, just re-typed, so it chains. `registerType` is
still available when you do not need the alias in the type system.

## 📖 Usage Examples

### ✅ Basic Type Validation

```typescript
import { Typer } from '@illavv/run_typer';

const typer = new Typer();

// Type guards (return boolean)
console.log(typer.is<string>("Hello", "string")); // true
console.log(typer.is<number>(123, "number")); // true
console.log(typer.is<boolean>(true, "boolean")); // true
console.log(typer.is<unknown[]>([], "array")); // true
console.log(typer.is<object>({}, "object")); // true

// Type validation (throws on error)
const str = typer.isType<string>('string', 'Hello'); // Returns 'Hello' typed as string
const num = typer.isType<number>('number', 42); // Returns 42 typed as number
```

### 🎯 Advanced Type Validation

```typescript
const typer = new Typer();

// Multiple type validation
const value = typer.isType<string | number>(['string', 'number'], 'Hello');

// Specific validations
const email = typer.isEmail('user@example.com');
const phone = typer.isPhoneNumber('+1234567890');
const url = typer.isURL('https://example.com');

// Array validations
const numbers = typer.isArrayOf<number>('number', [1, 2, 3]);
const nonEmpty = typer.isNonEmptyArray<string>(['a', 'b']);

// Range and constraints
const age = typer.isInRange(18, 65, 25);
const positiveInt = typer.isPositiveInteger(42);
```

### 🔬 Advanced Types Support

```typescript
const typer = new Typer();

// Modern JavaScript types
const bigIntVal = typer.isType<bigint>('bigint', BigInt(123));
const buffer = typer.isType<ArrayBuffer>('arraybuffer', new ArrayBuffer(8));
const typedArray = typer.isType<Int32Array>('typedarray', new Int32Array(4));
const dataView = typer.isType<DataView>('dataview', new DataView(buffer));

// Collections
const map = typer.isType<Map<string, number>>('map', new Map());
const set = typer.isType<Set<string>>('set', new Set());

// Special validations
const jsonStr = typer.isType<string>('json', '{"valid": "json"}');
const validDate = typer.isType<Date>('date', new Date());
const regex = typer.isType<RegExp>('regexp', /pattern/);
```

### 🏗 Schema-Based Object Validation

```typescript
const typer = new Typer();

const userSchema = {
    name: "string",
    age: "number",
    email: "string?", // Optional field
    address: {
        street: "string",
        city: "string",
        zip: "number|string" // Union types
    },
    hobbies: ["string"], // Array of strings
    isActive: "boolean"
};

const userData = {
    name: "John Doe",
    age: 30,
    address: {
        street: "123 Main St",
        city: "New York",
        zip: 10001
    },
    hobbies: ["reading", "coding"],
    isActive: true
};

const result = typer.checkStructure(userSchema, userData);
if (result.isValid) {
    console.log("✅ Valid user data");
} else {
    console.log("❌ Validation errors:", result.errors);
}

// Strict mode (rejects extra properties)
const strictResult = typer.checkStructure(userSchema, userData, '', true);
```

### � Custom Type Registration

```typescript
const typer = new Typer();

// Register a custom validator
typer.registerType("positive", (value) => {
    if (typeof value !== "number" || value <= 0) {
        throw new TypeError("Value must be a positive number");
    }
    return value;
});

// Register email validator with override
typer.registerType("email", (value) => {
    const email = typer.isType<string>('string', value);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new TypeError('Invalid email format');
    }
    return email;
}, true); // Override existing if present

// Use custom type
console.log(typer.is(10, "positive")); // true
console.log(typer.is(-5, "positive")); // false

// List all types
console.log(typer.listTypes());

// Export/Import types
const typesJson = typer.exportTypes();
typer.importTypes(typesJson);

// Remove custom type
typer.unregisterType("positive");
```

### �️ Function Type Safety

```typescript
const typer = new Typer();

// Single parameter function
const safeMultiply = typer.expect(
    (x: number) => x * 2, 
    {
        paramTypes: ['number'],
        returnType: ['number']
    }
);

console.log(safeMultiply(4)); // 8
// safeMultiply("hello"); // Throws TypeError

// Multiple parameters
const safeAdd = typer.expect(
    (x: number, y: number) => x + y,
    {
        paramTypes: ['number', 'number'], 
        returnType: ['number']
    }
);

// Async function support
const asyncFunc = typer.expect(
    async (x: number): Promise<string> => x.toString(),
    {
        paramTypes: ['number'],
        returnType: ['string']
    }
);

// Multiple return types
const flexibleFunc = typer.expect(
    (x: boolean) => x ? 42 : "string",
    {
        paramTypes: ['boolean'],
        returnType: ['number', 'string']
    }
);
```

## � API Reference

### Core Validation Methods

#### `is<T>(value: unknown, types: string | string[]): value is T`
Type guard that returns boolean. Safe for TypeScript type narrowing.

#### `isType<T>(types: string | string[], value: unknown): T`
Validates type and returns the value cast to T. Throws TypeError on failure.

#### `asString(value: unknown): string`
Validates and returns a string. Alias for `isType<string>('string', value)`.

#### `asNumber(value: unknown): number`
Validates and returns a number.

#### `asBoolean(value: unknown): boolean`
Validates and returns a boolean.

#### `asArray<T>(value: unknown): T[]`
Validates and returns an array.

#### `asObject<T>(value: unknown): T`
Validates and returns an object.

### Specialized Validation Methods

#### `isEmail(value: unknown): string`
Validates email format.

#### `isURL(value: unknown): string`
Validates URL format.

#### `isPhoneNumber(value: unknown): string`
Validates international phone numbers (7-15 digits, ITU-T E.164 standard).

#### `isArrayOf<T>(elementType: string, value: unknown): T[]`
Validates array with specific element type.

#### `isNonEmptyString(value: unknown): string`
Validates non-empty strings.

#### `isNonEmptyArray<T>(value: unknown): T[]`
Validates non-empty arrays.

#### `isOneOf<T>(values: readonly T[], value: unknown): T`
Validates value is one of specified options.

#### `isInRange(min: number, max: number, value: unknown): number`
Validates number within range.

#### `isInteger(value: unknown): number`
Validates integer values.

#### `isPositiveNumber(value: unknown): number`
Validates positive numbers.

#### `isPositiveInteger(value: unknown): number`
Validates positive integers.

#### `isNegativeNumber(value: unknown): number`
Validates negative numbers.

#### `isNegativeInteger(value: unknown): number`
Validates negative integers.

#### `isFiniteNumber(value: unknown): number`
Stricter than `isType('number', x)`: rejects `NaN` and `Infinity`. *(3.1+)*

#### `isSafeInteger(value: unknown): number`
Validates integers within `Number.MIN/MAX_SAFE_INTEGER`. *(3.1+)*

#### `isUUID(value: unknown): string`
Validates UUID strings (RFC 4122, versions 1–5). *(3.1+)*

#### `isIPv4(value: unknown): string` / `isIPv6(value: unknown): string`
Validates IPv4 / IPv6 addresses. *(3.1+)*

#### `isHexColor(value: unknown): string`
Validates CSS hex colors (`#RGB`, `#RGBA`, `#RRGGBB`, `#RRGGBBAA`). *(3.1+)*

#### `isISODate(value: unknown): Date`
Validates an ISO 8601 string and returns the parsed `Date`. *(3.1+)*

#### `isBase64(value: unknown, opts?: { urlSafe?: boolean, requirePadding?: boolean }): string`
Validates Base64 strings. *(3.1+)*

#### `isPlainObject<T>(value: unknown): T`
Validates a plain object literal (rejects class instances, arrays, `Map`, `Set`). *(3.1+)*

#### `isPromise<T>(value: unknown): Promise<T>`
Validates a Promise / thenable. *(3.1+)*

#### `isInstanceOf<T>(ctor: new (...args: never[]) => T, value: unknown): T`
Type-safe `instanceof` check. *(3.1+)*

#### `matches(regex: RegExp, value: unknown): string`
Validates a string matches the given regex. *(3.1+)*

#### `isLength<T>(bounds: { min?: number; max?: number }, value: unknown): T`
Validates the length of a string or array. *(3.1+)*

#### `isEmpty(value: unknown): unknown` / `isNonEmpty<T>(value: unknown): T`
Polymorphic emptiness check across string, array, `Map`, `Set`, object. *(3.1+)*

#### `isIP(value: unknown): string`
Validates an IP address of either version. *(4.0+)*

#### `isSemver(value: unknown): string`
Validates a Semantic Versioning 2.0.0 string, pre-release and build metadata included. *(4.0+)*

#### `isSlug(value: unknown): string`
Validates a URL-friendly slug (`hello-world`). *(4.0+)*

#### `isPort(value: unknown): number`
Validates a TCP/UDP port number (1–65535; `0` is rejected). *(4.0+)*

#### `isJWT(value: unknown): string`
Validates the *shape* of a JSON Web Token. Does **not** verify the signature — never use it as an authentication check. *(4.0+)*

#### `isMACAddress(value: unknown): string`
Validates a MAC address in colon- or hyphen-separated form. *(4.0+)*

### Combinators *(3.1+)*

#### `nullable<T>(validator: Validator<T>): Validator<T | null>`
Wraps a validator so `null` is also accepted.

#### `optional<T>(validator: Validator<T>): Validator<T | undefined>`
Wraps a validator so `undefined` is also accepted.

#### `union<T extends readonly unknown[]>(...validators): Validator<T[number]>`
Tries each validator in order; succeeds on the first match.

#### `discriminatedUnion<Key, V>(key: Key, variants: V, options?: { strict?: boolean }): StandardValidator<…>` *(4.1+)*
A union told apart by one key. Selects the variant in constant time on the discriminant value and reports against that variant alone. Variants are keyed by discriminant value; each member carries its tag as a literal type.

#### `literal<T>(...values): Validator<T[number]>`
Accepts only the listed literal values, narrowing to their union. *(4.0+)*

#### `arrayOf<T>(element: Validator<T>, bounds?: { min?: number; max?: number }): Validator<T[]>`
Validates every element, reporting all failures at once. *(4.0+)*

#### `record<T>(value: Validator<T>): Validator<Record<string, T>>`
Validates a dictionary object's values. Rejects arrays and `null`. *(4.0+)*

#### `tuple<T>(validators: T): Validator<[...]>`
Validates a fixed-length, heterogeneous array. *(4.0+)*

#### `refine<T>(validator: Validator<T>, predicate: (v: T) => boolean, message: string): Validator<T>`
Adds a constraint without changing the type. *(4.0+)*

#### `transform<T, U>(validator: Validator<T>, transformer: (v: T) => U): Validator<U>`
Maps a validated value. The transformer only ever sees valid input. *(4.0+)*

#### `withDefault<T>(validator: Validator<T>, fallback: T | (() => T)): Validator<T>`
Substitutes a default for `undefined` (not for `null`). Pass a factory for object/array defaults so instances are not shared. *(4.0+)*

#### `lazy<T>(factory: () => Validator<T>): Validator<T>`
Defers construction, which is what makes recursive shapes expressible. Runs the factory once. *(4.0+)*

#### `instanceOf<T>(ctor): Validator<T>`
Composable form of `isInstanceOf`. *(4.0+)*

#### `objectOf<S>(schema: S, options?: { strict?: boolean }): StandardValidator<Infer<S>>`
Turns a schema into a validator, so object shapes nest inside the other combinators. The result also carries `~standard`. *(4.0+, Standard Schema in 4.1+)*

#### `standard<S>(target: S, options?: { strict?: boolean }): StandardValidator<T>`
Wraps a schema, validator or type alias as a [Standard Schema](https://standardschema.dev), so it is accepted by tRPC, Hono, TanStack Form and Router, Nuxt and others with no adapter. The result stays a callable `Validator`. *(4.1+)*

#### `validators`
The `is*` / `as*` validators, pre-bound to the instance, so they can be passed as values without losing `this`. Built on first access and cached. *(4.0+)*

#### `coerce`
`coerce.number`, `coerce.boolean`, `coerce.date` — validators that convert before validating, for query strings, form data and environment variables. They reject what they cannot convert (`''`, `null`, `[]`, `'abc'`) instead of producing `0`, and read `'false'` as `false`. *(4.1+)*

### Non-throwing API *(3.1+)*

#### `safeParse<K>(types, value): ParseResult<TypeMap[K]>`
Same input as `parse`, returns a discriminated union instead of throwing:
`{ success: true, data } | { success: false, issues, error }`.

`issues` is a `ValidationIssue[]` — `{ code, path, message, expected?, received? }`.
`error` is a `TyperError` (which extends `TypeError`) built lazily on first
access, so reading only `issues` avoids the cost of capturing a stack trace.
*(`issues` added in 4.0)*

### Schema Validation

#### `parse<S>(schemaOrTypeOrValidator, value): T` *(3.2+)*
Universal entry point. Accepts a type alias, an array of aliases, a
`Validator<T>` function, or a `Schema` object. Throws `TypeError` on
failure; on success returns the value typed via `Infer<S>` (for
schemas) or `TypeMap[K]` (for type aliases).

#### `safeParse<S>(schemaOrTypeOrValidator, value): ParseResult<T>` *(3.2+ for schema overload)*
Non-throwing variant. Returns
`{ success: true, data } | { success: false, error: TypeError }`.

#### `toJSONSchema<S>(schema: S, options?: ToJSONSchemaOptions): JSONSchemaDocument` *(4.1+)*
Converts a schema into a JSON Schema document (draft 2020-12 by default), for OpenAPI and Swagger tooling. Options: `$schema` (dialect, or `false` to omit), `id`, `title`, `description`, `strict` (emits `additionalProperties: false`), and `unrepresentable` (`'any'` by default, `'throw'` to fail on slots with no JSON Schema equivalent).

#### `pick<S, K>(schema: S, keys: readonly K[]): PickSchema<S, K>` *(4.1+)*
Derives a schema keeping only the listed keys. Returns a new schema; the source is untouched.

#### `omit<S, K>(schema: S, keys: readonly K[]): OmitSchema<S, K>` *(4.1+)*
Derives a schema without the listed keys — the complement of `pick`.

#### `merge<A, B>(base: A, extension: B): MergeSchema<A, B>` *(4.1+)*
Combines two schemas. Keys of `extension` win where the two overlap.

#### `partial<S, K>(schema: S, keys?: readonly K[]): PartialSchema<S, K>` *(4.1+)*
Makes every key optional, or only the listed ones. Type-string slots gain the `?` marker; validator, array and nested-schema slots are rebuilt as `optional(...)` validators and report failures as a single `custom` issue at the slot path.

#### `schema<const S>(definition: S): S` *(3.2+)*
Identity helper that preserves literal types of a schema declared in a
variable. Use it to derive `Infer<typeof schema>` without `as const`.

#### `Infer<S>` *(3.2+, type-only export)*
Derives a TypeScript type from a runtime schema literal — handles
`?`-suffix optionals, `|`-unions, array elements, nested objects, and
embedded `Validator<T>` functions.

#### `checkStructure(schema: Record<string, unknown>, obj: Record<string, unknown>, path?: string, strictMode?: boolean): StructureValidationReturn`
Validates object structure against schema. Returns `{isValid: boolean, errors: string[]}`.
Lower-level than `parse` — kept for backward compatibility and for the
strict-mode entry point.

### Type Management

#### `registerType(name: string, validator: (value: unknown) => unknown, override?: boolean): void`
Registers custom type validator.

#### `unregisterType(name: string): void`
Removes registered type.

#### `listTypes(): string[]`
Returns all registered type names.

#### `exportTypes(): string`
Exports types as JSON string.

#### `importTypes(json: string): void`
Imports types from JSON string.

### Function Wrapping

#### `expect(func: Function, types: TyperExpectTypes): Function`
Wraps function with type checking for parameters and return value.

#### `validate(schema: Record<string, string | string[]>, obj: Record<string, unknown>): string[]`
Validates object against simple schema, returns error array.

#### `assert(value: unknown, expectedType: string | string[]): void`
Logs warning if type assertion fails.

### Supported Types

**Primitives**: `string`, `number`, `boolean`, `bigint`, `symbol`, `undefined`, `null`

**Objects**: `object`, `array`, `function`, `date`, `regexp`, `map`, `set`

**Advanced**: `arraybuffer`, `dataview`, `typedarray`, `json`, `domelement`

**Aliases**: Short forms like `s`/`str` for `string`, `n`/`num` for `number`, etc.

## ⚡ Performance

### Where Typer wins, and where it does not

Validation libraries are usually sold on speed. Typer's honest position is
narrower and worth stating plainly, because a library that says where it loses
is easier to trust on where it wins.

From the 4.0.0 audit, against `zod` 4.6.5 and `@sinclair/typebox` 0.34.52 on
Node 26 / darwin arm64, each library measured in its own equivalent-work lane:

| Scenario | Typer | Zod | TypeBox JIT | |
| --- | ---: | ---: | ---: | --- |
| Schema setup | **1.13 µs** | 5.74 µs | 3.43 µs | 🥇 |
| Bundle (gzip) | **7.0 KB** | 92 KB | 22.4 KB | 🥈 * |
| Flat object, valid | 90 ns | 68 ns | 3.3 ns | 🥉 |
| Nested object, 25 items | 1.74 µs | 807 ns | 191 ns | 🥉 |
| Flat object, invalid | 404 ns | 354 ns | 1.05 µs | 🥈 |
| Deep nested, invalid | 2.07 µs | 1.27 µs | 15.19 µs | 🥈 |

<sub>* behind `zod/mini` at 4.8 KB. Those bundle figures are 4.0.0's; 4.1 added
Standard Schema, schema composition, coercion, discriminated unions and JSON
Schema output, and `npm run size` now reports **9.7 KB gzip** for the full ESM
bundle. None of it can be tree-shaken away by a consumer who does not use it,
because the API hangs off a class instance — which is what the 5.0
modularization is for.</sub>

**On the hot path Typer is slower than Zod, and about nine times slower than a
compiled TypeBox.** That is not a problem in itself — 90 ns is far below the
point where validation is visible inside an HTTP handler — but it is not the
reason to choose Typer either. The three real wins are **instant setup**, a
**small bundle**, and **schemas that read like the shape they describe**.

### Hoist your schemas

Compiled checkers are cached by schema **object identity**. A schema literal
written inside a handler is a new object on every call, so it is recompiled
every time — about an order of magnitude slower, and silent, because the code
looks perfectly ordinary:

```typescript
const userSchema = typer.schema({ id: 'number' });          // compiled once
app.post('/u', (req) => typer.parse(userSchema, req.body)); // 78 ns

app.post('/u', (req) => typer.parse({ id: 'number' }, req.body)); // 873 ns
```

It is a cost, not a leak: the cache is a `WeakMap`, so the throwaway schema is
collected normally.

### How it is fast where it is

Schemas are compiled to closures once and cached by schema identity; every
type name, optional marker and union alternative is resolved at compile time,
so validating is a flat loop over predicates. Error paths are only built when
something actually fails.

`npm run bench` on Node 26, median of 7 batches (absolute numbers are
machine-dependent):

| Operation | ops/sec |
| --- | ---: |
| `is(value, 'string')` | ~240M |
| `isType('string', value)` | ~165M |
| `isArrayOf('number', 50 items)` | ~45M |
| `parse(flat schema)` — valid | ~24M |
| `parse(nested schema)` — valid | ~8M |
| `checkStructure(nested)` | ~7M |
| `safeParse(nested)` — **invalid** | ~2M |

The last row is the one that changed most in 4.0 (17× faster): a failing
validation no longer throws, catches and rebuilds its own error internally.

> The `is`/`isType` rows measure a few-nanosecond operation and swing widely
> with V8's inlining decisions — treat a change there as noise unless it
> reproduces across runs. The schema rows are stable to within a few percent.

## 🧪 Testing

Typer has **97% line / 99.4% function / 96.9% statement / 91.9% branch coverage**
with 406 tests covering:

- All type validators and edge cases
- Schema validation scenarios
- Custom type registration and built-in overrides
- Structured error reporting
- Combinators and composition
- Function wrapping and validation
- TypeScript generic integration

```bash
npm test               # Jest suite + type-level suite
npm run test:watch     # Watch mode
npm run test:coverage  # Coverage report
npm run test:types     # Type-level assertions only
npm run bench          # Benchmarks
```

The type-level suite (`tests/types/`) is checked by `tsc`, not Jest: it asserts
that `Infer` produces exactly the expected types, and that invalid schemas are
*rejected*. It is part of `npm test`.

> The uncovered lines are the `return p` statements of the built-in checkers.
> Since the predicate fast-path landed, those checkers only ever run to throw —
> see the `TODO(tech-debt)` note in `src/Typer.ts`.

## 🏗️ Building

```bash
npm run build          # Build all formats
npm run build:docs     # Build with documentation
```

Outputs:
- `dist/Typer.min.js` - UMD format
- `dist/Typer.esm.mjs` - ES modules
- `dist/Typer.cjs.min.js` - CommonJS
- `dist/Typer.d.ts` - TypeScript definitions

## � License

MIT License - see [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality  
4. Ensure all tests pass
5. Submit a pull request

## 👤 Author

**Michael Lavigna**
- GitHub: [@lavv425](https://github.com/lavv425)

## � Links

- [GitHub Repository](https://github.com/lavv425/Typer)
- [NPM Package](https://www.npmjs.com/package/@illavv/run_typer)
- [Documentation](https://lavv425.github.io/Typer/)

---

*Built with ❤️ and TypeScript*