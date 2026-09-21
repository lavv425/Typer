import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';

/**
 * Two entry points, deliberately built separately rather than as a shared
 * chunk graph.
 *
 * `Typer.*` is the whole library behind the class. `core.*` is the
 * schema-validation path on its own — the compiler, the built-in predicates
 * and the entry points that use them. Building them as independent bundles is
 * what makes the difference between the two measurable: `npm run size` reports
 * both, so "importing only `parse` is smaller" is a number in CI rather than a
 * claim in the README.
 */

const compile = (declaration) => typescript({
    tsconfig: './tsconfig.json',
    // The project tsconfig targets Node16 modules, which makes tsc emit
    // CommonJS `require()` calls that Rollup cannot follow — it would
    // leave every internal module as an unresolved external. Rollup
    // needs ES modules as input and produces the CJS/UMD outputs itself.
    module: 'ESNext',
    moduleResolution: 'bundler',
    declaration,
    declarationDir: declaration ? 'dist' : undefined,
    declarationMap: declaration,
    rootDir: 'src',
});

export default [
    {
        input: 'src/Typer.ts',
        output: [
            {
                file: 'dist/Typer.min.js',
                format: 'umd',
                name: 'Typer',
                sourcemap: true,
                plugins: [terser()]
            },
            {
                // .mjs, not .js: the package is CommonJS by default, so Node would
                // otherwise have to sniff a .js file for module syntax and reparse it.
                file: 'dist/Typer.esm.mjs',
                format: 'es',
                sourcemap: true,
                plugins: [terser()]
            },
            {
                file: 'dist/Typer.cjs.min.js',
                format: 'cjs',
                sourcemap: true,
                plugins: [terser()]
            }
        ],
        plugins: [resolve(), commonjs(), compile(true)],
        external: []
    },
    {
        input: 'src/core.ts',
        output: [
            {
                file: 'dist/core.esm.mjs',
                format: 'es',
                sourcemap: true,
                plugins: [terser()]
            },
            {
                file: 'dist/core.cjs.min.js',
                format: 'cjs',
                sourcemap: true,
                plugins: [terser()]
            }
        ],
        // Declarations are emitted by the first build, which already covers
        // every module this one reaches.
        plugins: [resolve(), commonjs(), compile(false)],
        external: []
    }
];
