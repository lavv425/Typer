import { createRegistry } from '../src/core';
import { BUILTIN_CONTEXT } from '../src/Core/Registry';
import { getCompiledChecker } from '../src/Core/Compile';
import { jitChecker, jitSource } from '../src/Core/Jit';
import { compile, canGenerate } from '../src/jit';

/**
 * The generated checker and the closure-compiled one must be
 * indistinguishable. Anything else is a silent behaviour change that a
 * consumer opts into by importing a different module, which is the one thing
 * this entry point must not do.
 *
 * So the suite does not assert what the generator emits — it asserts that the
 * two back ends agree, issue for issue, on a corpus wide enough to cover every
 * form the generator claims to specialise and a sample of the ones it
 * delegates.
 */

const positive = (v: unknown): number => {
    if (typeof v !== 'number' || v <= 0) throw new TypeError('Must be positive');
    return v;
};
const registry = createRegistry({ positive });

/** Schemas paired with values that should exercise both outcomes. */
const CASES: Array<{ name: string; schema: Record<string, unknown>; values: unknown[] }> = [
    {
        name: 'flat required slots',
        schema: { id: 'number', email: 'string', ok: 'boolean' },
        values: [
            { id: 1, email: 'a@b.co', ok: true },
            { id: 'x', email: 2, ok: null },
            { id: 1 },
            {},
        ],
    },
    {
        name: 'optional and nullable',
        schema: { id: 'number', note: 'string?', tag: 'string?' },
        values: [
            { id: 1 },
            { id: 1, note: null, tag: 'x' },
            { id: 1, note: 5 },
            { id: 1, note: undefined },
        ],
    },
    {
        name: 'unions',
        schema: { v: 'string|number', w: 'string|number|boolean?' },
        values: [
            { v: 'a', w: 1 },
            { v: 1, w: true },
            { v: true, w: {} },
            { v: null, w: null },
        ],
    },
    {
        name: 'inline bounds',
        schema: { s: 'string(3,50)', n: 'number(1,)', a: 'array(,2)' },
        values: [
            { s: 'abc', n: 1, a: [1] },
            { s: 'ab', n: 0, a: [1, 2, 3] },
            { s: 'x'.repeat(60), n: 5, a: [] },
            { s: 5, n: 'x', a: 'no' },
        ],
    },
    {
        name: 'bounds inside a union',
        schema: { v: 'string(2,4)|number(10,20)' },
        values: [{ v: 'abc' }, { v: 'a' }, { v: 15 }, { v: 99 }, { v: true }],
    },
    {
        name: 'unknown alias',
        schema: { id: 'nubmer', ok: 'boolean' },
        values: [{ id: 1, ok: true }, { id: 'x', ok: 'y' }],
    },
    {
        name: 'malformed bound',
        schema: { s: 'string(a,b)', t: 'string(1,2,3)' },
        values: [{ s: 'x', t: 'y' }],
    },
    {
        name: 'empty and invalid slot forms',
        schema: { a: '', b: 42, c: null, d: [], e: ['a', 'b'] },
        values: [{ a: 1, b: 2, c: 3, d: [], e: [] }],
    },
    {
        name: 'arrays of type strings',
        schema: { tags: ['string'], nums: ['number?'] },
        values: [
            { tags: ['a'], nums: [1, null] },
            { tags: ['a', 2, 'c'], nums: ['x'] },
            { tags: 'nope', nums: [] },
            {},
        ],
    },
    {
        name: 'array with bounds on the element',
        schema: { codes: ['string(2,3)'] },
        values: [{ codes: ['ab', 'abcd', 'x'] }],
    },
    {
        name: 'nested objects',
        schema: { user: { name: 'string', addr: { city: 'string', zip: 'number' } } },
        values: [
            { user: { name: 'a', addr: { city: 'b', zip: 1 } } },
            { user: { name: 1, addr: { city: 2, zip: 'x' } } },
            { user: { name: 'a' } },
            { user: null },
            { user: [] },
            {},
        ],
    },
    {
        name: 'array of objects — delegated',
        schema: { items: [{ sku: 'string' }] },
        values: [{ items: [{ sku: 'a' }, { sku: 2 }] }, { items: 'no' }],
    },
    {
        name: 'validator slots — delegated',
        schema: { qty: positive, id: 'number' },
        values: [{ qty: 5, id: 1 }, { qty: -1, id: 1 }, { qty: 'x', id: 1 }, { id: 1 }],
    },
    {
        name: 'keys needing bracket access',
        schema: { 'a-b': 'string', 'with space': 'number', '0leading': 'boolean', 'class': 'string' },
        values: [
            { 'a-b': 'x', 'with space': 1, '0leading': true, 'class': 'c' },
            { 'a-b': 1, 'with space': 'x', '0leading': 'no', 'class': 2 },
        ],
    },
    {
        name: 'a schema declaring dangerous keys itself',
        schema: { constructor: 'string', id: 'number' },
        values: [{ constructor: 'x', id: 1 }],
    },
    {
        name: 'wide schema, past the Set threshold',
        schema: Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`k${i}`, 'number'])),
        values: [
            Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`k${i}`, i])),
            { k0: 'x', extra: 1 },
        ],
    },
];

