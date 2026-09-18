# Migration Guides

- [v3.x → v4.0](#migration-guide-v3x--v40)
- [v2.x → v3.0](#migration-guide-v2x--v30)

---

# Migration Guide: v3.x → v4.0

Most code needs no changes. v4 is a major release because of one compile-time
change, one behaviour fix, and a renamed bundle file.

```bash
npm install @illavv/run_typer@^4.0.0
```

## 1. Schema type strings are checked at compile time

Typos used to infer `unknown` and fail only at runtime. They are now compile
errors.

```typescript
// ❌ Now a compile error — and it always was a bug
typer.parse({ id: 'nubmer' }, payload);
//                ~~~~~~~~
// Type '"nubmer"' is not assignable to type
// '`Typer: unknown type alias in "nubmer" — register it with extend() or fix the spelling`'

// ✅ Fix the spelling
typer.parse({ id: 'number' }, payload);
```

**If you use `registerType` and then name that type inside a schema literal**,
the compiler cannot know about it and will now reject the schema. Switch to
`extend`, which registers the type *and* records it in the instance's type:

```typescript
// ❌ Before — the alias is invisible to the type system
const typer = new Typer();
typer.registerType('positive', (v) => { /* … */ });
typer.schema({ qty: 'positive' }); // compile error in v4

// ✅ After — the alias is known to schemas and to Infer
const typer = new Typer().extend('positive', (v): number => {
    if (typeof v !== 'number' || v <= 0) throw new TypeError('Must be positive');
    return v;
});
const schema = typer.schema({ qty: 'positive' });        // accepted
type Order = Infer<typeof schema, { positive: number }>; // { qty: number }
```

`extend` returns the same instance, just re-typed, and chains. `registerType`
still works unchanged for everything else; `checkStructure` is not
compile-checked at all, so dynamically built schemas keep working:

```typescript
const dynamic: Record<string, string> = buildSchema();
typer.checkStructure(dynamic, payload); // fine
```

## 2. Overriding a built-in alias now actually applies

Since 3.2.2, `registerType('string', fn, true)` was silently ignored by `is`,
`isType` and schema validation — they read from an internal fast-path table
instead of the registry. The override now takes effect everywhere.

If you registered an override and relied (knowingly or not) on the built-in
behaviour still being used, remove the override.

## 3. Some `checkStructure` messages changed

`checkStructure` now shares the compiler with `parse`, which fixes four classes
of misleading message. Only the text changed — `isValid` is unaffected except
where the old message was outright wrong.

| Schema | Old message | New message |
| --- | --- | --- |
| `{ a: 'unknowntype' }` | `Expected "a" to be unknowntype, got string` | `Unknown type: unknowntype` |
| `{ a: ['string?'] }` with `['x']` | `Expected "a[0]" to be string?, got string` | *(now valid)* |
| `{ a: [123] }` with a non-array | `Expected "a" to be an array, got string` | `Array element type must be a string at "a"` |
| `{ a: '' }` with a missing key | `Missing required key "a"` | `Empty type definition at "a"` |

**If you assert on exact error strings, prefer the new structured `issues`** —
they are stable, `errors` is formatted for humans:

```typescript
const result = typer.checkStructure(schema, payload);
result.issues; // [{ code: 'invalid_type', path: 'a', expected: 'number', received: 'string', message: '…' }]
```

## 4. The ESM bundle was renamed

`dist/Typer.esm.min.js` → `dist/Typer.esm.mjs`. The `exports` map is updated, so
`import { Typer } from '@illavv/run_typer'` is unaffected. Only a deep import of
the old file path breaks.

## 5. What you can now delete

Failures carry structured data, so hand-parsing messages is no longer needed:

```typescript
// ❌ Before
const result = typer.safeParse(schema, payload);
if (!result.success) {
    const field = result.error.message.match(/Expected "(.+?)"/)?.[1];
}

// ✅ After
const result = typer.safeParse(schema, payload);
if (!result.success) {
    for (const issue of result.issues) {
        console.error(issue.path, issue.code, issue.expected, issue.received);
    }
}
```

`result.error` still exists and is still a `TypeError` (a `TyperError`, which
extends it). It is now built on first access, so reading only `issues` skips the
cost of capturing a stack trace.

## 6. Passing a validator as a value

If you followed the old README and wrote `{ id: typer.isPositiveInteger }`, that
never worked: the bare method reference loses `this` and fails with
`Cannot read properties of undefined` even for valid input. Use the new
pre-bound accessor, or an arrow:

```typescript
// ❌ Broken (in every version) — fails even on valid input
typer.schema({ id: typer.isPositiveInteger });

// ✅ Either of these
typer.schema({ id: typer.validators.isPositiveInteger });
typer.schema({ id: (v) => typer.isPositiveInteger(v) });
```

---

# Migration Guide: v2.x → v3.0

This guide will help you migrate from Typer v2.x to v3.0.

## 🚨 Breaking Changes Overview

Typer v3.0 introduces significant improvements but requires code changes due to the shift from static methods to instance-based API with full TypeScript generic support.

## 📦 Update Installation

```bash
npm install @illavv/run_typer@^3.0.0
```

## 🔄 API Changes

### 1. Method Signatures with Generics

#### Basic Type Checking
```typescript
// ❌ Before
Typer.is("hello", "string")           // returns boolean
Typer.isType("string", "hello")       // returns any

// ✅ After
typer.is<string>("hello", "string")   // returns boolean with type guard
typer.isType<string>("string", "hello") // returns string (typed)
```

#### Function Validation
```typescript
// ❌ Before
Typer.expect(func, { paramTypes: "string", returnType: "number" })

// ✅ After  
typer.expect(func, { paramTypes: ["string"], returnType: ["number"] })
```

## ✨ New Features Available

### 1. Advanced Validations
```typescript
const typer = new Typer()

// New validation methods
const email = typer.isEmail('user@example.com')
const phone = typer.isPhoneNumber('+1234567890') 
const url = typer.isURL('https://example.com')
const age = typer.isInRange(18, 65, 25)
const count = typer.isPositiveInteger(42)
```

### 2. Type-safe Helpers
```typescript
// New helper methods with full type safety
const str = typer.asString(value)     // Returns string
const num = typer.asNumber(value)     // Returns number
const arr = typer.asArray<string>(value) // Returns string[]
```

### 3. Enhanced Schema Validation
```typescript
const schema = {
    name: "string",
    age: "number",
    email: "string?",              // Optional field
    tags: ["string"],              // Array of strings
    metadata: {                    // Nested objects
        created: "date"
    }
}

const result = typer.checkStructure(schema, data, '', true) // Strict mode
```

### 4. Custom Type Management
```typescript
// Enhanced type registration
typer.registerType("positive", (value) => {
    if (typeof value !== "number" || value <= 0) {
        throw new TypeError("Must be positive number")
    }
    return value
}, true) // Override flag

// Export/Import types
const typesJson = typer.exportTypes()
typer.importTypes(typesJson)
```

## 🔧 Step-by-Step Migration

### Step 1: Update Package
```bash
npm update @illavv/run_typer
```

### Step 2: Fix Imports
Replace all imports:
```typescript
// Find and replace
import Typer from '@illavv/run_typer'
// With
import { Typer } from '@illavv/run_typer'
```

### Step 3: Create Instances
Add instance creation at the top of files using Typer:
```typescript
const typer = new Typer()
```

### Step 4: Update Method Calls
Use find and replace to update static calls:
```typescript
// Find: Typer.
// Replace: typer.
```

### Step 5: Add Generics (Optional but Recommended)
```typescript
// Enhance with generics for better type safety
typer.is<string>(value, 'string')
typer.isType<number>('number', value)
typer.asString(value)
```

### Step 6: Update Function Validation
```typescript
// ❌ Before
Typer.expect(func, { paramTypes: "string", returnType: "number" })

// ✅ After
typer.expect(func, { paramTypes: ["string"], returnType: ["number"] })
```

## 🧪 Testing Your Migration

1. **Install and build** to catch compilation errors
2. **Run your tests** to ensure functionality works
3. **Check TypeScript errors** for improved type safety
4. **Test new features** to leverage enhanced capabilities

## 📋 Migration Checklist

- [ ] Updated package to v3.0
- [ ] Fixed import statements
- [ ] Created Typer instances  
- [ ] Updated method calls from static to instance
- [ ] Added generics where beneficial
- [ ] Updated function validation calls
- [ ] Tested existing functionality
- [ ] Considered new validation methods
- [ ] Updated tests if necessary
- [ ] Verified TypeScript compilation

## 🆕 Recommended Enhancements

After migration, consider using these new features:

### Replace Manual Validations
```typescript
// ❌ Instead of manual email checking
if (!/\S+@\S+\.\S+/.test(email)) throw new Error('Invalid email')

// ✅ Use built-in validation
const validEmail = typer.isEmail(email)
```

### Enhanced Error Handling
```typescript
// ❌ Generic error catching
try {
    Typer.isType('string', value)
} catch (e) {
    console.log('Invalid type')
}

// ✅ Type-specific validation with better errors
try {
    const result = typer.isType<string>('string', value)
} catch (e: TypeError) {
    console.log(`Validation failed: ${e.message}`)
}
```

### Schema Validation Improvements
```typescript
// ✅ Use new schema features
const schema = {
    user: {
        name: "string",
        email: "string",
        age: "number",
        preferences: {
            theme: "string|null",    // Union types
            notifications: "boolean?"  // Optional
        }
    }
}

const result = typer.checkStructure(schema, data, '', true) // Strict mode
if (!result.isValid) {
    console.log('Validation errors:', result.errors)
}
```

## 🆘 Need Help?

- 📖 [Full Documentation](https://lavv425.github.io/Typer/)
- 💬 [GitHub Discussions](https://github.com/lavv425/Typer/discussions)
- 🐛 [Report Issues](https://github.com/lavv425/Typer/issues/new/choose)
- 📝 [Full Changelog](CHANGELOG.md)

## 🎉 Benefits of Upgrading

- **Better Type Safety**: Full TypeScript generic support
- **Enhanced Validations**: 20+ new validation methods
- **Improved Performance**: Optimized algorithms
- **Better Errors**: More descriptive error messages  
- **Advanced Features**: Schema validation, custom types
- **Future-Proof**: Modern TypeScript patterns
- **Comprehensive Testing**: 96.97% test coverage

Take your time with the migration, and enjoy the enhanced capabilities of Typer v3.0! 🚀