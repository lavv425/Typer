# Typer

Typer is a powerful TypeScript utility library for type checking and validation. It provides a structured and flexible way to verify data types, enforce constraints, and enhance runtime safety in JavaScript and TypeScript applications.

## Features

- **Comprehensive Type Checking**: Supports checking for primitive types, complex types, and custom-defined types.
- **Extensible Type System**: Allows users to register and unregister custom types.
- **Validation Helpers**: Provides additional methods for structure validation, type coercion, and constraint enforcement.
- **Strict Mode Compatibility**: Works seamlessly with TypeScript's strict mode.

## Installation

To install Typer, use npm:

```sh
npm install typer-validator
```


## Usage

### Basic Type Checking

```ts
import Typer from 'typer-validator';

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

### Registering Custom Types

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
