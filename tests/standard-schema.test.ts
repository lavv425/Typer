import { Typer, STANDARD_VENDOR } from '../src/Typer';
import type { StandardSchemaV1 } from '../src/Typer';
import { splitPath } from '../src/Utils/Path';

const typer = new Typer();

/**
 * Standard Schema consumers only ever go through `~standard.validate`, so the
 * suite exercises the contract exactly the way a framework would: read the
 * property, call validate, branch on `issues`.
 */
const validate = <T>(schema: StandardSchemaV1<unknown, T>, value: unknown) => {
    const result = schema['~standard'].validate(value);
    if (result instanceof Promise) throw new Error('Typer validation must be synchronous');
    return result;
};

describe('Standard Schema — contract', () => {
    const schema = typer.standard({ id: 'number', name: 'string' });

    it('exposes the ~standard property with version and vendor', () => {
        expect(schema['~standard'].version).toBe(1);
        expect(schema['~standard'].vendor).toBe(STANDARD_VENDOR);
        expect(typeof schema['~standard'].validate).toBe('function');
    });

    it('returns { value } and no issues on success', () => {
        const payload = { id: 1, name: 'ada' };
        const result = validate(schema, payload);

        expect(result.issues).toBeUndefined();
        expect((result as StandardSchemaV1.SuccessResult<unknown>).value).toBe(payload);
    });

    it('returns issues with message and segmented path on failure', () => {
        const result = validate(schema, { id: 'one', name: 'ada' });

        expect(result.issues).toHaveLength(1);
        const [issue] = result.issues!;
        expect(issue.path).toEqual(['id']);
        expect(typeof issue.message).toBe('string');
    });

    it('reports one issue per problem, in schema order', () => {
        const result = validate(schema, {});
        expect(result.issues!.map((i) => i.path)).toEqual([['id'], ['name']]);
    });

    it('keeps the machine-readable code alongside the spec fields', () => {
        const result = validate(schema, { id: 'one', name: 'ada' });
        expect((result.issues![0] as { code?: string }).code).toBe('invalid_type');
    });

    it('does not enumerate ~standard, so the validator still behaves like a function', () => {
        expect(Object.keys(schema)).not.toContain('~standard');
        expect(JSON.stringify({ schema })).toBe('{}');
    });

    it('is still callable as a plain validator', () => {
        const payload = { id: 1, name: 'ada' };
        expect(schema(payload)).toBe(payload);
        expect(() => schema({ id: 'one', name: 'ada' })).toThrow(TypeError);
    });
});

describe('Standard Schema — path segmentation', () => {
    it('splits nested object paths', () => {
        const schema = typer.standard({ address: { city: 'string' } });
        const result = validate(schema, { address: { city: 42 } });

        expect(result.issues![0].path).toEqual(['address', 'city']);
    });

    it('reports array indices as numbers', () => {
        const schema = typer.standard({ items: [{ qty: 'number' }] });
        const result = validate(schema, { items: [{ qty: 1 }, { qty: 'two' }] });

        expect(result.issues![0].path).toEqual(['items', 1, 'qty']);
    });

    it('uses an empty path for root-level failures', () => {
        const schema = typer.standard({ id: 'number' });
        const result = validate(schema, 'not an object');

        expect(result.issues![0].path).toEqual([]);
    });

    describe('splitPath', () => {
        it.each([
            ['', []],
            ['id', ['id']],
            ['address.city', ['address', 'city']],
            ['items[0].qty', ['items', 0, 'qty']],
            ['grid[2][3]', ['grid', 2, 3]],
            ['items[abc]', ['items', 'abc']],
            ['items[]', ['items', '']],
            ['items[0', ['items', '[0']],
        ])('splits %p into %p', (input, expected) => {
            expect(splitPath(input as string)).toEqual(expected);
        });
    });
});

describe('Standard Schema — supported inputs', () => {
    it('wraps a type alias', () => {
        const schema = typer.standard('string');

        expect(validate(schema, 'ok')).toEqual({ value: 'ok' });
        expect(validate(schema, 42).issues).toHaveLength(1);
    });

    it('wraps a union of aliases', () => {
        const schema = typer.standard(['string', 'number']);

        expect(validate(schema, 42)).toEqual({ value: 42 });
        expect(validate(schema, true).issues).toHaveLength(1);
    });

    it('wraps an existing validator', () => {
        const schema = typer.standard(typer.validators.isEmail);

        expect(validate(schema, 'a@b.co')).toEqual({ value: 'a@b.co' });
        expect(validate(schema, 'nope').issues).toHaveLength(1);
    });

    it('wraps a combinator', () => {
        const schema = typer.standard(typer.arrayOf(typer.validators.asNumber, { min: 1 }));

        expect(validate(schema, [1, 2])).toEqual({ value: [1, 2] });
        expect(validate(schema, []).issues).toHaveLength(1);
    });

    it('is strict by default, and opts out explicitly', () => {
        const strict = typer.standard({ id: 'number' });
        expect(validate(strict, { id: 1, extra: true }).issues).toHaveLength(1);

        const permissive = typer.standard({ id: 'number' }, { strict: false });
        expect(validate(permissive, { id: 1, extra: true }).issues).toBeUndefined();
    });

    it('gives objectOf the same treatment', () => {
        const schema = typer.objectOf({ id: 'number' });

        expect(schema['~standard'].vendor).toBe(STANDARD_VENDOR);
        expect(validate(schema, { id: 1 })).toEqual({ value: { id: 1 } });
    });
});
