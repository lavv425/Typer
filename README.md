# Typer - Type Checking & Validation Library

Typer is a powerful TypeScript utility library for type checking and validation. It provides a structured and flexible way to verify data types, enforce constraints, and enhance runtime safety in JavaScript and TypeScript applications.

## 🚀 Features

- **Comprehensive Type Checking**: Supports checking for primitive types, complex types, and user-defined custom types.
- **Extensible Type System**: Register and unregister your own validation functions.
- **Schema-Based Validation**: Easily validate object structures.
- **Strict Mode Compatibility**: Works seamlessly with TypeScript's strict mode.
- **Asynchronous & Synchronous Support**: Ensures correct function return types, even for Promises.

## 📦 Installation

Install Typer via npm:

```sh
npm install @illavv/run_typer
```

---

## 🔧 Usage Examples

### ✅ Basic Type Checking

```ts
import Typer from '@illavv/run_typer';

console.log(Typer.is("Hello", "string")); // true
console.log(Typer.is(123, "number")); // true
console.log(Typer.is(true, "boolean")); // true
console.log(Typer.is([], "array")); // true
console.log(Typer.is({}, "object")); // true
```

### 🏗 Validating Object Structures

You can define an expected schema and validate an object against it:

```ts
const schema = {
    name: "string",
    age: "number",
    address: {
        city: "string",
        zip: "number"
    }
};

const validData = {
    name: "John",
    age: 30,
    address: {
        city: "New York",
        zip: 10001
    }
};

const invalidData = {
    name: "John",
    age: "thirty",
    address: {
        city: "New York",
        zip: "not-a-number"
    }
};

console.log(Typer.checkStructure(schema, validData).isValid); // true
console.log(Typer.checkStructure(schema, invalidData).errors); // Errors in age and zip
```

### 🛠 Registering Custom Types

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

### 🔥 Unregistering a Type

```ts
Typer.unregisterType("positive");
```

### 📜 Listing All Registered Types

```ts
console.log(Typer.listTypes());
```

### 🔍 Type Checking for Functions (Ensuring Input & Output Types)

```ts
const safeFunction = Typer.expect((x: number) => x * 2, {
    paramTypes: "number",
    returnType: "number"
});

console.log(safeFunction(4)); // 8
console.log(safeFunction("hello")); // Throws TypeError
```

---

## 📖 API Reference

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

---

## 📝 License

MIT License

---

## 🤝 Contributing

Contributions are welcome! Feel free to submit a pull request or open an issue if you find a bug or have a feature request.

---

## 👤 Author

**Michael Lavigna**

---

## 📂 Repository

[GitHub Repository](https://github.com/lavv425/Typer)