import { Typer } from '../src/Typer';
import type { Infer } from '../src/Types/Typer';

/**
 * Helper for compile-time type assertions. The body is never evaluated at
 * runtime; failures show up as TypeScript errors during type-checking.
 */
type AssertEqual<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
function expectType<_T extends true>(): void { /* compile-time only */ }

describe('Typer - parse / safeParse with schema inference', () => {
    let typer: Typer;

    beforeEach(() => {
        typer = new Typer();
    });

    describe('parse with type alias', () => {
        it('returns the typed value', () => {
            const result = typer.parse('number', 42);
            expect(result).toBe(42);
        });

        it('throws TypeError on mismatch', () => {
            expect(() => typer.parse('number', 'oops')).toThrow(TypeError);
        });

        it('supports an array of aliases (union)', () => {
            expect(typer.parse(['string', 'number'], 7)).toBe(7);
            expect(typer.parse(['string', 'number'], 'hi')).toBe('hi');
            expect(() => typer.parse(['string', 'number'], true)).toThrow(TypeError);
        });
    });

    describe('parse with validator function', () => {
        it('runs the validator and returns its result', () => {
            const result = typer.parse(typer.nullable(v => typer.asString(v)), null);
            expect(result).toBeNull();

            const result2 = typer.parse(typer.optional(v => typer.asNumber(v)), 7);
            expect(result2).toBe(7);
        });
    });

    describe('parse with schema (the main DX win)', () => {
        it('returns a typed object on success', () => {
            const userSchema = {
                id: 'number',
                name: 'string',
                email: 'string?',
            };

            const user = typer.parse(userSchema, {
                id: 1,
                name: 'Mike',
                email: 'mike@example.com',
            });

            expect(user.id).toBe(1);
            expect(user.name).toBe('Mike');
            expect(user.email).toBe('mike@example.com');
        });

        it('supports nested schemas', () => {
            const schema = typer.schema({
                user: { name: 'string', age: 'number' },
                tags: ['string'],
            });

            const result = typer.parse(schema, {
                user: { name: 'Mike', age: 30 },
                tags: ['admin', 'dev'],
            });

            expect(result.user.name).toBe('Mike');
            expect(result.user.age).toBe(30);
            expect(result.tags).toEqual(['admin', 'dev']);
        });

        it('inline-literal schemas infer fully without as const', () => {
            const result = typer.parse(
                { id: 'number', name: 'string', tags: ['string'] },
                { id: 1, name: 'Mike', tags: ['a', 'b'] },
            );
            expect(result.id).toBe(1);
            expect(result.tags[0]).toBe('a');
        });

        it('throws with all collected errors on failure', () => {
            const schema = { id: 'number', name: 'string' };
            try {
                typer.parse(schema, { id: 'oops', name: 42 });
                fail('should have thrown');
            } catch (e) {
                expect(e).toBeInstanceOf(TypeError);
                const msg = (e as Error).message;
                expect(msg).toContain('id');
                expect(msg).toContain('name');
            }
        });

        it('accepts validator entries inside a schema', () => {
            const schema = typer.schema({
                id: typer.isPositiveInteger.bind(typer),
                name: typer.isNonEmptyString.bind(typer),
                color: (v: unknown) => typer.isHexColor(v),
            });

            const result = typer.parse(schema, {
                id: 7,
                name: 'Mike',
                color: '#abc',
            });

            expect(result.id).toBe(7);
            expect(() =>
                typer.parse(schema, { id: -1, name: '', color: 'nope' }),
            ).toThrow(TypeError);
        });

        it('omits optional fields when missing', () => {
            const schema = { id: 'number', email: 'string?' };
            const result = typer.parse(schema, { id: 1 });
            expect(result.id).toBe(1);
            expect(result.email).toBeUndefined();
        });

        it('accepts null for optional fields', () => {
            const schema = { id: 'number', email: 'string?' };
            const result = typer.parse(schema, { id: 1, email: null });
            expect(result.email).toBeNull();
        });
    });

    describe('safeParse with schema', () => {
        it('returns success with typed data', () => {
            const schema = { id: 'number', name: 'string' };
            const result = typer.safeParse(schema, { id: 1, name: 'Mike' });
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.id).toBe(1);
                expect(result.data.name).toBe('Mike');
            }
        });

        it('returns failure with TypeError', () => {
            const schema = { id: 'number' };
            const result = typer.safeParse(schema, { id: 'oops' });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toBeInstanceOf(TypeError);
            }
        });
    });

    describe('schema cache (perf)', () => {
        it('reuses the compiled checker for repeated calls with the same schema', () => {
            const schema = typer.schema({ id: 'number' });
            // First call populates the cache
            typer.parse(schema, { id: 1 });
            // Subsequent calls hit the cache; just verify behavior is consistent
            for (let i = 0; i < 1000; i++) {
                expect(typer.parse(schema, { id: i }).id).toBe(i);
            }
        });
    });

    describe('typer.schema() helper', () => {
        it('preserves literal types so Infer<typeof schema> works without as const', () => {
            const userSchema = typer.schema({
                id: 'number',
                name: 'string',
                email: 'string?',
            });
            type User = Infer<typeof userSchema>;
            expectType<AssertEqual<User['id'], number>>();
            expectType<AssertEqual<User['name'], string>>();
            expectType<AssertEqual<User['email'], string | null | undefined>>();
            expect(userSchema.id).toBe('number');
        });
    });

    describe('Compile-time type inference (Infer<typeof schema>)', () => {
        it('basic flat schema infers required + optional + null', () => {
            const schema = {
                id: 'number',
                name: 'string',
                email: 'string?',
            } as const;
            type T = Infer<typeof schema>;
            expectType<AssertEqual<T['id'], number>>();
            expectType<AssertEqual<T['name'], string>>();
            expectType<AssertEqual<T['email'], string | null | undefined>>();
            expect(true).toBe(true);
        });

        it('union strings produce TS unions', () => {
            const schema = { value: 'string|number' } as const;
            type T = Infer<typeof schema>;
            expectType<AssertEqual<T['value'], string | number>>();
            expect(true).toBe(true);
        });

        it('array element types infer T[]', () => {
            const schema = { tags: ['string'] } as const;
            type T = Infer<typeof schema>;
            expectType<AssertEqual<T['tags'], string[]>>();
            expect(true).toBe(true);
        });

        it('nested objects infer recursively', () => {
            const schema = {
                user: {
                    name: 'string',
                    age: 'number?',
                },
            } as const;
            type T = Infer<typeof schema>;
            expectType<AssertEqual<T['user']['name'], string>>();
            expectType<AssertEqual<T['user']['age'], number | null | undefined>>();
            expect(true).toBe(true);
        });

        it('parse infers the type without explicit generics or as const', () => {
            // No `as const`, no <T> — just write the schema and parse.
            const result = typer.parse(
                { id: 'number', name: 'string' },
                { id: 1, name: 'Mike' },
            );
            expectType<AssertEqual<typeof result['id'], number>>();
            expectType<AssertEqual<typeof result['name'], string>>();
            expect(result.id).toBe(1);
        });
    });
});
