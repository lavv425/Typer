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