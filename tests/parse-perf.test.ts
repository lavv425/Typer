import { Typer } from '../src/Typer';
import { compare } from './helpers/measure';

/** The shape used by the compiler tests below. */
const definition = () => ({
    id: 'number',
    name: 'string',
    email: 'string?',
    role: 'string|number',
    tags: ['string'],
    address: {
        street: 'string',
        city: 'string',
        zip: 'string?',
    },
});

const payload = {
    id: 1,
    name: 'Mike',
    email: 'mike@example.com',
    role: 'admin',
    tags: ['a', 'b', 'c'],
    address: { street: '1 Way', city: 'Rome', zip: '00100' },
};

/**
 * Smoke tests for the closure-based compiler.
 *
 * There used to be a test here asserting that `parse()` was not slower than
 * `checkStructure()`. It was meaningful in 3.x, when `checkStructure` was a
 * separate recursive walker — but 4.0 made it share the schema compiler, so
 * since then the two have been the *same code* reached through two entry
 * points. Measured outside jest they agree to within 1% (109 ns against
 * 107 ns), which meant the assertion was really asking two identical things to
 * differ by less than 20% through an instrumented runtime. It failed and
 * passed at random, and no regression could make it fail for a reason worth
 * knowing about.
 *
 * What replaced it: the invariant that actually holds (they agree, because
 * they share the compiler), and the ratio that is actually large (a cached
 * schema against one recompiled on every call — measured 3.4–4.6× under jest,
 * asserted at 2×).
 */
describe('Typer - parse() compiled path performance', () => {
    let typer: Typer;

    beforeEach(() => {
        typer = new Typer();
    });

    it('parse() and checkStructure() agree, because they share the compiled checker', () => {
        const schema = typer.schema(definition());
        const bad = {
            id: 'one',
            role: true,
            tags: ['a', 2],
            address: { street: 1 },
        };

        const viaSafeParse = typer.safeParse(schema, bad);
        const viaCheckStructure = typer.checkStructure(schema, bad);

        expect(viaSafeParse.success).toBe(false);
        if (viaSafeParse.success) return;

        expect(viaCheckStructure.isValid).toBe(false);
        expect(viaCheckStructure.issues).toEqual(viaSafeParse.issues);
    });

    it('agrees on a valid payload too', () => {
        const schema = typer.schema(definition());

        expect(typer.safeParse(schema, payload).success).toBe(true);
        expect(typer.checkStructure(schema, payload).isValid).toBe(true);
    });

    it('a hoisted schema is much faster than one rebuilt on every call', () => {
        // The cache is keyed on schema object identity, so a literal written
        // inside a handler recompiles every time. This is the gap that makes
        // hoisting worth documenting — and unlike the comparison it replaced,
        // the two sides really are different work, so the ratio is large and
        // the threshold has room to spare.
        const hoisted = typer.schema(definition());

        const { cached, recompiled } = compare([
            { label: 'cached', run: () => { typer.parse(hoisted, payload); } },
            { label: 'recompiled', run: () => { typer.parse(definition() as never, payload); } },
        ]);

        expect(recompiled).toBeGreaterThan(cached * 2);

         
        console.log(`[perf] cached schema: ${cached.toFixed(0)}ns — recompiled every call: ${recompiled.toFixed(0)}ns — ${(recompiled / cached).toFixed(1)}×`);
    });

    it('reusing the same schema literal hits the compile cache', () => {
        const schema = typer.schema({ id: 'number', name: 'string' });

        // First call compiles + caches; subsequent calls should be much faster.
        typer.parse(schema, { id: 1, name: 'first' });

        const N = 10_000;
        const t = performance.now();
        for (let i = 0; i < N; i++) typer.parse(schema, { id: i, name: 'x' });
        const elapsed = performance.now() - t;

        // 10k validations of a tiny schema should comfortably fit in 100ms on any
        // reasonable machine — proves the cache is doing its job.
        expect(elapsed).toBeLessThan(500);

         
        console.log(`[perf] ${N}× cached parse(): ${elapsed.toFixed(2)}ms (${(N / elapsed).toFixed(0)} ops/ms)`);
    });

    it('is()/isType() cached predicate path is fast on hot literals', () => {
        const N = 100_000;

        // Warm up the predicate cache for the most-common type literals.
        typer.is('hi', 'string');
        typer.is(1, 'number');
        typer.is(true, 'boolean');
        typer.isType('string', 'hi');
        typer.isType('number', 1);
        typer.isType('boolean', true);

        // is() over typeof-able primitives: should run at JIT speed (≥10M ops/sec
        // on modern machines). 100k iterations comfortably under 50ms.
        const t1 = performance.now();
        for (let i = 0; i < N; i++) {
            typer.is('hi', 'string');
            typer.is(i, 'number');
            typer.is(false, 'boolean');
        }
        const isElapsed = performance.now() - t1;
        expect(isElapsed).toBeLessThan(500);

        const t2 = performance.now();
        for (let i = 0; i < N; i++) {
            typer.isType('string', 'hi');
            typer.isType('number', i);
            typer.isType('boolean', false);
        }
        const isTypeElapsed = performance.now() - t2;
        expect(isTypeElapsed).toBeLessThan(500);

         
        console.log(`[perf] is(): ${(N * 3 / isElapsed).toFixed(0)} ops/ms — isType(): ${(N * 3 / isTypeElapsed).toFixed(0)} ops/ms`);
    });

    it('is() with array of types short-circuits on first match', () => {
        const N = 100_000;
        const types = ['array', 'object', 'string', 'number'] as const;
        // Warm up
        typer.is('hello', types);

        const t = performance.now();
        for (let i = 0; i < N; i++) {
            // The third candidate ('string') matches — predicates 1+2 must be cheap.
            typer.is('hello', types);
        }
        const elapsed = performance.now() - t;
        expect(elapsed).toBeLessThan(500);

         
        console.log(`[perf] is() with 4-type union: ${(N / elapsed).toFixed(0)} ops/ms`);
    });
});
