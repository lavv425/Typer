import { Typer } from '../src/Typer';

/**
 * Targeted tests that close the coverage gaps left over after the
 * commit-6 predicate fast-path optimization.
 *
 * The fast-path bypasses `typesMap` for built-in aliases when you call
 * `is()`/`isType()`, which leaves the `return p` of every `t*` private
 * method un-hit by those public APIs. They are still reachable through
 * the schema compiler — `compileStringField` / `compileValue` call the
 * checkers directly — so we drive each one via `parse(schema, payload)`.
 *
 * The same idea covers the closure-compiler's error branches and the
 * custom-type predicate-wrapper path inside `getPred`.
 */
describe('Coverage completion', () => {
    let typer: Typer;

    beforeEach(() => {
        typer = new Typer();
    });

    describe('Every t* method via schema parsing (covers `return p` lines)', () => {
        it('parses every built-in type-string with a passing value', () => {
            const buf = new ArrayBuffer(8);
            const dv = new DataView(buf);
            const ta = new Int32Array(2);
            const sym = Symbol('s');
            const fn = (): number => 1;
            const map = new Map<string, string>([['k', 'v']]);
            const set = new Set<number>([1]);
            const date = new Date('2024-01-01');
            const re = /a/;

            const schema = typer.schema({
                arr: 'array',
                ab: 'array_buffer',
                bi: 'bigint',
                bool: 'boolean',
                dview: 'data_view',
                date: 'date',
                fn: 'function',
                json: 'json',
                m: 'map',
                obj: 'object',
                re: 'regexp',
                set: 'set',
                str: 'string',
                num: 'number',
                sym: 'symbol',
                ta: 'typed_array',
            });

            // Driving every checker through the schema compiler — `c.call(this, v)`
            // ends up calling each `t*` private method, hitting their `return p`.
            const out = typer.parse(schema, {
                arr: [1, 2, 3],
                ab: buf,
                bi: 5n,
                bool: true,
                dview: dv,
                date,
                fn,
                json: '{"a":1}',
                m: map,
                obj: { x: 1 },
                re,
                set,
                str: 'hi',
                num: 42,
                sym,
                ta,
            });

            expect(out.num).toBe(42);
        });

        it('covers tNull return via a non-optional `null` field with null value', () => {
            // null on a non-optional field falls through to the checker (tNull),
            // which returns p — the `return p` line at the end of tNull.
            const schema = typer.schema({ x: 'null' });
            typer.parse(schema, { x: null });
        });

        it('covers tUndefined return via an array element of type `undefined`', () => {
            // The field-level `undefined` intercept can't be bypassed for an object
            // key, but inside an array element `compileValue` falls through and
            // calls the checker with the undefined value.
            const schema = typer.schema({ vals: ['undefined'] });
            typer.parse(schema, { vals: [undefined, undefined] });
        });

        it('covers tDomElement return when HTMLElement is mocked globally', () => {
            const Mock = class MockElement {};
            (global as unknown as { HTMLElement: unknown }).HTMLElement = Mock;
            try {
                const schema = typer.schema({ el: 'dom' });
                typer.parse(schema, { el: new Mock() });
            } finally {
                delete (global as unknown as { HTMLElement?: unknown }).HTMLElement;
            }
        });

        it('covers tDomElement TypeError throw with mock + non-instance value', () => {
            // With HTMLElement defined, the predicate returns false for {} and
            // the slow path falls back to the checker, which throws a TypeError
            // (rather than the ReferenceError we'd see in a vanilla Node env).
            const Mock = class MockElement {};
            (global as unknown as { HTMLElement: unknown }).HTMLElement = Mock;
            try {
                expect(() => typer.isType('dom', {})).toThrow('must be a DOM element');
            } finally {
                delete (global as unknown as { HTMLElement?: unknown }).HTMLElement;
            }
        });
    });

    describe('Custom types via getPred wrapped predicate', () => {
        it('is/isType use a wrapped predicate for custom types and cache it', () => {
            typer.registerType('positive', (v: unknown) => {
                if (typeof v !== 'number' || v <= 0) {
                    throw new TypeError('not positive');
                }
                return v;
            });

            // First call populates predCache with the wrapped checker.
            expect(typer.is(5, 'positive')).toBe(true);
            expect(typer.is(-3, 'positive')).toBe(false);
            // Second hit is from cache (re-uses the same wrapper closure).
            expect(typer.is(7, 'positive')).toBe(true);

            // isType also goes through the wrapped predicate on the happy path.
            expect(typer.isType('positive', 9)).toBe(9);
            expect(() => typer.isType('positive', -1)).toThrow('not positive');
        });

        it('predCache caches `null` for unknown types and re-throws fast', () => {
            expect(() => typer.is(1, 'absolutely-not-a-type')).toThrow('Unknown type');
            // Second call hits the cached null and throws without re-resolving.
            expect(() => typer.is(2, 'absolutely-not-a-type')).toThrow('Unknown type');
        });

        it('registerType clears predCache so previously-unknown types resolve', () => {
            expect(() => typer.is(1, 'newtype')).toThrow('Unknown type');
            typer.registerType('newtype', (v: unknown) => {
                if (typeof v !== 'string') throw new TypeError('not string');
                return v;
            });
            expect(typer.is('hi', 'newtype')).toBe(true);
        });

        it('unregisterType clears predCache so removed types fail fast', () => {
            typer.registerType('temp', (v: unknown) => v);
            expect(typer.is(1, 'temp')).toBe(true);
            typer.unregisterType('temp');
            expect(() => typer.is(1, 'temp')).toThrow('Unknown type');
        });
    });

    describe('Closure-compiler error branches (compileField / compileStringField / compileArrayField / compileNestedField)', () => {
        it('rejects schemas with non-object/array/string field values', () => {
            const r = typer.safeParse({ x: 123 } as never, {});
            expect(r.success).toBe(false);
            if (!r.success) expect(r.error.message).toContain('Invalid schema definition');
        });

        it('rejects empty type definitions', () => {
            const r = typer.safeParse({ x: '' } as never, { x: 1 });
            expect(r.success).toBe(false);
            if (!r.success) expect(r.error.message).toContain('Empty type definition');
        });

        it('rejects pipe-only type definitions', () => {
            const r = typer.safeParse({ x: '|' } as never, { x: 1 });
            expect(r.success).toBe(false);
            if (!r.success) expect(r.error.message).toContain('Invalid type definition');
        });

        it('reports unknown types referenced from a schema', () => {
            const r = typer.safeParse({ x: 'banana' } as never, { x: 1 });
            expect(r.success).toBe(false);
            if (!r.success) expect(r.error.message).toContain('Unknown type');
        });

        it('rejects empty array schemas', () => {
            const r = typer.safeParse({ xs: [] } as never, { xs: [] });
            expect(r.success).toBe(false);
            if (!r.success) expect(r.error.message).toContain('Empty array schema');
        });

        it('rejects array schemas with multiple element entries', () => {
            const r = typer.safeParse({ xs: ['string', 'number'] } as never, { xs: [] });
            expect(r.success).toBe(false);
            if (!r.success) expect(r.error.message).toContain('exactly one element');
        });

        it('rejects invalid array element types (number)', () => {
            const r = typer.safeParse({ xs: [123] } as never, { xs: [] });
            expect(r.success).toBe(false);
            if (!r.success) expect(r.error.message).toContain('Array element type');
        });

        it('reports a missing required array field', () => {
            const r = typer.safeParse({ xs: ['string'] } as never, {});
            expect(r.success).toBe(false);
            if (!r.success) expect(r.error.message).toContain('Missing required key "xs"');
        });

        it('reports a non-array value for an array field', () => {
            const r = typer.safeParse({ xs: ['string'] } as never, { xs: 'not-array' });
            expect(r.success).toBe(false);
            if (!r.success) expect(r.error.message).toContain('to be an array');
        });

        it('reports a missing required nested-object field', () => {
            const r = typer.safeParse({ user: { name: 'string' } } as never, {});
            expect(r.success).toBe(false);
            if (!r.success) expect(r.error.message).toContain('Missing required key "user"');
        });

        it('reports a non-object value for a nested-object field', () => {
            const r = typer.safeParse({ user: { name: 'string' } } as never, { user: 'oops' });
            expect(r.success).toBe(false);
            if (!r.success) expect(r.error.message).toContain('to be an object');
        });

        it('rejects non-object inputs to parse()', () => {
            const schema = typer.schema({ x: 'string' });
            const r1 = typer.safeParse(schema, 42 as never);
            expect(r1.success).toBe(false);
            if (!r1.success) expect(r1.error.message).toContain('Invalid object');

            const r2 = typer.safeParse(schema, null as never);
            expect(r2.success).toBe(false);

            const r3 = typer.safeParse(schema, [] as never);
            expect(r3.success).toBe(false);
        });
    });

    describe('compileValue branches (array-element specifics)', () => {
        it('runs a validator function inside an array', () => {
            const schema = typer.schema({ xs: [typer.isPositiveInteger.bind(typer)] });
            typer.parse(schema, { xs: [1, 2, 3] });

            const r = typer.safeParse(schema, { xs: [1, -2, 3] });
            expect(r.success).toBe(false);
            if (!r.success) expect(r.error.message).toContain('Validation failed');
        });

        it('rejects empty type definitions inside an array element', () => {
            const r = typer.safeParse({ xs: [''] } as never, { xs: ['hi'] });
            expect(r.success).toBe(false);
            if (!r.success) expect(r.error.message).toContain('Empty type definition');
        });

        it('rejects pipe-only type definitions inside an array element', () => {
            const r = typer.safeParse({ xs: ['|'] } as never, { xs: ['hi'] });
            expect(r.success).toBe(false);
            if (!r.success) expect(r.error.message).toContain('Invalid type definition');
        });

        it('reports unknown types inside an array element', () => {
            const r = typer.safeParse({ xs: ['banana'] } as never, { xs: [1] });
            expect(r.success).toBe(false);
            if (!r.success) expect(r.error.message).toContain('Unknown type');
        });

        it('reports type mismatches per array index', () => {
            const r = typer.safeParse({ xs: ['number'] } as never, { xs: [1, 'oops', 3] });
            expect(r.success).toBe(false);
            if (!r.success) expect(r.error.message).toContain('xs[1]');
        });

        it('parses nested object inside an array element', () => {
            const schema = typer.schema({ xs: [{ name: 'string' }] });
            typer.parse(schema, { xs: [{ name: 'a' }, { name: 'b' }] });
        });

        it('rejects non-object array elements when the element schema is a nested object', () => {
            const schema = typer.schema({ xs: [{ name: 'string' }] });
            const r = typer.safeParse(schema, { xs: [{ name: 'a' }, 'oops'] });
            expect(r.success).toBe(false);
            if (!r.success) expect(r.error.message).toContain('to be an object');
        });

        it('skips optional undefined / null inside an array element', () => {
            // Optional element type — covers compileValue's value === undefined / null
            // early-return branches.
            const schema = typer.schema({ xs: ['string?'] });
            typer.parse(schema, { xs: ['a', undefined, null, 'b'] });
        });
    });

    describe('Defensive returns', () => {
        it('parse rejects non-schema, non-string, non-validator first args', () => {
            expect(() => typer.parse(42 as never, 'x')).toThrow('Invalid first argument');
        });

        it('isNonEmpty rejects values that are not containers', () => {
            expect(() => typer.isNonEmpty(42)).toThrow('not a container');
            expect(() => typer.isNonEmpty(null)).toThrow('not a container');
        });
    });

    describe('getType branches via error messages', () => {
        // getType is reached when a schema validation fails and we need to format
        // "got <type>" — exercise each branch by triggering a mismatch where the
        // *value* is of the type getType is asked to identify.
        it('formats date / regexp / map / set values in error messages', () => {
            const schema = typer.schema({ x: 'string' });
            const re = typer.safeParse(schema, { x: /a/ });
            expect(re.success).toBe(false);
            if (!re.success) expect(re.error.message).toContain('regexp');

            const dt = typer.safeParse(schema, { x: new Date() });
            expect(dt.success).toBe(false);
            if (!dt.success) expect(dt.error.message).toContain('date');

            const m = typer.safeParse(schema, { x: new Map() });
            expect(m.success).toBe(false);
            if (!m.success) expect(m.error.message).toContain('map');

            const s = typer.safeParse(schema, { x: new Set() });
            expect(s.success).toBe(false);
            if (!s.success) expect(s.error.message).toContain('set');
        });
    });

    describe('Legacy validateSchemaValue function-entry branch', () => {
        it('checkStructure runs validator function entries on success', () => {
            const r = typer.checkStructure(
                { x: typer.isPositiveInteger.bind(typer) } as Record<string, unknown>,
                { x: 5 },
            );
            expect(r.isValid).toBe(true);
        });

        it('checkStructure reports errors from validator function entries', () => {
            const r = typer.checkStructure(
                { x: typer.isPositiveInteger.bind(typer) } as Record<string, unknown>,
                { x: -3 },
            );
            expect(r.isValid).toBe(false);
            expect(r.errors.some(e => e.includes('Validation failed at "x"'))).toBe(true);
        });
    });
});
