# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.2.1] - 2026-04-28

### 🚀 Performance — Closure-compiled schema cache

Replaced the wrapper-only `getCompiledChecker` introduced in 3.2.0 with
a real closure-based compiler. Schemas are now walked **once** at compile
time; the hot path is a tight `for` loop over pre-built closures with
**zero** per-call string parsing, `bind(this)`, or `checkStructure`
recursion.

#### Measured impact (5k iterations, schema with 7 fields + nested object)
- `parse()` (compiled): **~5ms** — `checkStructure` (raw): **~50ms** —
  **3–10× speedup** depending on machine and JIT state.
- 10k repeated `parse()` calls on a tiny cached schema: **~3ms**
  (≥3M ops/sec).

#### How
- `compileSchema(schema)` walks every field once and returns a flat
  `(obj, errors, parentPath) => void` closure.
- `compileField(key, expected)` dispatches to one of four specialized
  compilers (validator-fn, string-type, array-of, nested-object), each
  pre-resolving everything the runtime would otherwise recompute:
  `split('|')`, `trim`, `endsWith('?')`, `slice(0, -1)`, `toLowerCase`,
  and `typesMap[…]` lookups.
- Nested schemas are compiled recursively; their compiled checkers are
  captured by reference so re-entry is just a function call.
- Error messages remain byte-for-byte identical to `checkStructure` —
  every existing test passes unchanged.

### 🧪 Tests
Added `tests/parse-perf.test.ts` with a comparative smoke test
(`parse(compiled)` ≤ 1.2× `checkStructure`) and a cached-throughput test
(10k tiny schemas under 500ms). Total: **254/254 passing**.

## [3.2.0] - 2026-04-28

### ✨ Added — Typed schema parsing (the "Zod-style" win)

A schema literal alone now drives both runtime validation and the
TypeScript type — no separate `interface User { … }` to keep in sync.

```ts
const user = typer.parse(
  { id: 'number', name: 'string', email: 'string?' },
  payload,
);
// user is typed: { id: number; name: string; email?: string | null }
```

#### New methods
- **`parse<S>(schemaOrTypeOrValidator, value)`** — universal entry point.
  Accepts a type alias, an array of aliases, a `Validator<T>` function, or
  a `Schema` object. Throws on failure, returns the inferred typed value
  on success. Uses `<const S>` so no `as const` is needed for inline schema
  literals.
- **`safeParse<S>(schemaOrTypeOrValidator, value)`** — non-throwing variant
  that returns `{ success: true, data: Infer<S> } | { success: false, error }`.
- **`schema<const S>(definition)`** — identity helper that preserves literal
  types when you want to declare a schema in a variable and derive
  `Infer<typeof schema>` from it.

#### New exported types
- **`Infer<S>`** — derives the TypeScript type from a runtime schema literal.
  Handles `?`-suffix optionals, `|`-unions, array elements, nested objects,
  and embedded `Validator<T>` functions.
- **`Schema`**, **`SchemaArrayElement`**, **`ResolveTypeString`**,
  **`ResolveSchemaValue`** — supporting types for the inference machinery.

#### Schema entries can now be validator functions
Schemas accept `Validator<T>` functions in any slot, mixing string aliases
and custom checks:

```ts
const schema = typer.schema({
  id: typer.isPositiveInteger,
  name: typer.isNonEmptyString,
  color: (v) => typer.isHexColor(v),
  email: 'string?',
  role: 'admin|user|guest',
});
```

When a function is supplied, missing-key handling defers to the validator
itself (so `typer.optional(asString)` correctly accepts `undefined`).

### 🚀 Performance
Added an internal `WeakMap` schema-checker cache so repeated `parse()`
calls on the same schema literal skip re-walking the definition. The
implementation is intentionally a thin wrapper today — designed so a
real closure-based compiler can be slotted in later without changing the
public API.

### 🧪 Tests
Added `tests/parse-schema.test.ts` with 20 cases including 5 compile-time
type assertions (`expectType<AssertEqual<…>>()`) that fail in compile if
the inference machinery breaks. Total: **252/252 passing**.

## [3.1.0] - 2026-04-28

### ✨ Added

#### Strongly-typed `isType` / `is` (no more `<string>` boilerplate)
Both methods now have a built-in overload keyed off the new `TypeMap` type.
A literal alias is enough — no manual generic argument needed:

