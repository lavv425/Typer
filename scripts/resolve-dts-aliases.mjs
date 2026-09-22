#!/usr/bin/env node
/**
 * Rewrites `@/…` import specifiers in the emitted declarations back to
 * relative paths.
 *
 * TypeScript resolves `paths` when type-checking but emits the specifier
 * verbatim, so a published `.d.ts` would carry `@/Types/Typer` — which a
 * consumer's compiler has no way to resolve. The bundles themselves are fine:
 * rollup inlines everything.
 *
 * Runs as part of `npm run build`.
 */

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, posix } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

const walk = (dir) => readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
});

const SPECIFIER = /(from\s+|import\s*\(\s*)(["'])@\/([^"']+)\2/g;

let files = 0;
let rewrites = 0;

for (const file of walk(dist)) {
    if (!file.endsWith('.d.ts')) continue;

    const before = readFileSync(file, 'utf8');
    const after = before.replace(SPECIFIER, (match, keyword, quote, target) => {
        let rel = posix.normalize(relative(dirname(file), join(dist, target)).split(/[\\/]/).join('/'));
        if (!rel.startsWith('.')) rel = `./${rel}`;
        rewrites += 1;
        return `${keyword}${quote}${rel}${quote}`;
    });

    if (after !== before) {
        writeFileSync(file, after);
        files += 1;
    }
}

console.log(`resolved ${rewrites} alias specifier(s) across ${files} declaration file(s)`);

const leftover = walk(dist)
    .filter((f) => f.endsWith('.d.ts'))
    .filter((f) => /["']@\//.test(readFileSync(f, 'utf8')));

if (leftover.length > 0) {
    console.error('Unresolved aliases remain in:\n  ' + leftover.map((f) => relative(root, f)).join('\n  '));
    process.exit(1);
}
