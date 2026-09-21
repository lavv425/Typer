#!/usr/bin/env node
/**
 * Raised from 9 KB in 4.1: that release added Standard Schema, schema
 * composition, coercion, discriminated unions and JSON Schema output, taking
 * the bundle from 6.7 KB to 9.7 KB gzip.
 *
 * The class gained a further ~170 B in 5.0, from the 43 methods that now
 * delegate to `Validators/*`. That is overhead a consumer of the class pays
 * for a split they do not use, and it is the honest price of keeping the
 * instance API working unchanged while the implementations move out.
 *
 * @type {Array<{ file: string, budgetGzip: number }>}
 */

import { gzipSync } from 'node:zlib';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Raised from 9 KB in 4.1: the release added Standard Schema, schema
 * composition, coercion, discriminated unions and JSON Schema output, taking
 * the bundle from 6.7 KB to 9.7 KB gzip. The instance-based API means none of
 * it can be tree-shaken away by a consumer who does not use it — which is the
 * argument for the 5.0 modularization, not a reason to loosen this further.
 *
 * @type {Array<{ file: string, budgetGzip: number }>}
 */
const BUDGETS = [
    { file: 'dist/Typer.esm.mjs', budgetGzip: 10_496 },
    { file: 'dist/Typer.cjs.min.js', budgetGzip: 10_496 },
    { file: 'dist/Typer.min.js', budgetGzip: 10_752 },

    // The `core` entry is the whole argument for the 5.0 split: schema
    // validation without the class, at 2.86 KB against the class's 9.67 KB.
    // Its budget is deliberately tight — this is the number the split exists
    // to protect, and it has to stay under `zod/mini` (4.8 KB) to be worth
    // making. A change that pushes it up is a change worth arguing for.
    { file: 'dist/core.esm.mjs', budgetGzip: 3_072 },
    { file: 'dist/core.cjs.min.js', budgetGzip: 3_072 },

    // Every validator, for a consumer who wants the lot without the class.
    // One validator on top of `core` costs ~11 B; four cost ~65 B each.
    { file: 'dist/validators.esm.mjs', budgetGzip: 4_096 },
    { file: 'dist/validators.cjs.min.js', budgetGzip: 4_096 },
];

const kb = (bytes) => `${(bytes / 1024).toFixed(2)} KB`;

let failed = false;

for (const { file, budgetGzip } of BUDGETS) {
    const path = join(root, file);

    let raw;
    try {
        raw = readFileSync(path);
    } catch {
        console.error(`✗ ${file} — not found. Run \`npm run build\` first.`);
        failed = true;
        continue;
    }

    const gzip = gzipSync(raw, { level: 9 }).byteLength;
    const headroom = budgetGzip - gzip;
    const status = headroom >= 0 ? '✓' : '✗';

    console.log(
        `${status} ${relative(root, path)} — ${kb(gzip)} gzip `
        + `(raw ${kb(statSync(path).size)}), budget ${kb(budgetGzip)}, `
        + `${headroom >= 0 ? `${kb(headroom)} to spare` : `${kb(-headroom)} over`}`,
    );

    if (headroom < 0) failed = true;
}

if (failed) {
    console.error('\nBundle size budget exceeded. Either trim the addition or raise the budget deliberately, in the same commit.');
    process.exit(1);
}
