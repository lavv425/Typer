import { Typer } from '../src/Typer';
import { TyperError } from '../src/Errors/TyperError';
import type { Validator } from '../src/Types/Typer';

describe('Typer - combinators', () => {
    let typer: Typer;

    beforeEach(() => {
        typer = new Typer();
    });

    describe('literal', () => {
        it('accepts a listed value and returns it', () => {
            const role = typer.literal('admin', 'user');
            expect(role('admin')).toBe('admin');
            expect(role('user')).toBe('user');
        });

        it('rejects anything else', () => {
            const role = typer.literal('admin', 'user');
            expect(() => role('root')).toThrow('root must be one of [admin, user].');
        });

        it('supports numbers, booleans and null', () => {
            const mixed = typer.literal(1, true, null);
            expect(mixed(1)).toBe(1);
            expect(mixed(true)).toBe(true);
            expect(mixed(null)).toBe(null);
            expect(() => mixed(0)).toThrow();
        });

        it('composes into a schema', () => {
            const result = typer.safeParse({ role: typer.literal('admin', 'user') }, { role: 'nope' });
            expect(result.success).toBe(false);
        });
    });

    describe('arrayOf', () => {
        const str: Validator<string> = (v) => new Typer().asString(v);

        it('validates every element and returns the array', () => {
            expect(typer.arrayOf(str)(['a', 'b'])).toEqual(['a', 'b']);
        });

        it('rejects non-arrays', () => {
            expect(() => typer.arrayOf(str)('nope')).toThrow('must be an array');
        });

        it('reports every failing element, not just the first', () => {
            try {
                typer.arrayOf(str)([1, 'ok', 2]);
                throw new Error('expected a throw');
            } catch (e) {
                expect(e).toBeInstanceOf(TyperError);
                const issues = (e as TyperError).issues;
                expect(issues.map(i => i.path)).toEqual(['[0]', '[2]']);
            }
        });

        it('enforces min and max length', () => {
            expect(() => typer.arrayOf(str, { min: 2 })(['a'])).toThrow('array length must be >= 2, is 1');
            expect(() => typer.arrayOf(str, { max: 1 })(['a', 'b'])).toThrow('array length must be <= 1, is 2');
            expect(typer.arrayOf(str, { min: 1, max: 2 })(['a'])).toEqual(['a']);
        });

        it('accepts an empty array when no bounds are given', () => {
            expect(typer.arrayOf(str)([])).toEqual([]);
        });
    });

    describe('record', () => {
        const num: Validator<number> = (v) => new Typer().asNumber(v);

        it('validates every value', () => {
            expect(typer.record(num)({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
        });

        it('rejects arrays and null', () => {
            expect(() => typer.record(num)([])).toThrow('must be an object');
            expect(() => typer.record(num)(null)).toThrow('must be an object');
        });

        it('reports the failing key in the issue path', () => {
            try {
                typer.record(num)({ a: 1, b: 'nope' });
                throw new Error('expected a throw');
            } catch (e) {
                expect((e as TyperError).issues.map(i => i.path)).toEqual(['b']);
            }
        });

        it('accepts an empty object', () => {
            expect(typer.record(num)({})).toEqual({});
        });
    });

    describe('tuple', () => {
        const num: Validator<number> = (v) => new Typer().asNumber(v);
        const str: Validator<string> = (v) => new Typer().asString(v);

        it('validates each position', () => {
            expect(typer.tuple([num, str])([1, 'a'])).toEqual([1, 'a']);
        });

        it('rejects the wrong length', () => {
            expect(() => typer.tuple([num, str])([1])).toThrow('tuple must have exactly 2 elements, has 1');
        });

        it('rejects non-arrays', () => {
            expect(() => typer.tuple([num])('nope')).toThrow('must be an array');
        });

        it('reports the failing position', () => {
            try {
                typer.tuple([num, str])(['x', 1]);
                throw new Error('expected a throw');
            } catch (e) {
                expect((e as TyperError).issues.map(i => i.path)).toEqual(['[0]', '[1]']);
            }
        });
    });

    describe('refine', () => {
        it('passes values satisfying the predicate', () => {
            const even = typer.refine((v) => typer.asNumber(v), (n) => n % 2 === 0, 'must be even');
            expect(even(4)).toBe(4);
        });

        it('rejects values failing the predicate', () => {
            const even = typer.refine((v) => typer.asNumber(v), (n) => n % 2 === 0, 'must be even');
            expect(() => even(3)).toThrow('must be even');
        });

        it('still applies the base validator first', () => {
            const even = typer.refine((v) => typer.asNumber(v), (n) => n % 2 === 0, 'must be even');
            expect(() => even('4')).toThrow(/must be a number/);
        });
    });

    describe('transform', () => {
        it('maps the validated value', () => {
            const trimmed = typer.transform((v) => typer.asString(v), (s) => s.trim());
            expect(trimmed('  hi  ')).toBe('hi');
        });

        it('does not run the transformer on invalid input', () => {
            const spy = jest.fn((s: string) => s);
            const t = typer.transform((v) => typer.asString(v), spy);
            expect(() => t(42)).toThrow();
            expect(spy).not.toHaveBeenCalled();
        });
    });

    describe('withDefault', () => {
        it('substitutes the default for undefined', () => {
            expect(typer.withDefault((v) => typer.asNumber(v), 10)(undefined)).toBe(10);
        });

        it('validates any other value', () => {
            const limit = typer.withDefault((v) => typer.asNumber(v), 10);
            expect(limit(3)).toBe(3);
            expect(() => limit('x')).toThrow();
        });

        it('does not substitute for null', () => {
            expect(() => typer.withDefault((v) => typer.asNumber(v), 10)(null)).toThrow();
        });

        it('calls a factory default once per use, so instances are not shared', () => {
            const make = typer.withDefault<string[]>((v) => typer.asArray<string>(v), () => []);
            const a = make(undefined);
            const b = make(undefined);
            a.push('x');
            expect(b).toEqual([]);
        });
    });

    describe('lazy', () => {
        it('defers construction and reuses the result', () => {
            const factory = jest.fn(() => (v: unknown) => typer.asNumber(v));
            const lazy = typer.lazy(factory);

            expect(factory).not.toHaveBeenCalled();
            expect(lazy(1)).toBe(1);
            expect(lazy(2)).toBe(2);
            expect(factory).toHaveBeenCalledTimes(1);
        });

        it('supports recursive shapes', () => {
            type Node = { name: string; children?: Node[] };
            const node: Validator<Node> = typer.lazy(() => typer.objectOf({
                name: 'string',
                children: typer.optional(typer.arrayOf(node)),
            }) as Validator<Node>);

            expect(() => node({ name: 'a', children: [{ name: 'b', children: [{ name: 'c' }] }] })).not.toThrow();
            expect(() => node({ name: 'a', children: [{ name: 1 }] })).toThrow();
        });
    });

    describe('instanceOf', () => {
        it('accepts instances and rejects others', () => {
            const when = typer.instanceOf(Date);
            const d = new Date();
            expect(when(d)).toBe(d);
            expect(() => when('nope')).toThrow('must be an instance of Date');
        });
    });

    describe('objectOf', () => {
        it('validates a schema as a composable validator', () => {
            const user = typer.objectOf({ id: 'number', name: 'string' });
            const payload = { id: 1, name: 'Mike' };
            expect(user(payload)).toBe(payload);
        });

        it('throws a TyperError carrying the issues', () => {
            const user = typer.objectOf({ id: 'number' });
            try {
                user({ id: 'x' });
                throw new Error('expected a throw');
            } catch (e) {
                expect(e).toBeInstanceOf(TyperError);
                expect((e as TyperError).issues[0].path).toBe('id');
            }
        });

        it('supports strict mode', () => {
            const strict = typer.objectOf({ id: 'number' }, { strict: true });
            expect(() => strict({ id: 1, extra: true })).toThrow('Unexpected key "extra" in strict mode');
            expect(() => strict({ id: 1 })).not.toThrow();
        });

        it('nests inside other combinators', () => {
            const users = typer.arrayOf(typer.objectOf({ id: 'number' }));
            expect(users([{ id: 1 }, { id: 2 }])).toEqual([{ id: 1 }, { id: 2 }]);
            expect(() => users([{ id: 1 }, { id: 'x' }])).toThrow();
        });
    });
});

describe('Typer - validators accessor', () => {
    let typer: Typer;

    beforeEach(() => {
        typer = new Typer();
    });

    it('exposes validators that keep working once detached from the instance', () => {
        const { isEmail, isPositiveInteger } = typer.validators;

        expect(isEmail('a@b.co')).toBe('a@b.co');
        expect(isPositiveInteger(5)).toBe(5);
        expect(() => isPositiveInteger(-5)).toThrow('must be a positive integer');
    });

    it('is cached, so the same reference comes back', () => {
        expect(typer.validators).toBe(typer.validators);
        expect(typer.validators.isEmail).toBe(typer.validators.isEmail);
    });

    it('works as a schema slot, for valid and invalid input alike', () => {
        const schema = { id: typer.validators.isPositiveInteger, email: typer.validators.isEmail };

        expect(typer.safeParse(schema, { id: 5, email: 'a@b.co' }).success).toBe(true);
        expect(typer.safeParse(schema, { id: -5, email: 'a@b.co' }).success).toBe(false);
        expect(typer.safeParse(schema, { id: 5, email: 'nope' }).success).toBe(false);
    });

    it('preserves multi-argument helpers', () => {
        expect(typer.validators.isInRange(1, 10, 5)).toBe(5);
        expect(() => typer.validators.isInRange(1, 10, 50)).toThrow();
    });

    it('excludes is and isType, which are not validators', () => {
        expect('is' in typer.validators).toBe(false);
        expect('isType' in typer.validators).toBe(false);
    });

    it('respects a subclass override', () => {
        class Sub extends Typer {
            public isSlug(value: unknown): string {
                return `overridden:${String(value)}`;
            }
        }
        expect(new Sub().validators.isSlug('x')).toBe('overridden:x');
    });

    it('does not slow the instance down by binding onto it', () => {
        // Binding ~40 methods onto the instance pushes it out of V8's fast
        // property mode and slows every other method several-fold, so the
        // bound set must live in its own object.
        const before = Object.getOwnPropertyNames(typer).length;
        void typer.validators;
        expect(Object.getOwnPropertyNames(typer).length).toBe(before);
    });
});

describe('Typer - additional format validators', () => {
    let typer: Typer;

    beforeEach(() => {
        typer = new Typer();
    });

    describe('isIP', () => {
        it('accepts IPv4 and IPv6', () => {
            expect(typer.isIP('192.168.0.1')).toBe('192.168.0.1');
            expect(typer.isIP('::1')).toBe('::1');
            expect(typer.isIP('2001:db8::8a2e:370:7334')).toBe('2001:db8::8a2e:370:7334');
        });

        it('rejects anything else', () => {
            expect(() => typer.isIP('999.999.999.999')).toThrow('must be a valid IP address');
            expect(() => typer.isIP('nope')).toThrow('must be a valid IP address');
        });

        it('rejects non-strings', () => {
            expect(() => typer.isIP(42)).toThrow();
        });
    });

    describe('isSemver', () => {
        it.each(['1.0.0', '0.0.1', '2.1.0-beta.1', '1.0.0+build.5', '1.0.0-rc.1+exp.sha.5114f85'])(
            'accepts %s', (v) => { expect(typer.isSemver(v)).toBe(v); },
        );

        it.each(['1.0', 'v1.0.0', '01.0.0', '1.0.0-', 'nope'])(
            'rejects %s', (v) => { expect(() => typer.isSemver(v)).toThrow('must be a valid semver string'); },
        );
    });

    describe('isSlug', () => {
        it.each(['hello', 'hello-world', 'a1-b2-c3'])('accepts %s', (v) => {
            expect(typer.isSlug(v)).toBe(v);
        });

        it.each(['Hello', 'hello_world', '-hello', 'hello-', 'hello--world', ''])('rejects %s', (v) => {
            expect(() => typer.isSlug(v)).toThrow('must be a valid slug');
        });
    });

    describe('isPort', () => {
        it.each([1, 80, 8080, 65535])('accepts %s', (v) => {
            expect(typer.isPort(v)).toBe(v);
        });

        it.each([0, -1, 65536, 1.5])('rejects %s', (v) => {
            expect(() => typer.isPort(v)).toThrow();
        });
    });

    describe('isJWT', () => {
        it('accepts a three-segment token', () => {
            const token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc-_123';
            expect(typer.isJWT(token)).toBe(token);
        });

        it('accepts an empty signature (alg "none")', () => {
            expect(() => typer.isJWT('eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIn0.')).not.toThrow();
        });

        it.each(['a.b', 'a.b.c.d', 'not a token', ''])('rejects %s', (v) => {
            expect(() => typer.isJWT(v)).toThrow('must be a valid JWT');
        });
    });

    describe('isMACAddress', () => {
        it.each(['00:1A:2B:3C:4D:5E', '00-1a-2b-3c-4d-5e'])('accepts %s', (v) => {
            expect(typer.isMACAddress(v)).toBe(v);
        });

        it.each(['00:1A:2B:3C:4D', '00:1A:2B:3C:4D:5E:6F', 'ZZ:1A:2B:3C:4D:5E', ''])('rejects %s', (v) => {
            expect(() => typer.isMACAddress(v)).toThrow('must be a valid MAC address');
        });
    });
});
