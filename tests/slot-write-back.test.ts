import { Typer } from '../src/Typer';

const typer = new Typer();

describe('a transforming validator slot takes effect', () => {
    it('applies transform() inside a schema', () => {
        const payload: Record<string, unknown> = { slug: '  Hello World  ' };
        typer.parse({ slug: typer.transform((v) => typer.asString(v), (s) => s.trim().toLowerCase()) }, payload);

        expect(payload.slug).toBe('hello world');
    });

    it('applies withDefault() inside a schema', () => {
        const payload: Record<string, unknown> = {};
        typer.parse({ coupon: typer.withDefault((v) => typer.asString(v), 'NONE') }, payload);

        expect(payload.coupon).toBe('NONE');
    });

    it('applies a validator that parses into another type', () => {
        const payload: Record<string, unknown> = { when: '2026-09-21T00:00:00.000Z' };
        typer.parse({ when: typer.validators.isISODate }, payload);

        // Infer already types this slot as Date; now the runtime agrees.
        expect(payload.when).toBeInstanceOf(Date);
    });

    it('applies to array elements', () => {
        const payload: Record<string, unknown> = { tags: ['  A  ', '  B  '] };
        typer.parse({ tags: [typer.transform((v) => typer.asString(v), (s) => s.trim())] }, payload);

        expect(payload.tags).toEqual(['A', 'B']);
    });

    it('applies inside a nested schema', () => {
        const payload = { meta: { slug: ' X ' } };
        typer.parse({ meta: { slug: typer.transform((v) => typer.asString(v), (s) => s.trim()) } }, payload);

        expect(payload.meta.slug).toBe('X');
    });

    it('writes nothing back when validation fails', () => {
        const payload: Record<string, unknown> = { slug: 42 };
        const result = typer.safeParse({ slug: typer.transform((v) => typer.asString(v), (s) => s.trim()) }, payload);

        expect(result.success).toBe(false);
        expect(payload.slug).toBe(42);
    });
});

describe('a non-transforming validator slot leaves the object alone', () => {
    it('does not touch a field validated by an is*/as* validator', () => {
        const payload = { email: 'a@b.co', id: 7 };
        const before = { ...payload };

        typer.parse({ email: typer.validators.isEmail, id: typer.validators.isPositiveInteger }, payload);

        expect(payload).toEqual(before);
        expect(payload.email).toBe(before.email);
    });

    it('keeps the identity of an objectOf-validated nested object', () => {
        const address = { city: 'london' };
        const payload = { address };

        typer.parse({ address: typer.objectOf({ city: 'string' }) }, payload);

        expect(payload.address).toBe(address);
    });

    it('keeps the identity of the root value', () => {
        const payload = { id: 1 };
        expect(typer.parse({ id: 'number' }, payload)).toBe(payload);
    });

    it('does not add keys that were absent', () => {
        const payload: Record<string, unknown> = { id: 1 };
        typer.parse({ id: 'number', note: 'string?' }, payload);

        expect(Object.keys(payload)).toEqual(['id']);
    });

    it('leaves an optional() slot absent rather than writing undefined', () => {
        const payload: Record<string, unknown> = {};
        typer.parse({ note: typer.optional((v) => typer.asString(v)) }, payload);

        expect(Object.prototype.hasOwnProperty.call(payload, 'note')).toBe(false);
    });
});