/** Payloads carrying prototype-polluting keys, which must be stripped in place. */
const DANGEROUS = [
    '{"id":1,"__proto__":{"admin":true}}',
    '{"id":1,"constructor":2,"prototype":3}',
    '{"user":{"name":"a","__proto__":{"x":1}},"id":1}',
];

const both = (schema: Record<string, unknown>, value: unknown, strict: boolean) => {
    const interpreted = getCompiledChecker(BUILTIN_CONTEXT, schema, strict);
    const generated = jitChecker(BUILTIN_CONTEXT, schema, strict);
    expect(generated).not.toBeNull();
    return { interpreted, generated: generated! };
};

describe('the generated checker matches the closure compiler', () => {
    for (const strict of [false, true]) {
        describe(`strict: ${String(strict)}`, () => {
            for (const { name, schema, values } of CASES) {
                it(name, () => {
                    const { interpreted, generated } = both(schema, values[0], strict);

                    for (const value of values) {
                        const a = interpreted(structuredClone(value), '');
                        const b = generated(structuredClone(value), '');
                        expect(b).toEqual(a);
                    }
                });
            }
        });
    }

    it('agrees on non-object roots', () => {
        const { interpreted, generated } = both({ id: 'number' }, null, true);
        for (const value of [null, undefined, 1, 'x', true, [], new Date()]) {
            expect(generated(value, '')).toEqual(interpreted(value, ''));
        }
    });

    it('agrees on a non-empty root path', () => {
        const schema = { user: { city: 'string' }, tags: ['string'] };
        const { interpreted, generated } = both(schema, {}, true);
        const value = { user: { city: 1 }, tags: [2], extra: true };

        expect(generated(structuredClone(value), 'body')).toEqual(interpreted(structuredClone(value), 'body'));
    });

    it('strips dangerous keys the same way, in place', () => {
        for (const raw of DANGEROUS) {
            const schema = { id: 'number', user: { name: 'string' } };
            const { interpreted, generated } = both(schema, {}, false);

            const a = JSON.parse(raw) as Record<string, unknown>;
            const b = JSON.parse(raw) as Record<string, unknown>;

            expect(generated(b, '')).toEqual(interpreted(a, ''));
            expect(Object.keys(b)).toEqual(Object.keys(a));
            expect(JSON.stringify(b)).toBe(JSON.stringify(a));
        }
    });

    it('writes back what a delegated validator produced', () => {
        const schema = { qty: (v: unknown) => Number(v) * 2 };
        const { generated } = both(schema, {}, false);

        const value = { qty: 21 };
        expect(generated(value, '')).toEqual([]);
        expect(value.qty).toBe(42);
    });

    it('resolves custom aliases through a registry', () => {
        const schema = { qty: 'positive' };
        const interpreted = getCompiledChecker(registry.context, schema, true);
        const generated = jitChecker(registry.context, schema, true);

        for (const value of [{ qty: 2 }, { qty: -1 }, { qty: 'x' }, {}]) {
            expect(generated!(value, '')).toEqual(interpreted(value, ''));
        }
    });
});

