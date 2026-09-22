import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Runs against `dist/`, not `src/`.
 *
 * Every other suite imports source, where the four entry points share one
 * module instance — so a bug that only exists *between* the published bundles
 * is invisible to them. One did: each bundle minted its own
 * `Symbol('typer.jsonSchema')`, so a fragment attached by `/validators` could
 * not be read by `/core`, and `import { isEmail } from '…/validators'` emitted
 * `{}` in any real consumer. The source tests all passed.
 */
const dist = (file: string) => join(__dirname, '..', 'dist', file);
const built = ['core.cjs.min.js', 'validators.cjs.min.js', 'combinators.cjs.min.js', 'async.cjs.min.js', 'Typer.cjs.min.js']
    .every((f) => existsSync(dist(f)));

 
const load = (file: string) => require(dist(file)) as Record<string, never>;

(built ? describe : describe.skip)('the published bundles agree with each other', () => {
    it('a validator described in one bundle is readable from another', () => {
        const { isEmail, isPort } = load('validators.cjs.min.js') as unknown as Record<string, unknown>;
        const { Typer } = load('Typer.cjs.min.js') as unknown as { Typer: new () => { toJSONSchema: (s: unknown) => { properties: Record<string, unknown> } } };
        const typer = new Typer();

        expect(typer.toJSONSchema({ e: isEmail }).properties.e).toEqual({ type: 'string', format: 'email' });
        expect(typer.toJSONSchema({ p: isPort }).properties.p).toEqual({ type: 'integer', minimum: 1, maximum: 65535 });
    });

    it('safeParse reaches a combinator’s non-throwing path across bundles', () => {
        const { objectOf } = load('combinators.cjs.min.js') as unknown as { objectOf: (s: unknown) => unknown };
        const { safeParse } = load('core.cjs.min.js') as unknown as {
            safeParse: (v: unknown, x: unknown) => { success: boolean; issues?: Array<{ path: string }> };
        };

        const result = safeParse(objectOf({ id: 'number' }), { id: 'x' });
        expect(result.success).toBe(false);
        expect(result.issues?.[0].path).toBe('id');
    });

    it('an async marker set in one bundle is honoured by another', async () => {
        const { asyncRefine, parseAsync } = load('async.cjs.min.js') as unknown as {
            asyncRefine: (v: unknown, p: unknown, m: string) => unknown;
            parseAsync: (s: unknown, v: unknown) => Promise<unknown>;
        };
        const { parse } = load('core.cjs.min.js') as unknown as { parse: (s: unknown, v: unknown) => unknown };

        const slot = asyncRefine((v: unknown) => String(v), async () => true, 'n/a');

        await expect(parseAsync({ a: slot }, { a: 'x' })).resolves.toEqual({ a: 'x' });
        // And the synchronous path still refuses it, across bundles.
        expect(() => parse({ a: slot }, { a: 'x' })).toThrow('requires parseAsync');
    });

    it('uses the global symbol registry, which is what makes that work', () => {
        const { objectOf } = load('combinators.cjs.min.js') as unknown as { objectOf: (s: unknown) => object };
        const marked = objectOf({ id: 'number' });

        for (const key of ['typer.jsonSchema', 'typer.safeResult']) {
            expect(Object.getOwnPropertySymbols(marked)).toContain(Symbol.for(key));
        }
    });
});
