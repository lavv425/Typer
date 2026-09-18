import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';

export default {
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
    plugins: [
        resolve(),
        commonjs(),
        typescript({
            tsconfig: './tsconfig.json',
            // The project tsconfig targets Node16 modules, which makes tsc emit
            // CommonJS `require()` calls that Rollup cannot follow — it would
            // leave every internal module as an unresolved external. Rollup
            // needs ES modules as input and produces the CJS/UMD outputs itself.
            module: 'ESNext',
            moduleResolution: 'bundler',
            declaration: true,
            declarationDir: 'dist',
            rootDir: 'src'
        })
    ],
    external: []
};