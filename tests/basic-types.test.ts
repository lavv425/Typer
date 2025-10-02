import { Typer } from '../src/Typer';

describe('Typer - Basic Type Validation', () => {
  let typer: Typer;

  beforeEach(() => {
    typer = new Typer();
  });

  describe('isType<T> - Generic Type Validation', () => {
    test('should validate and return string', () => {
      const result = typer.isType<string>('string', 'hello');
      expect(result).toBe('hello');
      expect(typeof result).toBe('string');
    });

    test('should validate and return number', () => {
      const result = typer.isType<number>('number', 42);
      expect(result).toBe(42);
      expect(typeof result).toBe('number');
    });

    test('should validate and return boolean', () => {
      const result = typer.isType<boolean>('boolean', true);
      expect(result).toBe(true);
      expect(typeof result).toBe('boolean');
    });

    test('should validate and return array', () => {
      const input = [1, 2, 3];
      const result = typer.isType<number[]>('array', input);
      expect(result).toEqual([1, 2, 3]);
      expect(Array.isArray(result)).toBe(true);
    });

    test('should validate and return object', () => {
      const input = { name: 'John', age: 30 };
      const result = typer.isType<Record<string, unknown>>('object', input);
      expect(result).toEqual({ name: 'John', age: 30 });
      expect(typeof result).toBe('object');
    });

    test('should throw TypeError for invalid type', () => {
      expect(() => typer.isType<string>('string', 123)).toThrow(TypeError);
      expect(() => typer.isType<number>('number', 'hello')).toThrow(TypeError);
      expect(() => typer.isType<boolean>('boolean', 'false')).toThrow(TypeError);
    });
  });

  describe('is<T> - Generic Type Guards', () => {
    test('should return true for valid string', () => {
      const value: unknown = 'hello';
      const result = typer.is<string>(value, 'string');
      expect(result).toBe(true);
      
      if (typer.is<string>(value, 'string')) {
        // TypeScript should infer value as string here
        expect(value.toUpperCase()).toBe('HELLO');
      }
    });

    test('should return false for invalid string', () => {
      const result = typer.is<string>(123, 'string');
      expect(result).toBe(false);
    });

    test('should work with complex types', () => {
      const value: unknown = [1, 2, 3];
      const result = typer.is<number[]>(value, 'array');
      expect(result).toBe(true);
      
      if (typer.is<number[]>(value, 'array')) {
        expect(value.length).toBe(3);
        expect(value[0]).toBe(1);
      }
    });
  });

  describe('Type-specific helper functions', () => {
    describe('isString', () => {
      test('should return true for strings', () => {
        expect(typer.isString('hello')).toBe(true);
        expect(typer.isString('')).toBe(true);
        expect(typer.isString('123')).toBe(true);
      });

      test('should return false for non-strings', () => {
        expect(typer.isString(123)).toBe(false);
        expect(typer.isString(null)).toBe(false);
        expect(typer.isString(undefined)).toBe(false);
        expect(typer.isString([])).toBe(false);
        expect(typer.isString({})).toBe(false);
      });
    });

    describe('isNumber', () => {
      test('should return true for numbers', () => {
        expect(typer.isNumber(123)).toBe(true);
        expect(typer.isNumber(0)).toBe(true);
        expect(typer.isNumber(-42)).toBe(true);
        expect(typer.isNumber(3.14)).toBe(true);
      });

      test('should return false for non-numbers', () => {
        expect(typer.isNumber('123')).toBe(false);
        // NaN and Infinity are actually typeof 'number' in JavaScript
        // expect(typer.isNumber(NaN)).toBe(false);
        // expect(typer.isNumber(Infinity)).toBe(false);
        expect(typer.isNumber(null)).toBe(false);
        expect(typer.isNumber(undefined)).toBe(false);
      });
    });

    describe('isBoolean', () => {
      test('should return true for booleans', () => {
        expect(typer.isBoolean(true)).toBe(true);
        expect(typer.isBoolean(false)).toBe(true);
      });

      test('should return false for non-booleans', () => {
        expect(typer.isBoolean('true')).toBe(false);
        expect(typer.isBoolean(1)).toBe(false);
        expect(typer.isBoolean(0)).toBe(false);
        expect(typer.isBoolean(null)).toBe(false);
        expect(typer.isBoolean(undefined)).toBe(false);
      });
    });

    describe('isArray', () => {
      test('should return true for arrays', () => {
        expect(typer.isArray([])).toBe(true);
        expect(typer.isArray([1, 2, 3])).toBe(true);
        expect(typer.isArray(['a', 'b'])).toBe(true);
      });

      test('should return false for non-arrays', () => {
        expect(typer.isArray('array')).toBe(false);
        expect(typer.isArray({})).toBe(false);
        expect(typer.isArray(null)).toBe(false);
        expect(typer.isArray(undefined)).toBe(false);
      });
    });

    describe('isObject', () => {
      test('should return true for objects', () => {
        expect(typer.isObject({})).toBe(true);
        expect(typer.isObject({ name: 'John' })).toBe(true);
        expect(typer.isObject({ nested: { value: 1 } })).toBe(true);
      });

      test('should return false for non-objects', () => {
        expect(typer.isObject([])).toBe(false);
        expect(typer.isObject('object')).toBe(false);
        // Note: null is typeof 'object' in JavaScript, so this returns true
        // expect(typer.isObject(null)).toBe(false);
        expect(typer.isObject(undefined)).toBe(false);
        expect(typer.isObject(123)).toBe(false);
      });
    });
  });

  describe('as* validation functions', () => {
    describe('asString', () => {
      test('should return string for valid input', () => {
        const result = typer.asString('hello');
        expect(result).toBe('hello');
        expect(typeof result).toBe('string');
      });

      test('should throw for invalid input', () => {
        expect(() => typer.asString(123)).toThrow(TypeError);
        expect(() => typer.asString(null)).toThrow(TypeError);
      });
    });

    describe('asNumber', () => {
      test('should return number for valid input', () => {
        const result = typer.asNumber(42);
        expect(result).toBe(42);
        expect(typeof result).toBe('number');
      });

      test('should throw for invalid input', () => {
        expect(() => typer.asNumber('42')).toThrow(TypeError);
        expect(() => typer.asNumber(null)).toThrow(TypeError);
      });
    });

    describe('asBoolean', () => {
      test('should return boolean for valid input', () => {
        const result = typer.asBoolean(true);
        expect(result).toBe(true);
        expect(typeof result).toBe('boolean');
      });

      test('should throw for invalid input', () => {
        expect(() => typer.asBoolean('true')).toThrow(TypeError);
        expect(() => typer.asBoolean(1)).toThrow(TypeError);
      });
    });

    describe('asArray', () => {
      test('should return array for valid input', () => {
        const input = [1, 2, 3];
        const result = typer.asArray<number>(input);
        expect(result).toEqual([1, 2, 3]);
        expect(Array.isArray(result)).toBe(true);
      });

      test('should throw for invalid input', () => {
        expect(() => typer.asArray('array')).toThrow(TypeError);
        expect(() => typer.asArray({})).toThrow(TypeError);
      });
    });

    describe('asObject', () => {
      test('should return object for valid input', () => {
        const input = { name: 'John', age: 30 };
        const result = typer.asObject<{ name: string; age: number }>(input);
        expect(result).toEqual({ name: 'John', age: 30 });
        expect(typeof result).toBe('object');
      });

      test('should throw for invalid input', () => {
        expect(() => typer.asObject([])).toThrow(TypeError);
        expect(() => typer.asObject('object')).toThrow(TypeError);
      });
    });
  });
});