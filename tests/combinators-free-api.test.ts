import * as free from '../src/combinators';
import { parse, safeParse, createRegistry } from '../src/core';
import { isEmail } from '../src/validators';
import { Typer, TyperError } from '../src/Typer';

const typer = new Typer();
const asNumber = (v: unknown): number => typer.asNumber(v);
const asString = (v: unknown): string => typer.asString(v);

/**
 * The combinators moved out of the class, so the two must stay
 * indistinguishable. These assert behaviour against the instance rather than
 * restating it.
 */
describe('the free combinators match the class', () => {
    it('nullable / optional', () => {
        expect(free.nullable(asString)(null)).toBeNull();
        expect(free.nullable(asString)('x')).toBe('x');
        expect(free.optional(asString)(undefined)).toBeUndefined();
        expect(() => free.optional(asString)(1)).toThrow(TypeError);
    });

    it('union reports every variant, as before', () => {
        const u = free.union(asString, asNumber);
        expect(u(1)).toBe(1);

        const freeMsg = ((): string => { try { u(true); return ''; } catch (e) { return (e as Error).message; } })();
        const classMsg = ((): string => { try { typer.union(asString, asNumber)(true); return ''; } catch (e) { return (e as Error).message; } })();
        expect(freeMsg).toBe(classMsg);
    });

    it('literal', () => {
        expect(free.literal('a', 'b')('a')).toBe('a');
        expect(() => free.literal('a', 'b')('z')).toThrow('must be one of [a, b]');
    });

    it('arrayOf, including bounds and per-element paths', () => {
        expect(free.arrayOf(asNumber)([1, 2])).toEqual([1, 2]);
        expect(() => free.arrayOf(asNumber, { min: 2 })([1])).toThrow('array length must be >= 2');

        try {
            free.arrayOf(asNumber)([1, 'x']);
        } catch (e) {
            expect((e as TyperError).issues[0].path).toBe('[1]');
        }
    });

    it('record drops dangerous keys instead of copying them', () => {
        const out = free.record(asNumber)(JSON.parse('{"a":1,"__proto__":2,"constructor":3}'));
        expect(out).toEqual({ a: 1 });
        expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    });

    it('tuple', () => {
        expect(free.tuple([asNumber, asString])([1, 'a'])).toEqual([1, 'a']);
        expect(() => free.tuple([asNumber])([1, 2])).toThrow('tuple must have exactly 1 elements');
    });

    it('refine / transform / withDefault / lazy', () => {
        expect(free.refine(asNumber, (n) => n % 2 === 0, 'must be even')(2)).toBe(2);
        expect(() => free.refine(asNumber, (n) => n % 2 === 0, 'must be even')(3)).toThrow('must be even');
        expect(free.transform(asString, (s) => s.trim())('  x  ')).toBe('x');
        expect(free.withDefault(asNumber, 10)(undefined)).toBe(10);
        expect(free.lazy(() => asNumber)(1)).toBe(1);
    });

    it('instanceOf', () => {
        const d = new Date();
        expect(free.instanceOf(Date)(d)).toBe(d);
        expect(() => free.instanceOf(Date)(1)).toThrow(TypeError);
    });

    it('objectOf produces the same issues as the class', () => {
        const schema = { id: 'number', addr: { city: 'string' } } as const;
        const bad = { id: 'x', addr: {} };

        const viaFree = safeParse(free.objectOf(schema), structuredClone(bad));
        const viaClass = typer.safeParse(typer.objectOf(schema), structuredClone(bad));

        expect(viaFree.success).toBe(false);
        if (viaFree.success || viaClass.success) return;
        expect(viaFree.issues).toEqual(viaClass.issues);
    });

    it('objectOf honours strict mode', () => {
        const strict = free.objectOf({ id: 'number' }, { strict: true });
        expect(safeParse(strict, { id: 1, extra: true }).success).toBe(false);
    });

    it('objectOf resolves custom aliases from a registry', () => {
        const registry = createRegistry({
            positive: (v: unknown): number => {
                if (typeof v !== 'number' || v <= 0) throw new TypeError('Must be positive');
                return v;
            },
        });
        const v = free.objectOf({ qty: 'positive' }, { registry });

        expect(v({ qty: 2 })).toEqual({ qty: 2 });
        expect(() => v({ qty: -1 })).toThrow(TyperError);
    });

    it('discriminatedUnion selects the branch and reports against it alone', () => {
        const shape = free.discriminatedUnion('kind', {
            circle: { radius: 'number' },
            square: { side: 'number' },
        });

        expect(shape({ kind: 'circle', radius: 1 })).toEqual({ kind: 'circle', radius: 1 });

        const result = safeParse(shape, { kind: 'circle', radius: 'two' });
        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues).toHaveLength(1);
        expect(result.issues[0]).toMatchObject({ path: 'radius', code: 'invalid_type' });
    });

    it('standard carries ~standard for schemas, validators and aliases', () => {
        for (const target of [{ id: 'number' } as const, isEmail, 'string' as const]) {
            const s = free.standard(target as never);
            expect(s['~standard'].version).toBe(1);
            expect(s['~standard'].vendor).toBe(free.STANDARD_VENDOR);
        }
    });

    it('standard does not decorate a validator the caller owns', () => {
        const mine = (v: unknown): string => String(v);
        const wrapped = free.standard(mine);

        expect(wrapped).not.toBe(mine);
        expect('~standard' in mine).toBe(false);
    });

    it('the class and the free form agree on standard()', () => {
        const schema = { id: 'number' } as const;
        const viaFree = free.standard(schema)['~standard'].validate({ id: 'x' });
        const viaClass = typer.standard(schema)['~standard'].validate({ id: 'x' });

        expect(viaFree).toEqual(viaClass);
    });
});

describe('the entry points compose', () => {
    it('core + validators + combinators', () => {
        const schema = {
            contacts: free.arrayOf(free.objectOf({ email: isEmail })),
            note: free.optional((v: unknown) => String(v)),
        };

        expect(parse(schema, { contacts: [{ email: 'a@b.co' }] })).toBeDefined();

        const result = safeParse(schema, { contacts: [{ email: 'nope' }] });
        expect(result.success).toBe(false);
    });
});
