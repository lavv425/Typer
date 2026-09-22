import { Typer } from '../src/Typer';

const typer = new Typer();

/**
 * The payload that motivated this: `JSON.parse` turns `__proto__` and
 * `constructor` into ordinary own data properties, and Typer validates in
 * place and returns the same reference — so without stripping they survive a
 * `success: true` and get a second chance at the first spread or ORM update.
 */
const pollutedPayload = () => JSON.parse('{"id":1,"name":"ada","__proto__":{"admin":true},"constructor":{"x":1}}');

describe('undeclared dangerous keys', () => {
    const schema = { id: 'number', name: 'string' } as const;

    it('strips them from a validated object', () => {
        const payload = pollutedPayload();
        const result = typer.safeParse(schema, payload);

        expect(result.success).toBe(true);
        expect(Object.keys(payload)).toEqual(['id', 'name']);
    });

    it('validates successfully, so a clean payload is unaffected', () => {
        const payload = { id: 1, name: 'ada' };
        expect(typer.parse(schema, payload)).toBe(payload);
        expect(Object.keys(payload)).toEqual(['id', 'name']);
    });

    it('does the same through parse(), objectOf() and checkStructure()', () => {
        const viaParse = pollutedPayload();
        typer.parse(schema, viaParse);
        expect(Object.keys(viaParse)).toEqual(['id', 'name']);

        const viaObjectOf = pollutedPayload();
        typer.objectOf(schema)(viaObjectOf);
        expect(Object.keys(viaObjectOf)).toEqual(['id', 'name']);

        const viaCheckStructure = pollutedPayload();
        expect(typer.checkStructure(schema, viaCheckStructure).isValid).toBe(true);
        expect(Object.keys(viaCheckStructure)).toEqual(['id', 'name']);
    });

    it('strips them from nested objects', () => {
        const payload = JSON.parse('{"user":{"id":1,"__proto__":{"admin":true}}}');
        typer.parse({ user: { id: 'number' } }, payload);

        expect(Object.keys(payload.user)).toEqual(['id']);
    });

    it('strips them from objects inside arrays', () => {
        const payload = JSON.parse('{"items":[{"qty":1},{"qty":2,"constructor":{"x":1}}]}');
        typer.parse({ items: [{ qty: 'number' }] }, payload);

        expect(Object.keys(payload.items[1])).toEqual(['qty']);
    });

    it('leaves the global prototype alone either way', () => {
        typer.parse(schema, pollutedPayload());
        expect(({} as Record<string, unknown>).admin).toBeUndefined();
    });

    it('closes the downstream spread that made this exploitable', () => {
        const payload = pollutedPayload();
        typer.parse(schema, payload);

        const merged = { ...payload };
        expect(Object.getPrototypeOf(merged)).toBe(Object.prototype);
        expect((merged as Record<string, unknown>).admin).toBeUndefined();
    });

    it('keeps them when the schema declares them as real fields', () => {
        const payload = JSON.parse('{"id":1,"constructor":"factory"}');
        const result = typer.safeParse({ id: 'number', constructor: 'string' }, payload);

        expect(result.success).toBe(true);
        expect(payload.constructor).toBe('factory');
    });

    it('validates a declared dangerous key like any other', () => {
        const payload = JSON.parse('{"id":1,"constructor":42}');
        const result = typer.safeParse({ id: 'number', constructor: 'string' }, payload);

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues[0]).toMatchObject({ code: 'invalid_type', path: 'constructor' });
    });

    it('reports an issue when the key cannot be removed', () => {
        const payload = Object.freeze(JSON.parse('{"id":1,"name":"ada","__proto__":{"admin":true}}'));
        const result = typer.safeParse(schema, payload);

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues[0]).toMatchObject({ code: 'dangerous_key', path: '__proto__' });
        expect(result.issues[0].message).toContain('frozen');
    });

    it('does not report unexpected_key for stripped keys in strict mode', () => {
        const payload = pollutedPayload();
        const result = typer.safeParse(typer.objectOf(schema, { strict: true }), payload);

        expect(result.success).toBe(true);
    });

    it('still reports genuinely unexpected keys in strict mode', () => {
        const payload = JSON.parse('{"id":1,"name":"ada","role":"admin","__proto__":{"x":1}}');
        const result = typer.safeParse(typer.objectOf(schema, { strict: true }), payload);

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues.map((i) => i.path)).toEqual(['role']);
    });
});

describe('the fast pre-check does not change any outcome', () => {
    const schema = { id: 'number' } as const;

    // These shapes all fail the cheap probe and fall through to the exact
    // hasOwnProperty check — which must then find nothing and pass.
    it('accepts a null-prototype object', () => {
        const payload = Object.assign(Object.create(null), { id: 1 });
        expect(typer.safeParse(schema, payload).success).toBe(true);
        expect(Object.keys(payload)).toEqual(['id']);
    });

    it('accepts a class instance', () => {
        class Dto { public id = 1; }
        const payload = new Dto();

        expect(typer.safeParse(schema, payload).success).toBe(true);
        expect(payload.id).toBe(1);
    });

    it('still strips when only __proto__ is present', () => {
        // The case Object.getPrototypeOf() cannot see: JSON.parse defines the
        // key without ever invoking the setter.
        const payload = JSON.parse('{"id":1,"__proto__":{"admin":true}}');
        expect(Object.getPrototypeOf(payload)).toBe(Object.prototype);

        typer.parse(schema, payload);
        expect(Object.keys(payload)).toEqual(['id']);
    });

    it('still strips when only prototype is present', () => {
        const payload = JSON.parse('{"id":1,"prototype":{"admin":true}}');
        typer.parse(schema, payload);

        expect(Object.keys(payload)).toEqual(['id']);
    });

    it('strips a null-valued __proto__', () => {
        const payload = JSON.parse('{"id":1,"__proto__":null}');
        typer.parse(schema, payload);

        expect(Object.keys(payload)).toEqual(['id']);
    });
});

describe('record() dangerous keys', () => {
    it('drops them instead of writing them onto the result', () => {
        const scores = typer.record((v) => typer.asNumber(v));
        const out = scores(JSON.parse('{"alice":1,"__proto__":2,"constructor":3}'));

        expect(out).toEqual({ alice: 1 });
        expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    });
});
