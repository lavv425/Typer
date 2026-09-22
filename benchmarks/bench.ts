/**
 * Reproducible micro-benchmark for the hot paths of Typer.
 *
 * Run with:  npm run bench
 *
 * Results are printed as ops/sec so they can be compared across commits.
 *
 * Caveat when reading them: the cases that measure a single-digit-nanosecond
 * operation — `is()` and `isType()` on a hot literal — are dominated by
 * whether V8 happens to inline the call, and have been observed to swing 4x
 * between consecutive runs of identical code. Treat a change there as noise
 * unless it reproduces across several runs. The schema cases do real work per
 * iteration and are stable to within a few percent.
 */
import { Typer } from '../src/Typer';
import { safeParse } from '../src/core';
import { compile } from '../src/jit';

type Case = {
    /** Human-readable name shown in the report. */
    name: string;
    /** The operation to measure. Must be side-effect free across iterations. */
    run: () => void;
    /** Iterations per timed batch. Tuned so each batch takes a few ms. */
    iterations?: number;
};

const DEFAULT_ITERATIONS = 200_000;
const WARMUP_BATCHES = 3;
const TIMED_BATCHES = 7;

/**
 * Runs one case: a few warm-up batches to let the JIT settle, then several
 * timed batches. The median batch is reported to blunt the effect of GC
 * pauses and scheduler noise.
 */
const measure = (testCase: Case): number => {
    const iterations = testCase.iterations ?? DEFAULT_ITERATIONS;
    const { run } = testCase;

    for (let batch = 0; batch < WARMUP_BATCHES; batch++) {
        for (let i = 0; i < iterations; i++) run();
    }

    const samples: number[] = [];
    for (let batch = 0; batch < TIMED_BATCHES; batch++) {
        const start = performance.now();
        for (let i = 0; i < iterations; i++) run();
        samples.push(performance.now() - start);
    }

    samples.sort((a, b) => a - b);
    const medianMs = samples[Math.floor(samples.length / 2)];
    return (iterations / medianMs) * 1000;
};

const formatOps = (opsPerSecond: number): string => {
    if (opsPerSecond >= 1_000_000) return `${(opsPerSecond / 1_000_000).toFixed(1)}M ops/sec`;
    if (opsPerSecond >= 1_000) return `${(opsPerSecond / 1_000).toFixed(1)}K ops/sec`;
    return `${opsPerSecond.toFixed(0)} ops/sec`;
};

const typer = new Typer();

// --- fixtures ---------------------------------------------------------------

const flatSchema = typer.schema({
    id: 'number',
    name: 'string',
    active: 'boolean',
});

const flatPayload = { id: 1, name: 'Mike', active: true };

const nestedSchema = typer.schema({
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

const nestedPayload = {
    id: 1,
    name: 'Mike',
    email: 'mike@example.com',
    role: 'admin',
    tags: ['a', 'b', 'c'],
    address: { street: '1 Way', city: 'Rome', zip: '00100' },
};

/** Same shape as `nestedPayload` but with two fields of the wrong type. */
const invalidNestedPayload = {
    id: 'not-a-number',
    name: 'Mike',
    email: 'mike@example.com',
    role: 'admin',
    tags: ['a', 'b', 'c'],
    address: { street: 1, city: 'Rome', zip: '00100' },
};

const arraySchema = typer.schema({ values: ['number'] });
const arrayPayload = { values: Array.from({ length: 50 }, (_, i) => i) };

const unionTypes = ['array', 'object', 'string', 'number'] as const;

// Compiled once, outside the timed region: moving the work here is the point.
const jitFlat = compile(flatSchema);
const jitNested = compile(nestedSchema);
const jitArray = compile(arraySchema);

const cases: Case[] = [
    { name: 'is(value, "string")', run: () => { typer.is('hello', 'string'); } },
    { name: 'is(value, "number")', run: () => { typer.is(42, 'number'); } },
    { name: 'is(value, 4-type union)', run: () => { typer.is('hello', unionTypes); } },
    { name: 'is(value, "string") — miss', run: () => { typer.is(42, 'string'); } },
    { name: 'isType("string", value)', run: () => { typer.isType('string', 'hello'); } },
    { name: 'isString(value) — type guard', run: () => { typer.isString('hello'); } },
    { name: 'isArrayOf("number", 50 items)', iterations: 20_000, run: () => { typer.isArrayOf('number', arrayPayload.values); } },
    { name: 'parse(flat schema) — valid', iterations: 100_000, run: () => { typer.parse(flatSchema, flatPayload); } },
    { name: 'parse(nested schema) — valid', iterations: 50_000, run: () => { typer.parse(nestedSchema, nestedPayload); } },
    { name: 'parse(array schema, 50 items)', iterations: 20_000, run: () => { typer.parse(arraySchema, arrayPayload); } },
    { name: 'safeParse(nested schema) — invalid', iterations: 50_000, run: () => { typer.safeParse(nestedSchema, invalidNestedPayload); } },
    {
        name: 'checkStructure(nested) — legacy',
        iterations: 20_000,
        run: () => { typer.checkStructure(nestedSchema, nestedPayload); },
    },

    // The two back ends on identical work, so the generated code can be read
    // against the closure compiler rather than against the class.
    { name: 'closure: safeParse(flat)', iterations: 100_000, run: () => { safeParse(flatSchema, flatPayload); } },
    { name: 'jit:     safeParse(flat)', iterations: 100_000, run: () => { jitFlat.safeParse(flatPayload); } },
    { name: 'closure: safeParse(nested)', iterations: 50_000, run: () => { safeParse(nestedSchema, nestedPayload); } },
    { name: 'jit:     safeParse(nested)', iterations: 50_000, run: () => { jitNested.safeParse(nestedPayload); } },
    { name: 'closure: safeParse(nested) — invalid', iterations: 50_000, run: () => { safeParse(nestedSchema, invalidNestedPayload); } },
    { name: 'jit:     safeParse(nested) — invalid', iterations: 50_000, run: () => { jitNested.safeParse(invalidNestedPayload); } },
    { name: 'closure: safeParse(array, 50)', iterations: 20_000, run: () => { safeParse(arraySchema, arrayPayload); } },
    { name: 'jit:     safeParse(array, 50)', iterations: 20_000, run: () => { jitArray.safeParse(arrayPayload); } },
];

// --- report -----------------------------------------------------------------

// Read off globalThis rather than pulling in @types/node for a single field.
const runtimeVersion = (globalThis as { process?: { version?: string } }).process?.version ?? 'unknown runtime';
console.log(`Typer benchmark — node ${runtimeVersion}\n`);

const nameWidth = Math.max(...cases.map(c => c.name.length));
for (const testCase of cases) {
    const ops = measure(testCase);
    console.log(`${testCase.name.padEnd(nameWidth)}  ${formatOps(ops).padStart(14)}`);
}
