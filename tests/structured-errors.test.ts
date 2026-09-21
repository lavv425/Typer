import { Typer } from '../src/Typer';
import { TyperError } from '../src/Errors/TyperError';
import type { ValidationIssue } from '../src/Types/Typer';

describe('Typer - structured validation errors', () => {
    let typer: Typer;

    beforeEach(() => {
        typer = new Typer();
    });

    const codesOf = (issues: ValidationIssue[]): string[] => issues.map(i => i.code);
    const pathsOf = (issues: ValidationIssue[]): string[] => issues.map(i => i.path);

    describe('safeParse', () => {
        it('reports issues with code, path, expected and received', () => {
            const result = typer.safeParse({ id: 'number', name: 'string' }, { id: 'nope', name: 'Mike' });

            expect(result.success).toBe(false);
            if (result.success) throw new Error('expected failure');

            expect(result.issues).toHaveLength(1);
            expect(result.issues[0]).toMatchObject({
                code: 'invalid_type',
                path: 'id',
                expected: 'number',
                received: 'string',
                message: 'Expected "id" to be number, got string',
            });
        });

        it('reports every problem, not just the first', () => {
            const result = typer.safeParse(
                { id: 'number', name: 'string', tags: ['string'] },
                { id: 'nope', tags: [1, 'ok', 2] },
            );

            if (result.success) throw new Error('expected failure');
            expect(codesOf(result.issues)).toEqual(['invalid_type', 'missing_key', 'invalid_type', 'invalid_type']);
            expect(pathsOf(result.issues)).toEqual(['id', 'name', 'tags[0]', 'tags[2]']);
        });

        it('uses dotted paths for nested objects', () => {
            const result = typer.safeParse(
                { address: { city: 'string', zip: 'number' } },
                { address: { city: 1, zip: 2 } },
            );

            if (result.success) throw new Error('expected failure');
            expect(pathsOf(result.issues)).toEqual(['address.city']);
            expect(result.issues[0].received).toBe('number');
        });

        it('marks a missing key with the missing_key code', () => {
            const result = typer.safeParse({ id: 'number' }, {});

            if (result.success) throw new Error('expected failure');
            expect(result.issues[0]).toMatchObject({ code: 'missing_key', path: 'id', received: 'undefined' });
        });

        it('marks an unregistered type name with the unknown_type code', () => {
            const result = typer.safeParse({ id: 'nubmer' }, { id: 1 });

            if (result.success) throw new Error('expected failure');
            expect(result.issues[0]).toMatchObject({ code: 'unknown_type', path: 'id', expected: 'nubmer' });
        });

        it('carries the constraint code through a validator entry', () => {
            const result = typer.safeParse({ id: typer.validators.isPositiveInteger }, { id: -1 });

            if (result.success) throw new Error('expected failure');
            expect(result.issues[0].code).toBe('too_small');
            expect(result.issues[0].minimum).toBe(0);
            expect(result.issues[0].path).toBe('id');
            expect(result.issues[0].message).toContain('must be a positive integer');
        });

        it('falls back to the custom code for a validator that reports nothing', () => {
            const result = typer.safeParse({ id: () => { throw new Error('nope'); } }, { id: -1 });

            if (result.success) throw new Error('expected failure');
            expect(result.issues[0].code).toBe('custom');
            expect(result.issues[0].path).toBe('id');
            expect(result.issues[0].message).toContain('nope');
        });

        it('accepts a valid value for the same validator entry', () => {
            // Guards against the validator failing for the wrong reason (e.g. a
            // lost `this` binding), which would make the test above pass anyway.
            expect(typer.safeParse({ id: typer.validators.isPositiveInteger }, { id: 5 }).success).toBe(true);
        });

        it('reports a non-object input against the root path', () => {
            const result = typer.safeParse({ id: 'number' }, 'not an object');

            if (result.success) throw new Error('expected failure');
            expect(result.issues).toEqual([
                expect.objectContaining({ code: 'invalid_type', path: '', received: 'string' }),
            ]);
        });

        it('still produces issues for the non-schema (type alias) path', () => {
            const result = typer.safeParse('number', 'nope');

            if (result.success) throw new Error('expected failure');
            expect(result.issues).toHaveLength(1);
            expect(result.issues[0].code).toBe('invalid_type');
        });

        it('builds `error` lazily but returns the same instance each time', () => {
            const result = typer.safeParse({ id: 'number' }, { id: 'nope' });

            if (result.success) throw new Error('expected failure');
            const first = result.error;
            const second = result.error;

            expect(first).toBe(second);
            expect(first).toBeInstanceOf(TypeError);
            expect(first).toBeInstanceOf(TyperError);
            expect(first.message).toBe('Validation failed:\n  - Expected "id" to be number, got string');
        });
    });

    describe('parse', () => {
        it('throws a TyperError carrying the issues', () => {
            expect.assertions(4);
            try {
                typer.parse({ id: 'number', name: 'string' }, { id: 'nope' });
            } catch (e) {
                expect(e).toBeInstanceOf(TyperError);
                expect(e).toBeInstanceOf(TypeError);
                const err = e as TyperError;
                expect(codesOf(err.issues)).toEqual(['invalid_type', 'missing_key']);
                expect(pathsOf(err.issues)).toEqual(['id', 'name']);
            }
        });

        it('groups issues by path with flatten()', () => {
            try {
                typer.parse({ id: 'number', address: { city: 'string' } }, { id: 'x', address: { city: 1 } });
            } catch (e) {
                expect((e as TyperError).flatten()).toEqual({
                    id: ['Expected "id" to be number, got string'],
                    'address.city': ['Expected "address.city" to be string, got number'],
                });
            }
        });
    });

    describe('checkStructure', () => {
        it('returns issues alongside the legacy error strings', () => {
            const result = typer.checkStructure({ id: 'number' }, { id: 'nope' });

            expect(result.isValid).toBe(false);
            expect(result.errors).toEqual(['Expected "id" to be number, got string']);
            expect(result.issues).toEqual([
                expect.objectContaining({ code: 'invalid_type', path: 'id' }),
            ]);
        });

        it('keeps errors and issues in sync', () => {
            const result = typer.checkStructure({ a: 'number', b: 'string' }, { a: 'x', b: 1 });
            expect(result.errors).toEqual(result.issues.map(i => i.message));
        });

        it('reports an invalid schema as an issue', () => {
            const result = typer.checkStructure(null as unknown as Record<string, unknown>, {});
            expect(result.isValid).toBe(false);
            expect(result.issues[0].code).toBe('invalid_schema');
        });

        it('flags unexpected keys in strict mode', () => {
            const result = typer.checkStructure({ a: 'number' }, { a: 1, extra: true }, '', true);
            expect(result.isValid).toBe(false);
            expect(result.issues[0]).toMatchObject({ code: 'unexpected_key', path: 'extra' });
        });

        it('propagates strict mode into nested schemas', () => {
            const result = typer.checkStructure(
                { nested: { a: 'number' } },
                { nested: { a: 1, extra: true } },
                '',
                true,
            );
            expect(result.isValid).toBe(false);
            expect(result.issues[0]).toMatchObject({ code: 'unexpected_key', path: 'nested.extra' });
        });

        it('does not flag extra keys when strict mode is off', () => {
            const result = typer.checkStructure({ a: 'number' }, { a: 1, extra: true });
            expect(result.isValid).toBe(true);
        });

        it('honours the path prefix argument', () => {
            const result = typer.checkStructure({ a: 'number' }, { a: 'x' }, 'root');
            expect(result.issues[0].path).toBe('root.a');
        });
    });

    describe('messages fixed by sharing the compiler', () => {
        it('names the unregistered type instead of reporting a plain mismatch', () => {
            const result = typer.checkStructure({ a: 'unknowntype' }, { a: 'x' });
            expect(result.errors).toEqual(['Unknown type: unknowntype']);
        });

        it('honours the optional marker on array element types', () => {
            const result = typer.checkStructure({ a: ['string?'] }, { a: ['x', null, undefined] });
            expect(result.isValid).toBe(true);
        });

        it('reports a malformed element schema rather than the value', () => {
            const result = typer.checkStructure({ a: [123] }, { a: 'not an array' });
            expect(result.errors).toEqual(['Array element type must be a string at "a"']);
            expect(result.issues[0].code).toBe('invalid_schema');
        });
    });
});
