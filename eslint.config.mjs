import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Lint rules for Typer.
 *
 * `tsc --strict` already runs in CI, so this covers only what the compiler
 * does not prove: dead code, un-awaited promises, and the prototype-safety
 * patterns this library exists to guarantee. No stylistic plugins.
 */
export default tseslint.config(
    {
        ignores: ['dist/**', 'docs/**', 'coverage/**', '.bench/**', 'node_modules/**'],
    },

    js.configs.recommended,

    {
        // Type-aware rules only where there are types. The root tsconfig spans
        // the whole repository, so linting and the editor see the same program.
        files: ['**/*.ts'],
        extends: [...tseslint.configs.recommendedTypeChecked],
        languageOptions: {
            parserOptions: {
                project: './tsconfig.json',
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },

    {
        files: ['src/**/*.ts'],
        rules: {
            '@typescript-eslint/no-unused-vars': ['error', {
                args: 'after-used',
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                caughtErrorsIgnorePattern: '^_',
            }],

            // An un-awaited validation is a validation that did not happen.
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/await-thenable': 'error',
            '@typescript-eslint/no-misused-promises': 'error',

            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/no-unsafe-argument': 'error',

            eqeqeq: ['error', 'always', { null: 'ignore' }],
            'no-constant-binary-expression': 'error',
            'no-self-compare': 'error',
            'no-unmodified-loop-condition': 'error',

            'no-var': 'error',
            'prefer-const': 'error',
            '@typescript-eslint/no-shadow': 'error',

            // Prototype safety is a stated guarantee, so these are errors.
            'no-proto': 'error',
            'no-extend-native': 'error',
            'no-prototype-builtins': 'error',

            'no-console': 'error',
            'no-debugger': 'error',

            // Error messages interpolate the value that failed, which is
            // `unknown` by definition at that point.
            '@typescript-eslint/restrict-template-expressions': 'off',
            '@typescript-eslint/no-base-to-string': 'off',

            // `{}` is the empty type registry, and the 5.0 typing spike showed
            // that widening it silently disables the misspelled-alias check.
            '@typescript-eslint/no-empty-object-type': 'off',
        },
    },

    {
        // Tests reach past the public API and pass deliberately wrong types.
        files: ['tests/**/*.ts'],
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unsafe-argument': 'off',
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unsafe-call': 'off',
            '@typescript-eslint/no-unsafe-return': 'off',
            '@typescript-eslint/no-require-imports': 'off',
            '@typescript-eslint/unbound-method': 'off',
            '@typescript-eslint/restrict-template-expressions': 'off',
            'preserve-caught-error': 'off',
            'no-console': 'off',
            // Faking an async boundary rarely needs to await anything, and a
            // schema referenced only through `typeof` is the point of a
            // type-inference test.
            '@typescript-eslint/require-await': 'off',
            '@typescript-eslint/no-unnecessary-type-assertion': 'off',
            '@typescript-eslint/no-unused-vars': ['error', {
                varsIgnorePattern: '^_|^schema$',
                argsIgnorePattern: '^_',
                caughtErrorsIgnorePattern: '^_',
            }],
        },
    },

    {
        // Compiled, not run: every assertion is an unused type alias and every
        // negative case is a deliberate error.
        files: ['tests/types/**/*.ts'],
        rules: {
            '@typescript-eslint/no-unused-vars': 'off',
            '@typescript-eslint/no-empty-object-type': 'off',
        },
    },

    {
        files: ['scripts/**/*.mjs', '*.mjs', '*.js'],
        languageOptions: {
            globals: { console: 'readonly', process: 'readonly', require: 'readonly', module: 'writable', __dirname: 'readonly' },
        },
        rules: {
            'no-console': 'off',
        },
    },
);
