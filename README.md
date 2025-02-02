<<<<<<< HEAD
# Typer Checker

A robust TypeScript class for type checking and validation.

## Overview

The `Typer` class provides a comprehensive type checking and validation utility for TypeScript projects. It includes methods for verifying the types of various data structures, ensuring that values meet specified criteria, and validating inputs in a consistent manner.

## Installation

Install the package via NPM:

```bash
npm i data-type-validator


Methods
isArrayOf(elementType: string, p: any): any[] | void
Checks if the provided parameter is an array of a specified type.

isEmail(p: any): string | void
Checks if the provided parameter is a valid email address.

isInRange(min: number, max: number, p: any): number | void
Checks if the provided parameter is a number within a specified range.

isInteger(p: any): number | void
Checks if the provided parameter is an integer.

isNonEmptyArray(p: any): any[] | void
Checks if the provided parameter is a non-empty array.

isNonEmptyString(p: any): string | void
Checks if the provided parameter is a non-empty string.

isOneOf(values: any[], p: any): any[]
Checks if the provided parameter is one of the specified values.

isPhoneNumber(p: any): string | void
Checks if the provided parameter is a valid phone number.

isPositiveNumber(p: any): number | void
Checks if the provided parameter is a positive number.

isPositiveInteger(p: any): number | void
Checks if the provided parameter is a positive integer.

isNegativeNumber(p: any): number | void
Checks if the provided parameter is a negative number.

isNegativeInteger(p: any): number | void
Checks if the provided parameter is a negative integer.

isURL(p: any): string | void
Checks if the provided parameter is a valid URL.

isType(types: any[] | string, p: any): any | void
Checks if the parameter matches one of the specified types.

expect(funct: Function, types: { paramTypes: string | string[], returnType: string | string[] }): Function
Expects a function to conform to specified input and output types.
=======
# Typer

Typer is a powerful TypeScript utility library for type checking and validation. It provides a structured and flexible way to verify data types, enforce constraints, and enhance runtime safety in JavaScript and TypeScript applications.

## Features

- **Comprehensive Type Checking**: Supports checking for primitive types, complex types, and custom-defined types.
- **Extensible Type System**: Allows users to register and unregister custom types.
- **Validation Helpers**: Provides additional methods for structure validation, type coercion, and constraint enforcement.
- **Strict Mode Compatibility**: Works seamlessly with TypeScript's strict mode.

## Installation

To install Typer, use npm or yarn:

```sh
npm install @illavv/run_typer
```

## Usage

### Basic Type Checking

```ts
import Typer from '@illavv/run_typer';

const isString = Typer.is("Hello", "string");
console.log(isString); // true

const isNumber = Typer.is(123, "number");
console.log(isNumber); // true

const isBoolean = Typer.is("true", "boolean");
console.log(isBoolean); // false
```

### Validating Object Structure

```ts
const schema = {
    name: "string",
    age: "number",
    address: {
        city: "string",
        zip: "number"
    }
};

const data = {
    name: "John",
    age: 30,
    address: {
        city: "New York",
        zip: 10001
    }
};

const result = Typer.checkStructure(schema, data);
console.log(result.isValid); // true
console.log(result.errors); // []
```

### Registering Custom Types Validation

```ts
Typer.registerType("positive", (value) => {
    if (typeof value !== "number" || value <= 0) {
        throw new TypeError("Value must be a positive number");
    }
    return value;
});

console.log(Typer.is(10, "positive")); // true
console.log(Typer.is(-5, "positive")); // false
```

### Unregistering a Type

```ts
Typer.unregisterType("positive");
```

### Listing Registered Types

```ts
console.log(Typer.listTypes());
```

## API Reference

### `Typer.is(value: any, type: string | string[]): boolean`
Checks if a value matches a specified type.

### `Typer.isType(types: string | string[], p: any): any`
Throws an error if the value does not match any of the specified types.

### `Typer.registerType(name: string, validator: (value: any) => any, override = false): void`
Registers a custom type.

### `Typer.unregisterType(name: string): void`
Removes a registered custom type.

### `Typer.listTypes(): string[]`
Returns a list of all registered types.

### `Typer.checkStructure(schema: Record<string, any>, obj: Record<string, any>): StructureValidationReturn`
Validates the structure of an object against a defined schema.

### `Typer.expect(funct: Function, types: TyperExpectTypes): Function`
Wraps a function and ensures its parameters and return value conform to the expected types.

## License

MIT License

## Contributing

Contributions are welcome! Please submit a pull request or open an issue if you find a bug or have a feature request.

## Author

**Michael Lavigna**

## Repository

[GitHub Repository](https://github.com/lavv425/Typer)

>>>>>>> d2bc03e (new version)
