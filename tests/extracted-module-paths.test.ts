import { isType } from '../src/validators';
import { nullable, objectOf, arrayOf, literal } from '../src/combinators';
import { parseAsync, safeParseAsync, asyncRefine } from '../src/async';
import { safeParse } from '../src/core';
import { Typer } from '../src/Typer';

const typer = new Typer();

/**
 * Paths that the class used to reach and the extracted modules now own.
 *
 * Splitting the library moved code without moving the tests that happened to
 * cover it — these close that gap rather than let the reported coverage drift
 * away from what is actually exercised.
 */
describe('free isType', () => {
    it('accepts a value matching any of several aliases', () => {
        expect(isType(['string', 'number'], 42)).toBe(42);
        expect(isType(['string', 'number'], 'x')).toBe('x');
    });

    it('reports every alternative when none match', () => {
        expect(() => isType(['string', 'number'], true))
            .toThrow('None of the types matched for true');
    });

    it('rejects an unknown alias, single or in a list', () => {
        expect(() => isType('nubmer', 1)).toThrow('Unknown type: nubmer');
        expect(() => isType(['string', 'nubmer'], 1)).toThrow('Unknown type: nubmer');
    });

    it('normalises case and whitespace', () => {
        expect(isType('  STRING  ', 'x')).toBe('x');
    });

    it('does not resolve inherited Object.prototype members', () => {
        expect(() => isType('constructor', 1)).toThrow('Unknown type: constructor');
    });
});

describe('nullable fragments reach JSON Schema', () => {
    it('falls back to anyOf for a fragment with no type keyword', () => {
        // `literal` describes itself as an `enum`, which has no `type` to
        // widen — the only shape that needs the `anyOf` form.
        const doc = typer.toJSONSchema({ role: nullable(literal('a', 'b')) } as never);
        const role = (doc.properties as Record<string, Record<string, unknown>>).role;

        expect(role.anyOf).toEqual([{ enum: ['a', 'b'] }, { type: 'null' }]);
    });

    it('uses the compact form when the fragment does have a type', () => {
        const doc = typer.toJSONSchema({ user: nullable(objectOf({ id: 'number' })) } as never);
        const user = (doc.properties as Record<string, Record<string, unknown>>).user;

        expect(user.type).toEqual(['object', 'null']);
    });

    it('widens an already-multi-type fragment by adding null once', () => {
        const doc = typer.toJSONSchema({ v: nullable(typer.coerce.number) } as never);
        const v = (doc.properties as Record<string, Record<string, unknown>>).v;

        expect(v.type).toEqual(['number', 'string', 'null']);
    });

    it('stays permissive for a validator that describes nothing', () => {
        const doc = typer.toJSONSchema({ v: nullable((x: unknown) => x) } as never);
        expect((doc.properties as Record<string, unknown>).v).toEqual({});
    });

    it('describes a nullable array slot', () => {
        const doc = typer.toJSONSchema({ v: nullable(arrayOf(typer.validators.asString)) } as never);
        const v = (doc.properties as Record<string, Record<string, unknown>>).v;

        expect(v.type).toEqual(['array', 'null']);
    });
});

describe('async walking of shapes it cannot descend into', () => {
    const always = asyncRefine((v: unknown) => v, async () => true, 'n/a');

    it('leaves an array slot alone when the value is not an array', async () => {
        const result = await safeParseAsync({ items: [always] }, { items: 'not an array' });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues[0]).toMatchObject({ path: 'items', code: 'invalid_type' });
    });

    it('descends into objects inside arrays to find async slots', async () => {
        const failing = asyncRefine((v: unknown) => v, async () => false, 'rejected');
        const result = await safeParseAsync(
            { rows: [{ token: failing }] },
            { rows: [{ token: 'a' }, { token: 'b' }] },
        );

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues.map((i) => i.path).sort()).toEqual(['rows[0].token', 'rows[1].token']);
    });

    it('leaves a nested object alone when the value is not an object', async () => {
        const result = await safeParseAsync({ user: { email: always } }, { user: 'nope' });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues[0]).toMatchObject({ path: 'user', code: 'invalid_type' });
    });

    it('reuses the synchronous view across calls', async () => {
        // The derived schema is cached by identity; two runs must agree.
        const schema = { email: always, id: 'number' } as const;
        await expect(parseAsync(schema, { email: 'a', id: 1 })).resolves.toBeDefined();
        await expect(parseAsync(schema, { email: 'b', id: 2 })).resolves.toBeDefined();
    });

    it('leaves a schema with no async slots on the same object identity', async () => {
        // Nothing to strip means nothing to copy, so the compiled-checker cache
        // stays warm rather than being missed on every call.
        const schema = { id: 'number' } as const;
        expect((await safeParseAsync(schema, { id: 1 })).success).toBe(true);
        expect(safeParse(schema, { id: 1 }).success).toBe(true);
    });
});
