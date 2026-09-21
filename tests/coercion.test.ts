import { Typer, TyperError } from '../src/Typer';

const typer = new Typer();

describe('coerce.number', () => {
    it.each<[unknown, number]>([
        ['42', 42],
        ['  42  ', 42],
        ['-7', -7],
        ['3.5', 3.5],
        ['1e3', 1000],
        ['0', 0],
        [42, 42],
        [0, 0],
        [-0, -0],
        [Infinity, Infinity],
        [true, 1],
        [false, 0],
        [10n, 10],
    ])('converts %p to %p', (input, expected) => {
        expect(typer.coerce.number(input)).toBe(expected);
    });

    it.each<[string, unknown]>([
        // The trap the roadmap names: Number('') is 0, so an absent query
        // parameter would read as a real zero.
        ['empty string', ''],
        ['whitespace only', '   '],
        ['non-numeric string', 'abc'],
        ['partially numeric string', '42px'],
        ['null', null],
        ['undefined', undefined],
        ['NaN', NaN],
        // Number([]) is 0 and Number([7]) is 7 — neither is a number the
        // caller wrote down.
        ['empty array', []],
        ['single-element array', [7]],
        ['object', {}],
        ['unsafe bigint', 2n ** 70n],
    ])('rejects %s', (_label, input) => {
        expect(() => typer.coerce.number(input)).toThrow(TypeError);
    });

    it('reports a coded issue', () => {
        try {
            typer.coerce.number('');
        } catch (e) {
            expect((e as TyperError).issues[0]).toMatchObject({ code: 'invalid_type', expected: 'number' });
            return;
        }
        throw new Error('expected a throw');
    });
});

describe('coerce.boolean', () => {
    it.each<[unknown, boolean]>([
        ['true', true],
        ['TRUE', true],
        ['  true  ', true],
        ['1', true],
        ['yes', true],
        ['on', true],
        // The second trap: Boolean('false') is true.
        ['false', false],
        ['FALSE', false],
        ['0', false],
        ['no', false],
        ['off', false],
        [true, true],
        [false, false],
        [1, true],
        [0, false],
    ])('converts %p to %p', (input, expected) => {
        expect(typer.coerce.boolean(input)).toBe(expected);
    });

    it.each<[string, unknown]>([
        ['empty string', ''],
        ['arbitrary string', 'maybe'],
        ['a number that is not 0 or 1', 2],
        ['null', null],
        ['undefined', undefined],
        ['object', {}],
        ['array', []],
    ])('rejects %s', (_label, input) => {
        expect(() => typer.coerce.boolean(input)).toThrow(TypeError);
    });
});

describe('coerce.date', () => {
    it('accepts an ISO string', () => {
        const date = typer.coerce.date('2026-09-21T00:00:00.000Z');
        expect(date).toBeInstanceOf(Date);
        expect(date.toISOString()).toBe('2026-09-21T00:00:00.000Z');
    });

    it('accepts epoch milliseconds', () => {
        expect(typer.coerce.date(0).toISOString()).toBe('1970-01-01T00:00:00.000Z');
    });

    it('passes a valid Date through unchanged', () => {
        const date = new Date();
        expect(typer.coerce.date(date)).toBe(date);
    });

    it.each<[string, unknown]>([
        ['empty string', ''],
        ['whitespace only', '  '],
        ['unparseable string', 'not a date'],
        ['an Invalid Date', new Date('nope')],
        ['NaN', NaN],
        ['Infinity', Infinity],
        ['null', null],
        ['undefined', undefined],
        ['object', {}],
    ])('rejects %s', (_label, input) => {
        expect(() => typer.coerce.date(input)).toThrow(TypeError);
    });
});

describe('coercion inside a schema', () => {
    it('replaces the string values with the converted ones', () => {
        // Exactly the shape a query string arrives in.
        const query: Record<string, unknown> = { page: '2', perPage: '50', archived: 'false', since: '2026-01-01' };

        const result = typer.parse({
            page: typer.coerce.number,
            perPage: typer.coerce.number,
            archived: typer.coerce.boolean,
            since: typer.coerce.date,
        }, query);

        expect(result.page).toBe(2);
        expect(result.perPage).toBe(50);
        expect(result.archived).toBe(false);
        expect(result.since).toBeInstanceOf(Date);
        // Same reference, converted in place.
        expect(result).toBe(query);
    });

    it('reports the failing key rather than silently producing zero', () => {
        const result = typer.safeParse({ page: typer.coerce.number }, { page: '' });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues[0]).toMatchObject({ code: 'invalid_type', path: 'page', expected: 'number' });
    });

    it('composes with the other combinators', () => {
        const payload: Record<string, unknown> = { ids: ['1', '2', '3'], limit: undefined };

        typer.parse({
            ids: [typer.coerce.number],
            limit: typer.withDefault(typer.coerce.number, 10),
        }, payload);

        expect(payload.ids).toEqual([1, 2, 3]);
        expect(payload.limit).toBe(10);
    });

    it('can be made optional', () => {
        const patch = typer.partial({ page: typer.coerce.number });

        expect(typer.safeParse(patch, {}).success).toBe(true);
        expect(typer.safeParse(patch, { page: '3' }).success).toBe(true);
    });

    it('is exposed through Standard Schema as well', () => {
        const schema = typer.standard({ page: typer.coerce.number });
        const payload = { page: '2' };

        const result = schema['~standard'].validate(payload);
        expect(result).toEqual({ value: { page: 2 } });
    });
});
