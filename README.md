# Typer - Advanced TypeScript Type Validation Library

![Coverage Badge](https://img.shields.io/badge/coverage-96.97%25-brightgreen)
![Build Status](https://img.shields.io/badge/build-passing-success)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9.3-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Version](https://img.shields.io/badge/version-3.0.0-blue)

Typer is a comprehensive TypeScript validation library that provides robust type checking, schema validation, and runtime type safety. Built with modern TypeScript features including generics, type guards, and advanced type inference.

## ✨ Key Features

- **🔍 Comprehensive Type System**: Support for all JavaScript types including advanced types (BigInt, TypedArrays, etc.)
- **🎯 Generic Type Safety**: Full TypeScript generic support with type inference
- **📋 Schema Validation**: Complex nested object structure validation with strict mode
- **🔧 Extensible Architecture**: Register custom types and validators  
- **⚡ High Performance**: Optimized validation with 96.97% test coverage
- **🛡️ Runtime Safety**: Catch type errors at runtime with detailed error messages
- **📱 Phone Number Validation**: International phone number validation (ITU-T E.164 standard)
- **📧 Advanced Validations**: Email, URL, and other common format validations

## 📦 Installation

```bash
npm install @illavv/run_typer
```

## � Quick Start

```typescript
import { Typer } from '@illavv/run_typer';

const typer = new Typer();

// Basic type checking with generics
const message = typer.isType<string>('string', 'Hello World');
const count = typer.isType<number>('number', 42);

// Type guards
if (typer.is<string>(userInput, 'string')) {
    // userInput is now typed as string
    console.log(userInput.toUpperCase());
}
```

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

### Schema Validation

#### `checkStructure(schema: Record<string, unknown>, obj: Record<string, unknown>, path?: string, strictMode?: boolean): StructureValidationReturn`
Validates object structure against schema. Returns `{isValid: boolean, errors: string[]}`.

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

## 🧪 Testing

Typer has **96.97% test coverage** with 197 comprehensive tests covering:

- All type validators and edge cases
- Schema validation scenarios
- Custom type registration
- Function wrapping and validation
- Error handling and edge cases
- TypeScript generic integration

```bash
npm test                # Run tests
npm run test:watch     # Watch mode
npm run test:coverage  # Coverage report
```

## 🏗️ Building

```bash
npm run build          # Build all formats
npm run build:docs     # Build with documentation
```

Outputs:
- `dist/Typer.min.js` - UMD format
- `dist/Typer.esm.min.js` - ES modules
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