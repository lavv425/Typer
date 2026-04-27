import { Typer } from '../src/Typer';

describe('Typer - Extended Validators and Combinators', () => {
    let typer: Typer;

    beforeEach(() => {
        typer = new Typer();
    });

    describe('safeParse', () => {
        it('returns success with typed data when value matches', () => {
            const result = typer.safeParse('number', 42);
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toBe(42);
            }
        });

        it('returns failure with TypeError when value does not match', () => {
            const result = typer.safeParse('number', 'oops');
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toBeInstanceOf(TypeError);
                expect(result.error.message).toContain('must be a number');
            }
        });

        it('supports an array of types (union)', () => {
            const result = typer.safeParse(['string', 'number'], true);
            expect(result.success).toBe(false);
        });

        it('does not throw for unknown registered type names', () => {
            const result = typer.safeParse('definitely-not-a-type', 1);
            expect(result.success).toBe(false);
        });
    });

    describe('combinators', () => {
        it('nullable accepts null and the underlying type', () => {
            const validator = typer.nullable<string>(v => typer.asString(v));
            expect(validator(null)).toBeNull();
            expect(validator('hi')).toBe('hi');
            expect(() => validator(42)).toThrow(TypeError);
        });

        it('optional accepts undefined and the underlying type', () => {
            const validator = typer.optional<number>(v => typer.asNumber(v));
            expect(validator(undefined)).toBeUndefined();
            expect(validator(7)).toBe(7);
            expect(() => validator('nope')).toThrow(TypeError);
        });

        it('union accepts the first matching variant', () => {
            const stringOrNumber = typer.union<[string, number]>(
                v => typer.asString(v),
                v => typer.asNumber(v),
            );
            expect(stringOrNumber('hello')).toBe('hello');
            expect(stringOrNumber(42)).toBe(42);
            expect(() => stringOrNumber(true)).toThrow('did not match any union variant');
        });
    });

    describe('isFiniteNumber / isSafeInteger', () => {
        it('rejects NaN and Infinity for isFiniteNumber', () => {
            expect(typer.isFiniteNumber(1)).toBe(1);
            expect(() => typer.isFiniteNumber(Number.NaN)).toThrow(TypeError);
            expect(() => typer.isFiniteNumber(Number.POSITIVE_INFINITY)).toThrow(TypeError);
        });

        it('rejects unsafe integers', () => {
            expect(typer.isSafeInteger(42)).toBe(42);
            expect(() => typer.isSafeInteger(Number.MAX_SAFE_INTEGER + 1)).toThrow(TypeError);
            expect(() => typer.isSafeInteger(3.14)).toThrow(TypeError);
        });
    });

    describe('isPlainObject', () => {
        it('accepts object literals', () => {
            expect(typer.isPlainObject({ a: 1 })).toEqual({ a: 1 });
            expect(typer.isPlainObject(Object.create(null))).toEqual({});
        });

        it('rejects class instances, arrays and primitives', () => {
            class Foo {}
            expect(() => typer.isPlainObject(new Foo())).toThrow(TypeError);
            expect(() => typer.isPlainObject([])).toThrow(TypeError);
            expect(() => typer.isPlainObject(null)).toThrow(TypeError);
            expect(() => typer.isPlainObject(new Map())).toThrow(TypeError);
        });
    });

    describe('isPromise', () => {
        it('accepts native Promises and thenables', () => {
            expect(typer.isPromise(Promise.resolve(1))).toBeInstanceOf(Promise);
            const thenable = { then: () => undefined };
            expect(typer.isPromise(thenable)).toBe(thenable);
        });

        it('rejects non-thenables', () => {
            expect(() => typer.isPromise({})).toThrow(TypeError);
            expect(() => typer.isPromise(null)).toThrow(TypeError);
            expect(() => typer.isPromise(42)).toThrow(TypeError);
        });
    });

    describe('isInstanceOf', () => {
        class Animal {
            constructor(public name: string) {}
        }

        it('accepts an instance of the constructor', () => {
            const cat = new Animal('cat');
            expect(typer.isInstanceOf(Animal, cat)).toBe(cat);
        });

        it('rejects non-instances', () => {
            expect(() => typer.isInstanceOf(Animal, {})).toThrow(TypeError);
            expect(() => typer.isInstanceOf(Animal, null)).toThrow(TypeError);
        });
    });

    describe('matches / isLength', () => {
        it('matches enforces a regex on a string', () => {
            expect(typer.matches(/^abc/, 'abcdef')).toBe('abcdef');
            expect(() => typer.matches(/^abc/, 'xyz')).toThrow(TypeError);
            expect(() => typer.matches(/^abc/, 123)).toThrow(TypeError);
        });

        it('isLength enforces min/max on strings and arrays', () => {
            expect(typer.isLength({ min: 1, max: 5 }, 'hi')).toBe('hi');
            expect(typer.isLength({ min: 1 }, [1, 2])).toEqual([1, 2]);
            expect(() => typer.isLength({ min: 3 }, 'hi')).toThrow(TypeError);
            expect(() => typer.isLength({ max: 1 }, [1, 2])).toThrow(TypeError);
            expect(() => typer.isLength({ min: 1 }, 42)).toThrow(TypeError);
        });
    });

    describe('isEmpty / isNonEmpty', () => {
        it('isEmpty accepts empty containers and rejects non-empty', () => {
            expect(typer.isEmpty('')).toBe('');
            expect(typer.isEmpty('   ')).toBe('   ');
            expect(typer.isEmpty([])).toEqual([]);
            expect(typer.isEmpty(new Map())).toBeInstanceOf(Map);
            expect(typer.isEmpty(new Set())).toBeInstanceOf(Set);
            expect(typer.isEmpty({})).toEqual({});
            expect(() => typer.isEmpty('a')).toThrow(TypeError);
            expect(() => typer.isEmpty([1])).toThrow(TypeError);
            expect(() => typer.isEmpty(42)).toThrow(TypeError);
        });

        it('isNonEmpty accepts non-empty containers and rejects empty', () => {
            expect(typer.isNonEmpty('a')).toBe('a');
            expect(typer.isNonEmpty([1])).toEqual([1]);
            expect(typer.isNonEmpty({ a: 1 })).toEqual({ a: 1 });
            const m = new Map();
            m.set('k', 'v');
            expect(typer.isNonEmpty(m)).toBe(m);
            expect(() => typer.isNonEmpty('   ')).toThrow(TypeError);
            expect(() => typer.isNonEmpty([])).toThrow(TypeError);
            expect(() => typer.isNonEmpty({})).toThrow(TypeError);
        });
    });

    describe('isUUID', () => {
        it('accepts valid UUIDs across versions 1-5', () => {
            expect(typer.isUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(
                '550e8400-e29b-41d4-a716-446655440000',
            );
            expect(typer.isUUID('123E4567-E89B-12D3-A456-426614174000')).toBe(
                '123E4567-E89B-12D3-A456-426614174000',
            );
        });

        it('rejects malformed UUIDs', () => {
            expect(() => typer.isUUID('not-a-uuid')).toThrow(TypeError);
            expect(() => typer.isUUID('550e8400-e29b-61d4-a716-446655440000')).toThrow(TypeError); // bad version
            expect(() => typer.isUUID(123)).toThrow(TypeError);
        });
    });

    describe('isIPv4', () => {
        it('accepts valid IPv4 addresses', () => {
            expect(typer.isIPv4('192.168.0.1')).toBe('192.168.0.1');
            expect(typer.isIPv4('0.0.0.0')).toBe('0.0.0.0');
            expect(typer.isIPv4('255.255.255.255')).toBe('255.255.255.255');
        });

        it('rejects invalid IPv4 addresses', () => {
            expect(() => typer.isIPv4('256.0.0.1')).toThrow(TypeError);
            expect(() => typer.isIPv4('1.2.3')).toThrow(TypeError);
            expect(() => typer.isIPv4('01.2.3.4')).toThrow(TypeError); // leading zero
            expect(() => typer.isIPv4('a.b.c.d')).toThrow(TypeError);
        });
    });

    describe('isIPv6', () => {
        it('accepts valid IPv6 addresses', () => {
            expect(typer.isIPv6('2001:db8::1')).toBe('2001:db8::1');
            expect(typer.isIPv6('::1')).toBe('::1');
            expect(typer.isIPv6('fe80::1ff:fe23:4567:890a')).toBe('fe80::1ff:fe23:4567:890a');
        });

        it('rejects invalid IPv6 addresses', () => {
            expect(() => typer.isIPv6('not-an-ip')).toThrow(TypeError);
            expect(() => typer.isIPv6('192.168.0.1')).toThrow(TypeError);
        });
    });

    describe('isHexColor', () => {
        it('accepts 3/4/6/8 digit hex colors', () => {
            expect(typer.isHexColor('#fff')).toBe('#fff');
            expect(typer.isHexColor('#FFFA')).toBe('#FFFA');
            expect(typer.isHexColor('#aabbcc')).toBe('#aabbcc');
            expect(typer.isHexColor('#aabbccdd')).toBe('#aabbccdd');
        });

        it('rejects malformed colors', () => {
            expect(() => typer.isHexColor('fff')).toThrow(TypeError);
            expect(() => typer.isHexColor('#xyz')).toThrow(TypeError);
            expect(() => typer.isHexColor('#12345')).toThrow(TypeError);
        });
    });

    describe('isISODate', () => {
        it('accepts ISO 8601 strings and returns a Date', () => {
            const d = typer.isISODate('2024-01-15T10:30:00Z');
            expect(d).toBeInstanceOf(Date);
            expect(d.toISOString()).toBe('2024-01-15T10:30:00.000Z');

            expect(typer.isISODate('2024-01-15')).toBeInstanceOf(Date);
        });

        it('rejects non-ISO and invalid dates', () => {
            expect(() => typer.isISODate('15/01/2024')).toThrow(TypeError);
            expect(() => typer.isISODate('2024-13-01')).toThrow(TypeError); // invalid month
            expect(() => typer.isISODate('hello')).toThrow(TypeError);
        });
    });

    describe('isBase64', () => {
        it('accepts standard padded Base64', () => {
            expect(typer.isBase64('aGVsbG8=')).toBe('aGVsbG8=');
            expect(typer.isBase64('YWJjZA==')).toBe('YWJjZA==');
        });

        it('accepts URL-safe variant when requested', () => {
            expect(typer.isBase64('aGVsbG8_d29ybGQ=', { urlSafe: true })).toBe('aGVsbG8_d29ybGQ=');
            expect(() => typer.isBase64('aGVsbG8_d29ybGQ=')).toThrow(TypeError); // standard rejects _
        });

        it('rejects malformed Base64', () => {
            expect(() => typer.isBase64('not base64!')).toThrow(TypeError);
            expect(() => typer.isBase64('')).toThrow(TypeError);
        });

        it('accepts unpadded base64 when requirePadding is false', () => {
            expect(typer.isBase64('aGVsbG8', { requirePadding: false })).toBe('aGVsbG8');
        });
    });

    describe('Type inference (compile-time only smoke tests)', () => {
        it('isType returns the inferred runtime type from the literal alias', () => {
            const s = typer.isType('string', 'a');
            // If overload inference is broken, this line would fail to compile.
            expect(s.toUpperCase()).toBe('A');

            const n = typer.isType('number', 1);
            expect(n.toFixed(0)).toBe('1');
        });

        it('is narrows correctly via the type guard', () => {
            const value: unknown = 'hello';
            if (typer.is(value, 'string')) {
                expect(value.length).toBe(5);
            } else {
                throw new Error('should have narrowed to string');
            }
        });
    });
});
