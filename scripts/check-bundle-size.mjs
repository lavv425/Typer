#!/usr/bin/env node
/**
 * Bundle-size budget check.
 *
 * A small bundle is one of the three things Typer actually wins on, so a
 * regression in it is a regression like any other: this exits non-zero when a
 * built artifact grows past its budget, and CI runs it on every push.
 *
 * Budgets are deliberately close to the current sizes — the point is to make a
 * jump visible in review, not to leave room to drift into.
 *
 * Usage: `npm run size` (after `npm run build`).
 */

import { gzipSync } from 'node:zlib';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** @type {Array<{ file: string, budgetGzip: number }>} */
const BUDGETS = [
    { file: 'dist/Typer.esm.mjs', budgetGzip: 9_216 },
    { file: 'dist/Typer.cjs.min.js', budgetGzip: 9_216 },
    { file: 'dist/Typer.min.js', budgetGzip: 9_472 },
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
