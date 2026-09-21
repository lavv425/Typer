import { parse, safeParse, createRegistry } from '../src/core';
import { objectOf, discriminatedUnion, standard } from '../src/combinators';
import { Typer, TyperError } from '../src/Typer';

const typer = new Typer();
const userSchema = { id: 'number', name: 'string' } as const;
const withExtra = () => ({ id: 1, name: 'ada', role: 'admin' });

/**
 * 5.0 makes `strict` the default — the audit's P0-2 option (a), deferred from
 * 4.1 because it is a breaking change.
 *
 * 4.1 already stripped `__proto__`, `constructor` and `prototype`; this closes
 * the rest. "Validated" now means the object has the keys the schema declares
 * and no others, which is what `success: true` always looked like it promised.
 */
describe('undeclared keys are rejected by default', () => {
    it.each([
        ['free parse', () => parse(userSchema, withExtra())],
        ['class parse', () => typer.parse(userSchema, withExtra())],
        ['objectOf', () => objectOf(userSchema)(withExtra())],
        ['class objectOf', () => typer.objectOf(userSchema)(withExtra())],
    ])('%s throws', (_label, run) => {
        expect(run).toThrow(TyperError);
    });

    it.each([
        ['free safeParse', () => safeParse(userSchema, withExtra())],
        ['class safeParse', () => typer.safeParse(userSchema, withExtra())],
    ])('%s reports unexpected_key', (_label, run) => {
        const result = run();
        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues[0]).toMatchObject({ code: 'unexpected_key', path: 'role' });
    });

    it('reports it through checkStructure too', () => {
        expect(typer.checkStructure(userSchema, withExtra()).isValid).toBe(false);
    });

    it('reports it through Standard Schema', () => {
        const result = standard(userSchema)['~standard'].validate(withExtra());
        expect((result as { issues?: unknown[] }).issues).toHaveLength(1);
    });

    it('applies inside nested objects', () => {
        const result = safeParse({ addr: { city: 'string' } }, { addr: { city: 'Rome', zip: '00100' } });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues[0]).toMatchObject({ code: 'unexpected_key', path: 'addr.zip' });
    });

    it('applies inside objects in arrays', () => {
        const result = safeParse({ items: [{ qty: 'number' }] }, { items: [{ qty: 1, note: 'x' }] });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues[0]).toMatchObject({ code: 'unexpected_key', path: 'items[0].note' });
    });

    it('applies with a custom registry', () => {
        const registry = createRegistry({ positive: (v: unknown): number => Number(v) });
        expect(safeParse({ qty: 'positive' }, { qty: 1, extra: true }, { registry }).success).toBe(false);
    });

    it('does not flag a declared optional key that is absent', () => {
        expect(safeParse({ id: 'number', note: 'string?' }, { id: 1 }).success).toBe(true);
    });

    it('does not flag the discriminant of a discriminatedUnion', () => {
        const shape = discriminatedUnion('kind', { circle: { radius: 'number' } });
        expect(shape({ kind: 'circle', radius: 1 })).toEqual({ kind: 'circle', radius: 1 });
    });

    it('still strips dangerous keys rather than reporting them', () => {
        // They are removed before the extra-key sweep, so a payload carrying
        // only those stays valid instead of becoming an error in 5.0.
        const payload = JSON.parse('{"id":1,"name":"ada","__proto__":{"admin":true}}');
        expect(safeParse(userSchema, payload).success).toBe(true);
        expect(Object.keys(payload)).toEqual(['id', 'name']);
    });
});

describe('opting out restores 4.x behaviour', () => {
    it.each([
        ['free parse', () => safeParse(userSchema, withExtra(), { strict: false })],
        ['objectOf', () => safeParse(objectOf(userSchema, { strict: false }), withExtra())],
    ])('%s accepts undeclared keys', (_label, run) => {
        expect(run().success).toBe(true);
    });

    it('checkStructure accepts them with the flag off', () => {
        expect(typer.checkStructure(userSchema, withExtra(), '', false).isValid).toBe(true);
    });

    it('standard accepts them with the flag off', () => {
        const result = standard(userSchema, { strict: false })['~standard'].validate(withExtra());
        expect((result as { issues?: unknown[] }).issues).toBeUndefined();
    });

    it('leaves the value untouched when it opts out', () => {
        const payload = withExtra();
        expect(parse(userSchema, payload, { strict: false })).toBe(payload);
        expect(Object.keys(payload)).toEqual(['id', 'name', 'role']);
    });
});
