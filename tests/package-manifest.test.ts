import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards the published manifest.
 *
 * Packaging mistakes are invisible until after a publish — nothing in the test
 * suite, the build or the type tests exercises `exports`, `files` or
 * `sideEffects`, and npm will not let you republish a version to correct one.
 * 4.1.0 shipped an `exports` map that made `@illavv/run_typer/package.json`
 * unresolvable, which is exactly the class of mistake this catches.
 */
const manifest = JSON.parse(
    readFileSync(join(__dirname, '..', 'package.json'), 'utf8'),
) as {
    exports: Record<string, unknown>;
    files: string[];
    sideEffects: boolean;
    engines: { node?: string };
    main: string;
    module: string;
    browser: string;
    types: string;
};

describe('published package manifest', () => {
    describe('exports', () => {
        it('exposes the package root', () => {
            expect(manifest.exports['.']).toEqual({
                types: './dist/Typer.d.ts',
                browser: './dist/Typer.min.js',
                import: './dist/Typer.esm.mjs',
                require: './dist/Typer.cjs.min.js',
            });
        });

        it('exposes package.json as a subpath', () => {
            // Declaring `exports` at all makes every undeclared subpath
            // unresolvable, and tooling reads `<pkg>/package.json` routinely —
            // version checks, bundler plugins, some test runners.
            expect(manifest.exports['./package.json']).toBe('./package.json');
        });

        it('lists types first, so it is not shadowed by another condition', () => {
            // Conditional exports resolve in declaration order; `types` after
            // `import`/`require` is silently ignored by TypeScript.
            expect(Object.keys(manifest.exports['.'] as object)[0]).toBe('types');
        });
    });

    describe('bundler metadata', () => {
        it('declares itself free of side effects', () => {
            // Without this a bundler must assume side effects and cannot drop
            // unused code — which costs the library its main selling point.
            expect(manifest.sideEffects).toBe(false);
        });

        it('declares a supported Node floor', () => {
            expect(manifest.engines?.node).toMatch(/^>=\d+/);
        });
    });

    describe('files', () => {
        it('publishes dist and src', () => {
            // `src` is not optional: the source maps in `dist` point at
            // `../src/Typer.ts`, so leaving it out breaks go-to-definition and
            // step-debugging for every consumer.
            expect(manifest.files).toEqual(expect.arrayContaining(['dist', 'src']));
        });
    });

    describe('legacy entry points', () => {
        it('agrees with the exports map', () => {
            // Older bundlers and tools ignore `exports` and read these instead;
            // they must not drift apart.
            const root = manifest.exports['.'] as Record<string, string>;

            expect(manifest.main).toBe(root.require.replace('./', ''));
            expect(manifest.module).toBe(root.import.replace('./', ''));
            expect(manifest.browser).toBe(root.browser.replace('./', ''));
            expect(manifest.types).toBe(root.types.replace('./', ''));
        });
    });
});
