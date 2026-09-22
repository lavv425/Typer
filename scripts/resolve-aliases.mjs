#!/usr/bin/env node
/**
 * Rewrites `@/…` specifiers in compiler output back to relative paths.
 *
 * TypeScript resolves `paths` when type-checking but emits the specifier
 * verbatim, so anything it writes out — published declarations, the benchmark
 * build — carries `@/Types/Typer`, which no runtime or consumer can resolve.
 * The bundles themselves are fine: rollup inlines everything.
 *
 *   node scripts/resolve-aliases.mjs <scanDir> <aliasRoot> <ext>
 *
 * `aliasRoot` is the directory `@/` points at in the output tree, which is not
 * always `scanDir`: `tsc` preserves the `src/` level when the build also
 * includes files outside it.
 */

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, posix } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const [scanArg, aliasArg, ext] = process.argv.slice(2);
if (!scanArg || !aliasArg || !ext) {
    console.error('usage: resolve-aliases.mjs <scanDir> <aliasRoot> <ext>');
    process.exit(1);
}

const scanDir = join(root, scanArg);
const aliasRoot = join(root, aliasArg);

const walk = (dir) => readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
});

const SPECIFIER = /(from\s+|import\s*\(\s*|require\s*\(\s*)(["'])@\/([^"']+)\2/g;

const targets = walk(scanDir).filter((f) => f.endsWith(ext));

let files = 0;
let rewrites = 0;

for (const file of targets) {
    const before = readFileSync(file, 'utf8');
    const after = before.replace(SPECIFIER, (_match, keyword, quote, target) => {
        let rel = posix.normalize(relative(dirname(file), join(aliasRoot, target)).split(/[\\/]/).join('/'));
        if (!rel.startsWith('.')) rel = `./${rel}`;
        rewrites += 1;
        return `${keyword}${quote}${rel}${quote}`;
    });

    if (after !== before) {
        writeFileSync(file, after);
        files += 1;
    }
}

console.log(`resolved ${rewrites} alias specifier(s) across ${files} ${ext} file(s) in ${scanArg}`);

const leftover = targets.filter((f) => /["']@\//.test(readFileSync(f, 'utf8')));

if (leftover.length > 0) {
    console.error('Unresolved aliases remain in:\n  ' + leftover.map((f) => relative(root, f)).join('\n  '));
    process.exit(1);
}