```ts
const s = typer.isType("string", x);  // s: string
if (typer.is(v, "number")) v.toFixed(2);  // narrows automatically
```

#### `safeParse(types, value)` — non-throwing variant
Returns `{ success: true, data } | { success: false, error }` for callers
who prefer functional flows over try/catch.

#### Combinators (composable validators)
- `nullable(validator)` — accepts `null` plus the underlying type.
- `optional(validator)` — accepts `undefined` plus the underlying type.
- `union(v1, v2, …)` — first-match wins, returns the matching variant.

#### New format / shape validators
- `isUUID` (RFC 4122 v1–v5)
- `isIPv4`, `isIPv6`
- `isHexColor` (`#RGB` / `#RGBA` / `#RRGGBB` / `#RRGGBBAA`)
- `isISODate` — returns the parsed `Date`
- `isBase64` (with `urlSafe` and `requirePadding` options)
- `isFiniteNumber` (rejects `NaN` / `Infinity`)
- `isSafeInteger`
- `isPlainObject` (rejects class instances)
- `isPromise`
- `isInstanceOf(ctor, value)`
- `matches(regex, value)`
- `isLength({min, max}, value)` for strings and arrays
- `isEmpty` / `isNonEmpty` (polymorphic over string, array, Map, Set, object)

### 🧪 Tests
Added `tests/extended-validators.test.ts` (~35 cases) covering every new
method plus the new overload behavior. Total: **232/232 passing**.

### 📚 Types
Added new exported types in `src/Types/Typer/index.ts`: `TypeMap`,
`TypeKey`, `ParseResult<T>`, `Validator<T>`.

## [3.0.7] - 2026-04-28

### 🧹 Changed
- Cleaned up dead `const type = typeof p` locals in 7 internal type-checker
  methods (`tBigint`, `tBoolean`, `tFunction`, `tNumber`, `tString`,
  `tSymbol`, `tUndefined`) — the variables were assigned then re-computed
  inline, hiding the actual check.
- Replaced two `any` casts in `expect()` with `unknown`, complying with the
  team-wide "no implicit `any`" rule.

No behavioral or API changes — purely internal hygiene.

## [3.0.6] - 2026-04-28

### 🔧 Fixed
- **TypeScript 6.0 compatibility**: tests no longer fail to compile with `ts-jest 29` + TypeScript 6 due to the new hybrid-module-kind requirement.
  - Enabled `isolatedModules: true` in `tsconfig.json` (warned about explicitly by `ts-jest`).
  - Switched the type-only imports in `src/Typer.ts` to `import type { … }` so the runtime no longer reaches into a type-only module for a non-existent value (which produced `Globals_1.Error is not a constructor`).

## [3.0.1] - 2025-10-02

### 🔧 Fixed
- Minor documentation and test improvements
- Build configuration optimizations

## [3.0.0] - 2025-10-02

### 🎉 Major Release - Complete TypeScript Overhaul

This is a major release with significant improvements, new features, and breaking changes. The library has been completely rewritten with modern TypeScript features, comprehensive testing, and enhanced developer experience.

### ✨ Added

#### 🔥 **New Generic Type System**
- **Full TypeScript Generic Support**: All methods now support generic types with proper type inference
- **Type Guards**: New `is<T>()` method with TypeScript type narrowing support
- **Type-safe Validation**: `isType<T>()` now returns properly typed values
- **Generic Helper Methods**: `asString()`, `asNumber()`, `asBoolean()`, `asArray<T>()`, `asObject<T>()`

#### 🎯 **Advanced Validation Methods**
- **Phone Number Validation**: `isPhoneNumber()` with international ITU-T E.164 standard support (7-15 digits)
- **Email Validation**: Enhanced `isEmail()` with comprehensive format checking
- **URL Validation**: `isURL()` with proper URL format validation
- **Range Validation**: `isInRange(min, max, value)` for numeric constraints
- **Integer Validation**: `isInteger()` for whole number validation
- **Positive/Negative Validation**: `isPositiveNumber()`, `isPositiveInteger()`, `isNegativeNumber()`, `isNegativeInteger()`
- **Non-empty Validation**: `isNonEmptyString()`, `isNonEmptyArray<T>()`
- **Array Type Validation**: `isArrayOf<T>(elementType, array)` for typed array validation
- **One-of Validation**: `isOneOf<T>(allowedValues, value)` for enum-like validation

