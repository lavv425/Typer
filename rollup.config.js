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
            file: 'dist/Typer.esm.min.js',
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
            declaration: true,
            declarationDir: 'dist'
        })
    ],
    external: []
};