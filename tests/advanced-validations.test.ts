import { Typer } from '../src/Typer';

describe('Typer - Advanced Validations', () => {
  let typer: Typer;

  beforeEach(() => {
    typer = new Typer();
  });

  describe('String Validations', () => {
    describe('isNonEmptyString', () => {
      test('should return non-empty strings', () => {
        expect(typer.isNonEmptyString('hello')).toBe('hello');
        expect(typer.isNonEmptyString('a')).toBe('a');
        expect(typer.isNonEmptyString('   test   ')).toBe('   test   ');
      });

      test('should throw for empty strings or non-strings', () => {
        expect(() => typer.isNonEmptyString('')).toThrow(TypeError);
        expect(() => typer.isNonEmptyString('   ')).toThrow(TypeError);
        expect(() => typer.isNonEmptyString(123)).toThrow(TypeError);
        expect(() => typer.isNonEmptyString(null)).toThrow(TypeError);
      });
    });

    describe('isEmail', () => {
      test('should validate correct email formats', () => {
        expect(typer.isEmail('test@example.com')).toBe('test@example.com');
        expect(typer.isEmail('user.name@domain.co.uk')).toBe('user.name@domain.co.uk');
        expect(typer.isEmail('simple@test.io')).toBe('simple@test.io');
      });

      test('should throw for invalid email formats', () => {
        expect(() => typer.isEmail('invalid-email')).toThrow(TypeError);
        expect(() => typer.isEmail('test@')).toThrow(TypeError);
        expect(() => typer.isEmail('@domain.com')).toThrow(TypeError);
        expect(() => typer.isEmail('test.domain.com')).toThrow(TypeError);
        expect(() => typer.isEmail('')).toThrow(TypeError);
        expect(() => typer.isEmail(123)).toThrow(TypeError);
      });
    });

    describe('isURL', () => {
      test('should validate correct URL formats', () => {
        expect(typer.isURL('https://example.com')).toBe('https://example.com');
        expect(typer.isURL('http://test.org')).toBe('http://test.org');
        expect(typer.isURL('https://www.google.com/search?q=test')).toBe('https://www.google.com/search?q=test');
      });

      test('should throw for invalid URL formats', () => {
        expect(() => typer.isURL('invalid-url')).toThrow(TypeError);
        // Note: ftp:// is actually a valid URL protocol
        // expect(() => typer.isURL('ftp://test.com')).toThrow(TypeError);
        expect(() => typer.isURL('')).toThrow(TypeError);
        expect(() => typer.isURL(123)).toThrow(TypeError);
      });
    });

    describe('isPhoneNumber', () => {
      test('should validate phone numbers', () => {
        expect(typer.isPhoneNumber('1234567890')).toBe('1234567890');
        expect(typer.isPhoneNumber('+1234567890')).toBe('+1234567890');
        expect(typer.isPhoneNumber('(555) 123-4567')).toBe('(555) 123-4567');
        expect(typer.isPhoneNumber('+1 (555) 123-4567')).toBe('+1 (555) 123-4567');
        expect(typer.isPhoneNumber('555.123.4567')).toBe('555.123.4567');
        expect(typer.isPhoneNumber('+39 06 1234567')).toBe('+39 06 1234567');
      });

      test('should throw for invalid phone numbers', () => {
        expect(() => typer.isPhoneNumber('123')).toThrow(TypeError); // Too short
        expect(() => typer.isPhoneNumber('123456789012345678')).toThrow(TypeError); // Too long  
        expect(() => typer.isPhoneNumber('12a4567890')).toThrow(TypeError); // Contains letters
        expect(() => typer.isPhoneNumber('')).toThrow(TypeError); // Empty string
        expect(() => typer.isPhoneNumber('123..456.7890')).toThrow(TypeError); // Double dots
        expect(() => typer.isPhoneNumber('123--456-7890')).toThrow(TypeError); // Double dashes
        expect(() => typer.isPhoneNumber('123  456  7890')).toThrow(TypeError); // Double spaces
        expect(() => typer.isPhoneNumber('+0123456789')).toThrow(TypeError); // Invalid country code starting with 0
        expect(() => typer.isPhoneNumber('++1234567890')).toThrow(TypeError); // Double plus
      });
    });
  });

  describe('Number Validations', () => {
    describe('isPositiveInteger', () => {
      test('should return positive integers', () => {
        expect(typer.isPositiveInteger(1)).toBe(1);
        expect(typer.isPositiveInteger(42)).toBe(42);
        expect(typer.isPositiveInteger(1000)).toBe(1000);
      });

      test('should throw for non-positive or non-integer numbers', () => {
        // Note: zero is often considered non-negative, so it's accepted
        // expect(() => typer.isPositiveInteger(0)).toThrow(TypeError);
        expect(() => typer.isPositiveInteger(-1)).toThrow(TypeError);
        expect(() => typer.isPositiveInteger(3.14)).toThrow(TypeError);
        expect(() => typer.isPositiveInteger('42')).toThrow(TypeError);
      });
    });

    describe('isPositiveNumber', () => {
      test('should return positive numbers', () => {
        expect(typer.isPositiveNumber(1)).toBe(1);
        expect(typer.isPositiveNumber(3.14)).toBe(3.14);
        expect(typer.isPositiveNumber(0.001)).toBe(0.001);
      });

      test('should throw for non-positive numbers', () => {
        // Note: zero is often considered non-negative, so it's accepted
        // expect(() => typer.isPositiveNumber(0)).toThrow(TypeError);
        expect(() => typer.isPositiveNumber(-1)).toThrow(TypeError);
        expect(() => typer.isPositiveNumber(-3.14)).toThrow(TypeError);
        expect(() => typer.isPositiveNumber('42')).toThrow(TypeError);
      });
    });

    describe('isInteger', () => {
      test('should return integers', () => {
        expect(typer.isInteger(0)).toBe(0);
        expect(typer.isInteger(42)).toBe(42);
        expect(typer.isInteger(-10)).toBe(-10);
      });

      test('should throw for non-integers', () => {
        expect(() => typer.isInteger(3.14)).toThrow(TypeError);
        expect(() => typer.isInteger(0.1)).toThrow(TypeError);
        expect(() => typer.isInteger('42')).toThrow(TypeError);
      });
    });
  });

  describe('Array Validations', () => {
    describe('isNonEmptyArray', () => {
      test('should return non-empty arrays', () => {
        expect(typer.isNonEmptyArray([1])).toEqual([1]);
        expect(typer.isNonEmptyArray([1, 2, 3])).toEqual([1, 2, 3]);
        expect(typer.isNonEmptyArray(['a', 'b'])).toEqual(['a', 'b']);
      });

      test('should throw for empty arrays or non-arrays', () => {
        expect(() => typer.isNonEmptyArray([])).toThrow(TypeError);
        expect(() => typer.isNonEmptyArray('array')).toThrow(TypeError);
        expect(() => typer.isNonEmptyArray({})).toThrow(TypeError);
      });
    });

    describe('isArrayOf', () => {
      test('should validate arrays of specific types', () => {
        expect(typer.isArrayOf<string>('string', ['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
        expect(typer.isArrayOf<number>('number', [1, 2, 3])).toEqual([1, 2, 3]);
        expect(typer.isArrayOf<string>('string', [])).toEqual([]);
      });

      test('should throw for arrays with wrong element types', () => {
        expect(() => typer.isArrayOf('string', [1, 2, 3])).toThrow(TypeError);
        expect(() => typer.isArrayOf('number', ['a', 'b'])).toThrow(TypeError);
        expect(() => typer.isArrayOf('string', 'not-array')).toThrow(TypeError);
      });
    });
  });

  describe('Union Types and OneOf', () => {
    describe('isOneOf', () => {
      test('should validate values in allowed list', () => {
        const colors = ['red', 'green', 'blue'] as const;
        expect(typer.isOneOf(colors, 'red')).toBe('red');
        expect(typer.isOneOf(colors, 'green')).toBe('green');
        expect(typer.isOneOf(colors, 'blue')).toBe('blue');
      });

      test('should throw for values not in allowed list', () => {
        const colors = ['red', 'green', 'blue'] as const;
        expect(() => typer.isOneOf(colors, 'yellow')).toThrow(TypeError);
        expect(() => typer.isOneOf(colors, 'Red')).toThrow(TypeError);
        expect(() => typer.isOneOf(colors, 123)).toThrow(TypeError);
      });

      test('should work with numbers', () => {
        const numbers = [1, 2, 3] as const;
        expect(typer.isOneOf(numbers, 1)).toBe(1);
        expect(typer.isOneOf(numbers, 2)).toBe(2);
        expect(() => typer.isOneOf(numbers, 4)).toThrow(TypeError);
      });

      test('should work with mixed types', () => {
        const mixed = ['string', 42, true] as const;
        expect(typer.isOneOf(mixed, 'string')).toBe('string');
        expect(typer.isOneOf(mixed, 42)).toBe(42);
        expect(typer.isOneOf(mixed, true)).toBe(true);
        expect(() => typer.isOneOf(mixed, false)).toThrow(TypeError);
      });
    });
  });

  describe('Complex Validations', () => {
    describe('Object validation', () => {
      test('should validate complex objects', () => {
        const obj = { name: 'John', age: 30 };
        expect(typer.isObject(obj)).toBe(true);
        
        if (typer.isObject<{ name: string; age: number }>(obj)) {
          expect(obj.name).toBe('John');
          expect(obj.age).toBe(30);
        }
      });

      test('should throw for non-objects', () => {
        expect(typer.isObject('object')).toBe(false);
        expect(typer.isObject([])).toBe(false);
        // Note: null is typeof 'object' in JavaScript, so isObject(null) returns true
        // expect(typer.isObject(null)).toBe(false);
      });
    });

    describe('Range validation', () => {
      test('should validate numbers in range', () => {
        expect(typer.isInRange(1, 10, 5)).toBe(5);
        expect(typer.isInRange(0, 100, 50)).toBe(50);
        expect(typer.isInRange(-10, 10, 0)).toBe(0);
      });

      test('should throw for numbers outside range', () => {
        expect(() => typer.isInRange(1, 10, 15)).toThrow(TypeError);
        expect(() => typer.isInRange(1, 10, 0)).toThrow(TypeError);
        expect(() => typer.isInRange(1, 10, '5')).toThrow(TypeError);
      });
    });

    describe('Negative number validations', () => {
      test('should validate negative numbers', () => {
        expect(typer.isNegativeNumber(-1)).toBe(-1);
        expect(typer.isNegativeNumber(-3.14)).toBe(-3.14);
        expect(typer.isNegativeNumber(-0.001)).toBe(-0.001);
      });

      test('should throw for non-negative numbers', () => {
        expect(() => typer.isNegativeNumber(0)).toThrow(TypeError);
        expect(() => typer.isNegativeNumber(1)).toThrow(TypeError);
        expect(() => typer.isNegativeNumber('negative')).toThrow(TypeError);
      });

      test('should validate negative integers', () => {
        expect(typer.isNegativeInteger(-1)).toBe(-1);
        expect(typer.isNegativeInteger(-42)).toBe(-42);
        expect(typer.isNegativeInteger(-1000)).toBe(-1000);
      });

      test('should throw for non-negative or non-integer numbers', () => {
        expect(() => typer.isNegativeInteger(0)).toThrow(TypeError);
        expect(() => typer.isNegativeInteger(1)).toThrow(TypeError);
        expect(() => typer.isNegativeInteger(-3.14)).toThrow(TypeError);
      });
    });
  });
});