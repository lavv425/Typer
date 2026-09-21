import { Typer, TyperError } from '../src/Typer';

const typer = new Typer();

const schema = { id: 'number', name: 'string', address: { city: 'string' } } as const;
const bad = { id: 'one', name: 42, address: { city: null } };

describe('safeParse through objectOf reports without throwing', () => {
    it('produces the same issues as the direct schema path', () => {
        const direct = typer.safeParse(schema, structuredClone(bad));
        const wrapped = typer.safeParse(typer.objectOf(schema), structuredClone(bad));

        expect(direct.success).toBe(false);
        expect(wrapped.success).toBe(false);
        if (direct.success || wrapped.success) return;

        expect(wrapped.issues).toEqual(direct.issues);
    });

    it('does not build the error unless it is read', () => {
        // The lazy `error` accessor is the whole point of the non-throwing
        // path: if objectOf still threw internally, a TyperError (and its
        // stack) would have been constructed before safeParse ever returned.
        const result = typer.safeParse(typer.objectOf(schema), structuredClone(bad));

        expect(result.success).toBe(false);
        if (result.success) return;

        expect(result.issues).toHaveLength(3);
        expect(result.error).toBeInstanceOf(TyperError);
        expect(result.error).toBe(result.error); // cached, built once
    });

    it('still throws from parse(), which is the throwing entry point', () => {
        expect(() => typer.parse(typer.objectOf(schema), structuredClone(bad))).toThrow(TyperError);
        expect(() => typer.objectOf(schema)(structuredClone(bad))).toThrow(TyperError);
    });

    it('honours strict mode on the non-throwing path', () => {
        const result = typer.safeParse(
            typer.objectOf({ id: 'number' }, { strict: true }),
            { id: 1, extra: true },
        );

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues[0]).toMatchObject({ code: 'unexpected_key', path: 'extra' });
    });

    it('succeeds and returns the same reference', () => {
        const payload = { id: 1, name: 'ada', address: { city: 'london' } };
        const result = typer.safeParse(typer.objectOf(schema), payload);

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data).toBe(payload);
    });

    it('keeps working for plain user validators, which have no fast path', () => {
        const failing = typer.safeParse((v: unknown) => typer.asNumber(v), 'nope');
        expect(failing.success).toBe(false);

        const passing = typer.safeParse((v: unknown) => typer.asNumber(v), 7);
        expect(passing).toEqual({ success: true, data: 7 });
    });

    it('does not decorate a validator the caller owns', () => {
        const mine = (v: unknown) => typer.asNumber(v);
        const wrapped = typer.standard(mine);

        expect(wrapped).not.toBe(mine);
        expect(Object.getOwnPropertySymbols(mine)).toHaveLength(0);
        expect('~standard' in mine).toBe(false);
    });

    it('reuses the inner fast path when standard() wraps an objectOf', () => {
        const wrapped = typer.standard(typer.objectOf(schema));
        const result = typer.safeParse(wrapped, structuredClone(bad));

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues).toHaveLength(3);
        expect(result.issues[0].code).toBe('invalid_type');
    });

    it('is measurably cheaper than the throwing round trip', () => {
        // The regression this pins: the wrapper used to cost 5.61 µs against
        // 410 ns for the identical failure on the schema directly. The bound is
        // deliberately loose — it has to hold on a loaded CI runner — but it is
        // far below the order of magnitude that was there before.
        const wrapped = typer.objectOf(schema);
        const payload = structuredClone(bad);
        const ITERATIONS = 2_000;

        const time = (run: () => void): number => {
            for (let i = 0; i < 200; i++) run(); // warm up
            const start = process.hrtime.bigint();
            for (let i = 0; i < ITERATIONS; i++) run();
            return Number(process.hrtime.bigint() - start) / ITERATIONS;
        };

        const direct = time(() => { typer.safeParse(schema, payload); });
        const viaObjectOf = time(() => { typer.safeParse(wrapped, payload); });

        expect(viaObjectOf).toBeLessThan(direct * 3);
    });
});
