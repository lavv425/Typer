# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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