#### 🏗️ **Enhanced Structure Validation**
- **Recursive Schema Validation**: Deep nested object structure validation
- **Optional Fields**: Support for optional fields with `fieldName?` syntax
- **Union Types**: Schema support for union types like `"string|number"`
- **Array Schemas**: Validation for arrays with specific element types `["string"]`
- **Strict Mode**: Optional strict validation that rejects extra properties
- **Detailed Error Reporting**: Comprehensive error messages with full path information

#### 🔧 **Extended Type Support**
- **Modern JavaScript Types**: `BigInt`, `TypedArray`, `ArrayBuffer`, `DataView`
- **Advanced Collections**: `Map`, `Set` with proper type checking
- **Specialized Types**: `JSON` string validation, `Symbol` support
- **DOM Elements**: `HTMLElement` validation (browser environment)
- **All Primitive Types**: Enhanced support for all JavaScript primitives

#### 📋 **Type Management System**
- **Custom Type Registration**: Enhanced `registerType()` with override support
- **Type Import/Export**: `exportTypes()` and `importTypes()` for type serialization
- **Case-insensitive Types**: Support for case-insensitive type names
- **Type Aliases**: Short-form aliases like `s` for `string`, `n` for `number`

#### 🛡️ **Function Type Safety**
- **Enhanced Function Wrapping**: Improved `expect()` with better parameter validation
- **Promise Support**: Full async function validation with Promise return types
- **Multiple Parameter Types**: Support for functions with multiple typed parameters
- **Flexible Return Types**: Support for multiple possible return types
- **Error Handling**: Better error messages for parameter and return type mismatches

### 🔄 Changed

#### 💥 **Breaking Changes**
- **Class-based API**: Changed from static methods to instance-based API
  ```typescript
  // Before v3.0.0
  Typer.is(value, 'string')
  
  // After v3.0.0
  const typer = new Typer()
  typer.is<string>(value, 'string')
  ```
- **Generic Type Signatures**: All validation methods now use TypeScript generics
- **Error Types**: Changed from generic `Error` to more specific `TypeError` for validation failures
- **API Method Names**: Some methods renamed for consistency (see migration guide)

#### 📈 **Improvements**
- **Performance**: Optimized validation algorithms for better performance
- **Type Safety**: Removed all `any` types in favor of `unknown` and proper generics
- **Error Messages**: More descriptive and actionable error messages
- **Memory Usage**: Reduced memory footprint for large-scale validations
- **Bundle Size**: Optimized build output for smaller bundle sizes

### 🧪 Testing & Quality

#### 📊 **Comprehensive Test Suite**
- **96.97% Test Coverage**: Extensive test coverage with 197 test cases
- **9 Test Suites**: Organized test files covering all functionality
  - `basic-types.test.ts` - Core type validation
  - `advanced-validations.test.ts` - Specialized validators
  - `structure-validation.test.ts` - Schema validation
  - `type-management.test.ts` - Custom type system
  - `generics-integration.test.ts` - Generic type support
  - `expect-validate-assert.test.ts` - Function validation
  - `edge-cases.test.ts` - Error handling and edge cases
  - `all-type-validators.test.ts` - Complete type coverage
  - `complete-coverage.test.ts` - Final coverage optimization

#### 🔍 **Quality Assurance**
- **Jest Testing Framework**: Modern testing with TypeScript support
- **Coverage Reporting**: Detailed coverage reports with uncovered line tracking
- **Error Path Testing**: Comprehensive error handling validation
- **Edge Case Coverage**: Extensive testing of boundary conditions
- **Type System Testing**: Validation of TypeScript type inference

### 📚 Documentation

#### 📖 **Complete Documentation Overhaul**
- **Comprehensive README**: Professional README with badges, examples, and complete API reference
- **API Documentation**: Detailed documentation for all 40+ methods
- **Usage Examples**: Real-world examples for all major features
- **TypeScript Integration**: Examples showing proper TypeScript usage
- **Migration Guide**: Clear migration path from v2.x to v3.0

#### 🤝 **Community Resources**
- **GitHub Issue Templates**: 5 structured issue templates for different types of reports
  - Bug Report template with environment and reproduction details
  - Feature Request template with use cases and API design
  - Documentation Issue template for doc improvements
  - Question template for usage help
  - Performance Issue template for optimization reports