describe('the compiled schema API', () => {
    const user = compile({ id: 'number', email: 'string', note: 'string?' });

    it('parses and reports like the free API', () => {
        expect(user.parse({ id: 1, email: 'a@b.co' })).toEqual({ id: 1, email: 'a@b.co' });
        expect(() => user.parse({ id: 'x', email: 'a@b.co' })).toThrow('Validation failed');
    });

    it('safeParse carries structured issues', () => {
        const result = user.safeParse({ id: 'x', email: 1 });
        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues).toHaveLength(2);
        expect(result.issues[0]).toMatchObject({ code: 'invalid_type', path: 'id' });
    });

    it('is strict by default and can opt out', () => {
        expect(user.safeParse({ id: 1, email: 'a@b.co', extra: true }).success).toBe(false);

        const loose = compile({ id: 'number' }, { strict: false });
        expect(loose.safeParse({ id: 1, extra: true }).success).toBe(true);
    });

    it('reports whether it is actually generating', () => {
        expect(user.generated).toBe(true);
        expect(canGenerate()).toBe(true);
    });

    it('honours a registry', () => {
        const order = compile({ qty: 'positive' }, { registry });
        expect(order.safeParse({ qty: 2 }).success).toBe(true);
        expect(order.safeParse({ qty: -1 }).success).toBe(false);
    });
});

describe('the generator specialises what it claims to', () => {
    it('folds a nested path into one literal rather than joining per level', () => {
        const source = jitSource(BUILTIN_CONTEXT, { a: { b: { c: 'string' } } }, false);
        expect(source).toContain('"a.b.c"');
    });

    it('reads identifier keys with a dot and quotes the rest', () => {
        const source = jitSource(BUILTIN_CONTEXT, { ok: 'string', 'not-ok': 'string' }, false);
        expect(source).toContain('value.ok');
        expect(source).toContain('value["not-ok"]');
    });

    it('delegates a validator slot instead of guessing at it', () => {
        const source = jitSource(BUILTIN_CONTEXT, { qty: positive }, false);
        expect(source).toContain('F[0]');
    });

    it('switches strict mode to a Set only past the threshold', () => {
        const narrow = jitSource(BUILTIN_CONTEXT, { a: 'string', b: 'string' }, true);
        const wide = jitSource(BUILTIN_CONTEXT, Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`k${i}`, 'number'])), true);

        expect(narrow).toContain('=== "a"');
        expect(narrow).not.toContain('.has(');
        expect(wide).toContain('.has(');
    });
});

/**
 * SECURITY.md states that only key names and type strings reach the generated
 * source, each quoted, and that a schema is data rather than code. A key
 * crafted to close the string it is emitted into would break both claims, so
 * they are held here rather than left as prose.
 */
describe('a hostile key name cannot escape the generated source', () => {
    const HOSTILE = [
        'a"; globalThis.__TYPER_PWNED__ = 1; //',
        "a'; globalThis.__TYPER_PWNED__ = 1; //",
        'a`); globalThis.__TYPER_PWNED__ = 1; //',
        'a\\',
        'a\n b',
        'a[0]',
        'p; issues.push(1); const q',
        '__proto__',
        'constructor',
    ];

    afterEach(() => {
        delete (globalThis as Record<string, unknown>).__TYPER_PWNED__;
    });

    it.each(HOSTILE)('%j is data, not code', (key) => {
        const schema = { [key]: 'string' };
        const generated = jitChecker(BUILTIN_CONTEXT, schema, false);
        expect(generated).not.toBeNull();

        expect((globalThis as Record<string, unknown>).__TYPER_PWNED__).toBeUndefined();

        // And it still validates, rather than being quietly skipped.
        expect(generated!({ [key]: 'x' }, '')).toEqual([]);
        expect(generated!({ [key]: 42 }, '')).toEqual(
            getCompiledChecker(BUILTIN_CONTEXT, schema, false)({ [key]: 42 }, ''),
        );
    });
});
