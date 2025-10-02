import { Typer } from '../src/Typer';

describe('Typer - Generics and Type Guards', () => {
  let typer: Typer;

  beforeEach(() => {
    typer = new Typer();
  });

  describe('Generic Type Guards Integration', () => {
    test('should work with TypeScript type narrowing', () => {
      const unknownValue: unknown = 'hello world';
      
      if (typer.is<string>(unknownValue, 'string')) {
        // TypeScript should infer unknownValue as string here
        expect(unknownValue.toUpperCase()).toBe('HELLO WORLD');
        expect(unknownValue.length).toBe(11);
      } else {
        fail('Should have been identified as string');
      }
    });

    test('should work with complex object types', () => {
      interface User extends Record<string, unknown> {
        id: number;
        name: string;
        email?: string;
      }

      const userData: unknown = {
        id: 1,
        name: 'John Doe',
        email: 'john@example.com'
      };

      if (typer.isObject<User>(userData)) {
        expect(userData.id).toBe(1);
        expect(userData.name).toBe('John Doe');
        expect(userData.email).toBe('john@example.com');
      }
    });

    test('should work with array types', () => {
      const arrayData: unknown = [1, 2, 3, 4, 5];

      if (typer.isArray<number>(arrayData)) {
        expect(arrayData.length).toBe(5);
        expect(arrayData[0]).toBe(1);
        expect(arrayData.reduce((a, b) => a + b, 0)).toBe(15);
      }
    });
  });

  describe('Mixed validation scenarios', () => {
    test('should validate API response with generics', () => {
      interface ApiResponse<T> extends Record<string, unknown> {
        data: T;
        status: 'success' | 'error';
        message?: string;
      }

      interface UserData extends Record<string, unknown> {
        id: number;
        username: string;
      }

      const response: unknown = {
        data: { id: 1, username: 'johndoe' },
        status: 'success',
        message: 'User retrieved successfully'
      };

      // Validate top-level structure
      if (typer.isObject<ApiResponse<unknown>>(response)) {
        expect(typer.isOneOf(['success', 'error'] as const, response.status)).toBe('success');
        
        // Validate nested data
        if (typer.isObject<UserData>(response.data)) {
          expect(typer.isPositiveInteger(response.data.id)).toBe(1);
          expect(typer.isNonEmptyString(response.data.username)).toBe('johndoe');
        }
      }
    });

    test('should work with union types and type guards', () => {
      type StringOrNumber = string | number;
      
      const testValue1: unknown = 'hello';
      const testValue2: unknown = 42;
      const testValue3: unknown = true;
      
      function validateStringOrNumber(value: unknown): StringOrNumber {
        if (typer.isString(value)) {
          return value;
        } else if (typer.isNumber(value)) {
          return value;
        } else {
          throw new TypeError('Expected string or number');
        }
      }
      
      expect(validateStringOrNumber(testValue1)).toBe('hello');
      expect(validateStringOrNumber(testValue2)).toBe(42);
      expect(() => validateStringOrNumber(testValue3)).toThrow(TypeError);
    });
  });
});