- **Contributing Guide**: Comprehensive contribution guidelines
- **Pull Request Template**: Structured PR template with checklists
- **Code of Conduct**: Community guidelines and standards

### 🏗️ **Build & Infrastructure**

#### 🔧 **Enhanced Build System**
- **Multiple Output Formats**: UMD, ESM, and CommonJS builds
- **TypeScript Definitions**: Complete `.d.ts` files for all exports
- **Rollup Configuration**: Optimized bundling with tree-shaking
- **Documentation Generation**: Automated TypeDoc generation

#### 📦 **Package Management**
- **NPM Package**: Published as `@illavv/run_typer@3.0.0`
- **Dependency Updates**: Updated all dependencies to latest versions
- **Security**: No security vulnerabilities in dependencies
- **File Organization**: Clean dist structure with only necessary files

### 🛠️ **Developer Experience**

#### 💻 **Development Tools**
- **TypeScript 5.9.3**: Latest TypeScript with strict configuration
- **Jest Configuration**: Optimized Jest setup with TypeScript support
- **VS Code Integration**: Enhanced IntelliSense and type checking
- **Error Reporting**: Better stack traces and debugging information

#### 🎯 **Type Safety**
- **Strict Mode**: Full TypeScript strict mode compliance
- **No Any Types**: Eliminated all `any` types for better type safety
- **Generic Constraints**: Proper generic constraints for type safety
- **Type Guards**: Runtime type checking with TypeScript integration

### 🔧 Migration Guide (v2.x → v3.0)

#### **1. Installation**
```bash
npm install @illavv/run_typer@^3.0.0
```

#### **2. Import Changes**
```typescript
// Before
import Typer from '@illavv/run_typer'

// After
import { Typer } from '@illavv/run_typer'
```

#### **3. API Changes**
```typescript
// Before - Static methods
Typer.is(value, 'string')
Typer.isType('string', value)
Typer.checkStructure(schema, obj)

// After - Instance methods with generics
const typer = new Typer()
typer.is<string>(value, 'string')
typer.isType<string>('string', value)
typer.checkStructure(schema, obj)
```

#### **4. New Generic Features**
```typescript
const typer = new Typer()

// Type-safe validation with generics
const str = typer.isType<string>('string', 'hello') // str: string
const num = typer.asNumber(42) // num: number

// Advanced validations
const email = typer.isEmail('user@example.com')
const phone = typer.isPhoneNumber('+1234567890')
const range = typer.isInRange(1, 10, 5)
```

### 📊 **Statistics**

- **Lines of Code**: 1,200+ lines of TypeScript
- **Test Cases**: 197 comprehensive tests
- **Test Coverage**: 96.97% statement coverage
- **API Methods**: 40+ validation methods
- **Supported Types**: 20+ JavaScript/TypeScript types
- **Documentation**: Complete API reference with examples

### 🙏 **Acknowledgments**

This major release represents a complete rewrite focused on:
- **Developer Experience**: Better TypeScript integration and IntelliSense
- **Type Safety**: Elimination of `any` types and comprehensive generics
- **Reliability**: Extensive testing and error handling
- **Performance**: Optimized validation algorithms
- **Community**: Professional documentation and contribution guidelines

---

## [2.4.1] - Previous Release

### Legacy Version
- Basic type checking functionality
- Static method API
- Limited TypeScript support
- Basic validation methods

---

## How to Update

### From v2.x
This is a **major version** with breaking changes. Please review the migration guide above and update your code accordingly.

### Recommended Update Process
1. Install the new version: `npm install @illavv/run_typer@^3.0.0`
2. Update imports to use named export: `import { Typer } from '@illavv/run_typer'`
3. Create Typer instances: `const typer = new Typer()`
4. Update method calls to use instance methods with generics
5. Run tests to ensure compatibility
6. Leverage new features like advanced validations and schema checking

### Need Help?
- 📖 Read the updated [documentation](https://lavv425.github.io/Typer/)
- 💬 Join our [GitHub Discussions](https://github.com/lavv425/Typer/discussions)
- 🐛 Report issues using our [issue templates](https://github.com/lavv425/Typer/issues/new/choose)

---

**Full Changelog**: [v2.4.1...v3.0.0](https://github.com/lavv425/Typer/compare/v2.4.1...v3.0.0)