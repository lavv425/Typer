/**
 * Timing helpers for the comparative performance tests.
 *
 * A test that asserts "A is not slower than B" is only meaningful if both were
 * measured under the same conditions. Jest runs suites in parallel workers, so
 * a single timed run of A can land on a busy scheduler slot and a single run of
 * B on a quiet one — which is how such a test fails without anything having
 * regressed.
 *
 * Two rules make it deterministic enough to assert on:
 *  - **interleave** the candidates, so a slow stretch of machine hits both;
 *  - **take the minimum** across rounds rather than the mean, because noise only
 *    ever adds time. The fastest round is the closest thing to the cost of the
 *    code itself.
 */

/** One named candidate to measure. */
export type Candidate = { readonly label: string; readonly run: () => void };

/** Nanoseconds per operation, per candidate label. */
export type Timings = Record<string, number>;

/**
 * Measures each candidate's best round, interleaving them.
 *
 * @param candidates - The alternatives to compare.
 * @param iterations - Operations per round.
 * @param rounds - Rounds to run; the fastest per candidate is kept.
 * @returns Nanoseconds per operation, keyed by label.
 */
export const compare = (candidates: readonly Candidate[], iterations = 2_000, rounds = 7): Timings => {
    const best: Timings = {};

    // Warm up every candidate first, so the first measured round is not the one
    // paying for JIT compilation.
    for (const { run } of candidates) {
        for (let i = 0; i < iterations; i++) run();
    }

    for (let round = 0; round < rounds; round++) {
        for (const { label, run } of candidates) {
            const start = process.hrtime.bigint();
            for (let i = 0; i < iterations; i++) run();
            const perOp = Number(process.hrtime.bigint() - start) / iterations;

            if (best[label] === undefined || perOp < best[label]) best[label] = perOp;
        }
    }

    return best;
};
