import { parse, safeParse, schema, createTyper, createRegistry, TyperError } from '../src/core';
import { Typer } from '../src/Typer';

/**
 * The free API must behave exactly like the class it was extracted from —
 * these are the same expectations the class's own suite makes, asserted
 * against the instance-free entry points.
 */
describe('parse (free function)', () => {
    const userSchema = { id: 'number', name: 'string', note: 'string?' } as const;

    it('returns the value, typed, on success', () => {
        const payload = { id: 1, name: 'ada' };
        expect(parse(userSchema, payload)).toBe(payload);
    });

    it('throws a TyperError listing every problem', () => {
        expect(() => parse(userSchema, { id: 'one' })).toThrow(TyperError);

        try {
            parse(userSchema, { id: 'one' });
        } catch (e) {
            expect((e as TyperError).issues.map((i) => [i.path, i.code])).toEqual([
                ['id', 'invalid_type'],
                ['name', 'missing_key'],
            ]);
            return;
        }
        throw new Error('expected a throw');
    });

    it('handles nested objects, arrays and unions', () => {
        const nested = {
            role: 'string|number',
            tags: ['string'],
            address: { city: 'string', zip: 'string?' },
        } as const;

        expect(safeParse(nested, { role: 1, tags: ['a'], address: { city: 'Rome' } }).success).toBe(true);

        const bad = safeParse(nested, { role: true, tags: [1], address: { city: 2 } });
        expect(bad.success).toBe(false);
        if (bad.success) return;
        expect(bad.issues.map((i) => i.path)).toEqual(['role', 'tags[0]', 'address.city']);
    });

    it('strips undeclared dangerous keys, like the class does', () => {
        const payload = JSON.parse('{"id":1,"name":"ada","__proto__":{"admin":true}}');
        parse(userSchema, payload);

        expect(Object.keys(payload)).toEqual(['id', 'name']);
    });

    it('honours strict mode', () => {
        expect(safeParse(userSchema, { id: 1, name: 'ada', extra: true }).success).toBe(true);

        const strict = safeParse(userSchema, { id: 1, name: 'ada', extra: true }, { strict: true });
        expect(strict.success).toBe(false);
        if (strict.success) return;
        expect(strict.issues[0]).toMatchObject({ code: 'unexpected_key', path: 'extra' });
    });

    it('applies a transforming validator slot', () => {
        const payload: Record<string, unknown> = { when: '2026-09-21T00:00:00.000Z' };
        const typer = new Typer();
        parse({ when: typer.validators.isISODate }, payload);

        expect(payload.when).toBeInstanceOf(Date);
    });

    it('caches by schema object identity', () => {
        const hoisted = schema({ id: 'number' });
        expect(parse(hoisted, { id: 1 })).toEqual({ id: 1 });
        expect(parse(hoisted, { id: 2 })).toEqual({ id: 2 });
    });
});

describe('a validator passed where a schema goes', () => {
    // `Object.keys` of a function is empty, so a validator handed to the
    // schema path used to compile to a schema with no fields — validating
    // nothing and reporting success. Silent acceptance is the worst failure a
    // validation library has, so this is pinned.
    const failing = (v: unknown): number => {
        if (typeof v !== 'number') throw new TypeError('must be a number');
        return v;
    };

    it('runs the validator rather than treating it as an empty schema', () => {
        expect(() => parse(failing, 'nope')).toThrow('must be a number');
        expect(parse(failing, 7)).toBe(7);
    });

    it('reports failure through safeParse', () => {
        const result = safeParse(failing, 'nope');

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues[0].message).toContain('must be a number');
    });

    it('uses a combinator’s non-throwing path when it has one', () => {
        const typer = new Typer();
        const result = safeParse(typer.objectOf({ id: 'number' }), { id: 'x' });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues[0]).toMatchObject({ path: 'id', code: 'invalid_type' });
    });
});

describe('safeParse (free function)', () => {
    it('reports success without throwing', () => {
        expect(safeParse({ id: 'number' }, { id: 1 })).toEqual({ success: true, data: { id: 1 } });
    });

    it('builds the error only when it is read', () => {
        const result = safeParse({ id: 'number' }, { id: 'one' });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues).toHaveLength(1);
        expect(result.error).toBeInstanceOf(TyperError);
        expect(result.error).toBe(result.error);
    });

    it('rejects a non-object at the root path', () => {
        const result = safeParse({ id: 'number' }, 'nope');

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues[0]).toMatchObject({ code: 'invalid_type', path: '', received: 'string' });
    });
});

