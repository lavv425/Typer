import { Typer, TyperError } from '../src/Typer';

const typer = new Typer();

const shape = typer.discriminatedUnion('kind', {
    circle: { radius: 'number' },
    square: { side: 'number' },
    rect: { width: 'number', height: 'number' },
});

describe('discriminatedUnion', () => {
    it('accepts each variant', () => {
        expect(shape({ kind: 'circle', radius: 2 })).toEqual({ kind: 'circle', radius: 2 });
        expect(shape({ kind: 'square', side: 3 })).toEqual({ kind: 'square', side: 3 });
        expect(shape({ kind: 'rect', width: 1, height: 2 })).toEqual({ kind: 'rect', width: 1, height: 2 });
    });

    it('returns the same reference, like the rest of the library', () => {
        const payload = { kind: 'circle', radius: 2 };
        expect(shape(payload)).toBe(payload);
    });

    it('reports against the selected branch only — not every variant', () => {
        const result = typer.safeParse(shape, { kind: 'circle', radius: 'two' });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues).toHaveLength(1);
        expect(result.issues[0]).toMatchObject({ code: 'invalid_type', path: 'radius', expected: 'number' });
        // The linear union's failure mode: mentioning `side` when `kind` was
        // plainly 'circle'.
        expect(result.issues[0].message).not.toContain('side');
    });

    it('reports a missing discriminant at the discriminant key', () => {
        const result = typer.safeParse(shape, { radius: 2 });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues[0]).toMatchObject({ code: 'missing_key', path: 'kind' });
    });

    it('reports an unknown discriminant with the variants it does know', () => {
        const result = typer.safeParse(shape, { kind: 'triangle', base: 1 });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues[0]).toMatchObject({ code: 'invalid_type', path: 'kind' });
        expect(result.issues[0].expected).toBe('one of [circle, square, rect]');
    });

    it('rejects a non-object', () => {
        for (const value of ['nope', 42, null, [], undefined]) {
            const result = typer.safeParse(shape, value);
            expect(result.success).toBe(false);
        }
    });

    it('rejects a non-string discriminant', () => {
        const result = typer.safeParse(shape, { kind: 1, radius: 2 });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues[0]).toMatchObject({ code: 'invalid_type', path: 'kind', received: 'number' });
    });

    it('throws a TyperError from parse()', () => {
        expect(() => typer.parse(shape, { kind: 'circle', radius: 'two' })).toThrow(TyperError);
    });

    it('reports all the failures of the selected variant, not just the first', () => {
        const result = typer.safeParse(shape, { kind: 'rect', width: 'a', height: 'b' });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues.map((i) => i.path)).toEqual(['width', 'height']);
    });

    it('lets a variant declare the discriminant itself', () => {
        const tagged = typer.discriminatedUnion('kind', {
            circle: { kind: 'string', radius: 'number' },
        });

        expect(tagged({ kind: 'circle', radius: 1 })).toEqual({ kind: 'circle', radius: 1 });
    });

    it('does not flag the discriminant in strict mode', () => {
        const strict = typer.discriminatedUnion('kind', { circle: { radius: 'number' } }, { strict: true });

        expect(typer.safeParse(strict, { kind: 'circle', radius: 1 }).success).toBe(true);
        expect(typer.safeParse(strict, { kind: 'circle', radius: 1, extra: true }).success).toBe(false);
    });

    it('selects in constant time as variants are added', () => {
        // The point of the whole thing: a linear union pays for every variant
        // it has to try before reaching the matching one.
        const many = Object.fromEntries(
            Array.from({ length: 50 }, (_, i) => [`v${i}`, { value: 'number' }]),
        );
        const wide = typer.discriminatedUnion('kind', many);

        const time = (payload: unknown): number => {
            for (let i = 0; i < 2_000; i++) wide(payload);
            const start = process.hrtime.bigint();
            for (let i = 0; i < 20_000; i++) wide(payload);
            return Number(process.hrtime.bigint() - start) / 20_000;
        };

        const first = time({ kind: 'v0', value: 1 });
        const last = time({ kind: 'v49', value: 1 });

        // Loose bound so it holds on a loaded CI runner; a linear scan would
        // make the last variant ~50x the first.
        expect(last).toBeLessThan(first * 3);
    });

    it('nests in a schema slot', () => {
        const result = typer.safeParse({ body: shape }, { body: { kind: 'circle', radius: 2 } });
        expect(result.success).toBe(true);
    });

    it('nests in arrayOf', () => {
        const shapes = typer.arrayOf(shape);
        expect(shapes([{ kind: 'circle', radius: 1 }, { kind: 'square', side: 2 }])).toHaveLength(2);
    });

    it('is a Standard Schema', () => {
        expect(shape['~standard'].version).toBe(1);
        const result = shape['~standard'].validate({ kind: 'circle', radius: 'two' });
        expect((result as { issues: Array<{ path?: unknown }> }).issues[0].path).toEqual(['radius']);
    });

    it('strips dangerous keys from the selected variant', () => {
        const payload = JSON.parse('{"kind":"circle","radius":2,"__proto__":{"admin":true}}');
        shape(payload);

        expect(Object.keys(payload)).toEqual(['kind', 'radius']);
    });
});
