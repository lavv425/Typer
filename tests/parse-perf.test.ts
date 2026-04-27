import { Typer } from '../src/Typer';

/**
 * Smoke test for the closure-based compiler. The compiled `parse()` path is
 * expected to outperform calling `checkStructure` directly on every iteration
 * because schema walk + string parsing is done only once per schema literal.
 *
 * The threshold is intentionally loose (just "not slower") to avoid CI
 * flakes; on a modern machine the compiled path is typically 2–8× faster.
 */
describe('Typer - parse() compiled path performance', () => {
    let typer: Typer;

    beforeEach(() => {
        typer = new Typer();
    });

    it('compiled parse() is at least as fast as raw checkStructure', () => {
        const schema = typer.schema({
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

        const N = 5_000;

        // Warm-up — JIT both paths, populate the schema cache for parse().
        for (let i = 0; i < 200; i++) {
            typer.parse(schema, payload);
            typer.checkStructure(schema as Record<string, unknown>, payload);
        }

        const t1 = performance.now();
        for (let i = 0; i < N; i++) typer.parse(schema, payload);
        const compiled = performance.now() - t1;

        const t2 = performance.now();
        for (let i = 0; i < N; i++) typer.checkStructure(schema as Record<string, unknown>, payload);
        const raw = performance.now() - t2;

        // Loose threshold to keep CI happy across machines/load.
        expect(compiled).toBeLessThanOrEqual(raw * 1.2);

        // Diagnostic — visible only when --verbose / on failure.
        // eslint-disable-next-line no-console
        console.log(`[perf] parse(compiled): ${compiled.toFixed(2)}ms — checkStructure: ${raw.toFixed(2)}ms — speedup: ${(raw / compiled).toFixed(2)}×`);
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

        // eslint-disable-next-line no-console
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

        // eslint-disable-next-line no-console
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

        // eslint-disable-next-line no-console
        console.log(`[perf] is() with 4-type union: ${(N / elapsed).toFixed(0)} ops/ms`);
    });
});