describe('createRegistry', () => {
    const registry = createRegistry({
        positive: (v: unknown): number => {
            if (typeof v !== 'number' || v <= 0) throw new TypeError('Must be positive');
            return v;
        },
    });

    it('resolves a custom alias named by a type string', () => {
        expect(safeParse({ qty: 'positive' }, { qty: 5 }, { registry }).success).toBe(true);
        expect(safeParse({ qty: 'positive' }, { qty: -1 }, { registry }).success).toBe(false);
    });

    it('composes with the optional marker and with unions', () => {
        expect(safeParse({ qty: 'positive?' }, {}, { registry }).success).toBe(true);
        expect(safeParse({ qty: 'positive?' }, { qty: null }, { registry }).success).toBe(true);
        expect(safeParse({ qty: 'positive|string' }, { qty: 'x' }, { registry }).success).toBe(true);
    });

    it('composes with array slots', () => {
        expect(safeParse({ qty: ['positive'] }, { qty: [1, 2] }, { registry }).success).toBe(true);
        expect(safeParse({ qty: ['positive'] }, { qty: [1, -2] }, { registry }).success).toBe(false);
    });

    it('reports an unregistered alias as unknown_type', () => {
        const result = safeParse({ qty: 'measure' } as never, { qty: 1 });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues[0]).toMatchObject({ code: 'unknown_type', expected: 'measure' });
    });

    it('does not leak aliases between registries', () => {
        const other = createRegistry({ negative: (v: unknown): number => Number(v) });
        const result = safeParse({ qty: 'positive' } as never, { qty: 1 }, { registry: other });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues[0].code).toBe('unknown_type');
    });

    it('lets a custom alias shadow a built-in', () => {
        const shadowing = createRegistry({
            string: (v: unknown): string => {
                if (typeof v !== 'string' || v.length === 0) throw new TypeError('non-empty required');
                return v;
            },
        });

        expect(safeParse({ a: 'string' }, { a: '' }, { registry: shadowing }).success).toBe(false);
        expect(safeParse({ a: 'string' }, { a: '' }).success).toBe(true);
    });

    it('does not resolve inherited object keys as aliases', () => {
        // The predicate maps are null-prototype, so 'constructor' and
        // 'toString' must be unknown aliases rather than functions.
        for (const alias of ['constructor', 'toString', 'hasOwnProperty']) {
            const result = safeParse({ a: alias } as never, { a: 1 }, { registry });
            expect(result.success).toBe(false);
            if (result.success) continue;
            expect(result.issues[0].code).toBe('unknown_type');
        }
    });
});

describe('createTyper', () => {
    const { parse: boundParse, safeParse: boundSafeParse, schema: boundSchema, registry } = createTyper({
        positive: (v: unknown): number => {
            if (typeof v !== 'number' || v <= 0) throw new TypeError('Must be positive');
            return v;
        },
    });

    it('binds the registry, so calls read like the instance API', () => {
        const orderSchema = boundSchema({ qty: 'positive', ref: 'string' });

        expect(boundParse(orderSchema, { qty: 2, ref: 'a' })).toEqual({ qty: 2, ref: 'a' });
        expect(boundSafeParse(orderSchema, { qty: -1, ref: 'a' }).success).toBe(false);
    });

    it('keeps working when destructured, which is what makes it tree-shakable', () => {
        const { parse: standalone } = createTyper({ positive: (v: unknown): number => Number(v) });
        expect(standalone({ qty: 'positive' }, { qty: 3 })).toEqual({ qty: 3 });
    });

    it('forwards strict mode', () => {
        const result = boundSafeParse({ qty: 'positive' }, { qty: 1, extra: true }, { strict: true });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues[0].code).toBe('unexpected_key');
    });

    it('exposes its registry for the other entry points', () => {
        expect(safeParse({ qty: 'positive' }, { qty: 1 }, { registry }).success).toBe(true);
    });
});

describe('the free API and the class agree', () => {
    const typer = new Typer();
    const cases: Array<[string, Record<string, unknown>, unknown]> = [
        ['flat valid', { id: 'number', name: 'string' }, { id: 1, name: 'a' }],
        ['flat invalid', { id: 'number', name: 'string' }, { id: 'one', name: 2 }],
        ['missing keys', { id: 'number', name: 'string' }, {}],
        ['nested invalid', { addr: { city: 'string' } }, { addr: { city: 1 } }],
        ['array invalid', { tags: ['string'] }, { tags: ['a', 2] }],
        ['optional null', { note: 'string?' }, { note: null }],
        ['unknown alias', { a: 'nubmer' }, { a: 1 }],
        ['root not an object', { id: 'number' }, 'nope'],
        ['malformed slot', { bad: 42 }, { bad: 1 }],
    ];

    it.each(cases)('%s', (_label, def, value) => {
        const viaClass = typer.safeParse(def as never, structuredClone(value));
        const viaFree = safeParse(def as never, structuredClone(value));

        expect(viaFree.success).toBe(viaClass.success);
        if (viaClass.success || viaFree.success) return;
        expect(viaFree.issues).toEqual(viaClass.issues);
    });
});
