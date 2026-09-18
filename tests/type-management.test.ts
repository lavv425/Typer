import { Typer } from '../src/Typer';

describe('Typer - Type Management', () => {
    let typer: Typer;

    beforeEach(() => {
        typer = new Typer();
    });

    describe('registerType', () => {
        it('should register a new custom type', () => {
            const validator = (value: unknown) => {
                if (typeof value !== 'number' || value <= 0) {
                    throw new TypeError('Must be positive number');
                }
                return value;
            };

            expect(() => typer.registerType('positive', validator)).not.toThrow();
            expect(typer.listTypes()).toContain('positive');
        });

        it('should throw error when registering existing type without override', () => {
            const validator = () => 'test';
            
            expect(() => typer.registerType('string', validator)).toThrow('Type "string" is already registered.');
        });

        it('should allow overriding existing type when override is true', () => {
            const validator = () => 'test';
            
            expect(() => typer.registerType('string', validator, true)).not.toThrow();
        });

        it('should handle case-insensitive type names', () => {
            const validator = () => 'test';
            
            typer.registerType('MYTYPE', validator);
            expect(typer.listTypes()).toContain('mytype');
        });

        it('should trim whitespace from type names', () => {
            const validator = () => 'test';
            
            typer.registerType('  spaced  ', validator);
            expect(typer.listTypes()).toContain('spaced');
        });
    });

    describe('unregisterType', () => {
        it('should remove an existing type', () => {
            const validator = () => 'test';
            typer.registerType('custom', validator);
            
            expect(typer.listTypes()).toContain('custom');
            typer.unregisterType('custom');
            expect(typer.listTypes()).not.toContain('custom');
        });

        it('should throw error when removing non-existing type', () => {
            expect(() => typer.unregisterType('nonexistent')).toThrow('Type "nonexistent" is not registered.');
        });

        it('should handle case-insensitive removal', () => {
            const validator = () => 'test';
            typer.registerType('custom', validator);
            
            expect(() => typer.unregisterType('CUSTOM')).not.toThrow();
            expect(typer.listTypes()).not.toContain('custom');
        });
    });

    describe('listTypes', () => {
        it('should return all registered types', () => {
            const types = typer.listTypes();
            
            expect(Array.isArray(types)).toBe(true);
            expect(types).toContain('string');
            expect(types).toContain('number');
            expect(types).toContain('boolean');
            expect(types).toContain('array');
            expect(types).toContain('object');
        });

        it('should include custom registered types', () => {
            const validator = () => 'test';
            typer.registerType('custom', validator);
            
            const types = typer.listTypes();
            expect(types).toContain('custom');
        });
    });

    describe('exportTypes', () => {
        it('should export types as JSON string', () => {
            const exported = typer.exportTypes();
            
            expect(typeof exported).toBe('string');
            
            const parsed = JSON.parse(exported);
            expect(Array.isArray(parsed)).toBe(true);
            expect(parsed).toContain('string');
            expect(parsed).toContain('number');
        });

        it('should include custom types in export', () => {
            const validator = () => 'test';
            typer.registerType('custom', validator);
            
            const exported = typer.exportTypes();
            const parsed = JSON.parse(exported);
            
            expect(parsed).toContain('custom');
        });
    });

    describe('importTypes', () => {
        it('should import valid JSON array of types', () => {
            const json = '["string", "number"]';
            
            expect(() => typer.importTypes(json)).not.toThrow();
        });

        it('should throw error for invalid JSON', () => {
            const invalidJson = '{invalid json}';
            
            expect(() => typer.importTypes(invalidJson)).toThrow();
        });

        it('should throw error for non-array JSON', () => {
            const nonArrayJson = '{"not": "array"}';
            
            expect(() => typer.importTypes(nonArrayJson)).toThrow('Invalid type list');
        });

        it('should warn about unknown types', () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            const json = '["unknownType"]';
            
            typer.importTypes(json);
            
            expect(consoleSpy).toHaveBeenCalledWith('[Typer] Unknown type in import: unknownType');
            consoleSpy.mockRestore();
        });

        it('should not warn for known types', () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            const json = '["string", "number"]';

            typer.importTypes(json);

            expect(consoleSpy).not.toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });

    describe('extend', () => {
        const positive = (v: unknown): number => {
            if (typeof v !== 'number' || v <= 0) throw new TypeError('Must be positive');
            return v;
        };

        it('registers the type and returns the same instance', () => {
            const extended = typer.extend('positive', positive);

            expect(extended).toBe(typer);
            expect(typer.listTypes()).toContain('positive');
        });

        it('makes the alias usable in is/isType and schemas', () => {
            typer.extend('positive', positive);

            expect(typer.is(5, 'positive')).toBe(true);
            expect(typer.is(-5, 'positive')).toBe(false);
            expect(typer.isType('positive', 5)).toBe(5);
            expect(typer.checkStructure({ qty: 'positive' }, { qty: 5 }).isValid).toBe(true);
            expect(typer.checkStructure({ qty: 'positive' }, { qty: -5 }).isValid).toBe(false);
        });

        it('chains', () => {
            const extended = typer
                .extend('positive', positive)
                .extend('slug', (v) => new Typer().isSlug(v));

            expect(extended.is(5, 'positive')).toBe(true);
            expect(extended.is('a-b', 'slug')).toBe(true);
            expect(extended.is('A B', 'slug')).toBe(false);
        });

        it('rejects a duplicate unless override is set', () => {
            typer.extend('positive', positive);

            expect(() => typer.extend('positive', positive)).toThrow('Type "positive" is already registered.');
            expect(() => typer.extend('positive', positive, true)).not.toThrow();
        });
    });

    describe('overriding a built-in alias', () => {
        // `is`/`isType`/schemas serve built-in aliases from a fast predicate
        // table. An override has to take priority over that table, or it would
        // be silently ignored everywhere except the error-message path.
        const atLeastFive = (v: unknown): string => {
            if (typeof v !== 'string' || v.length < 5) throw new TypeError('too short');
            return v;
        };

        it('applies the override to is()', () => {
            expect(typer.is('ab', 'string')).toBe(true);

            typer.registerType<unknown, string>('string', atLeastFive, true);

            expect(typer.is('ab', 'string')).toBe(false);
            expect(typer.is('abcdef', 'string')).toBe(true);
        });

        it('applies the override to isType()', () => {
            typer.registerType<unknown, string>('string', atLeastFive, true);

            expect(() => typer.isType('string', 'ab')).toThrow();
            expect(typer.isType('string', 'abcdef')).toBe('abcdef');
        });

        it('applies the override to every alias sharing that checker', () => {
            typer.registerType<unknown, string>('str', atLeastFive, true);

            // 'str' was overridden; 's' and 'string' still point at the original.
            expect(typer.is('ab', 'str')).toBe(false);
            expect(typer.is('ab', 'string')).toBe(true);
        });

        it('applies the override inside schemas', () => {
            typer.registerType<unknown, string>('string', atLeastFive, true);

            expect(typer.checkStructure({ a: 'string' }, { a: 'ab' }).isValid).toBe(false);
            expect(typer.checkStructure({ a: 'string' }, { a: 'abcdef' }).isValid).toBe(true);
        });

        it('leaves untouched built-ins on the fast path', () => {
            typer.registerType<unknown, string>('string', atLeastFive, true);

            expect(typer.is(1, 'number')).toBe(true);
            expect(typer.is('x', 'number')).toBe(false);
        });
    });

    describe('compiled schema cache invalidation', () => {
        // Schemas resolve their type names once, at compile time, and the
        // compiled result is cached per schema object. Changing the registry
        // afterwards has to drop that cache or the schema keeps validating
        // against the old definition.
        it('picks up a type registered after the schema was first used', () => {
            const schema = { value: 'positive' };

            expect(typer.checkStructure(schema, { value: 1 }).errors).toEqual(['Unknown type: positive']);

            typer.registerType<unknown, number>('positive', (v) => {
                if (typeof v !== 'number' || v <= 0) throw new TypeError('Must be positive');
                return v;
            });

            expect(typer.checkStructure(schema, { value: 1 }).isValid).toBe(true);
            expect(typer.checkStructure(schema, { value: -1 }).isValid).toBe(false);
        });

        it('picks up an overridden type after the schema was first used', () => {
            const schema = { value: 'small' };
            typer.registerType<unknown, number>('small', (v) => {
                if (typeof v !== 'number' || v >= 10) throw new TypeError('Must be < 10');
                return v;
            });
            expect(typer.checkStructure(schema, { value: 5 }).isValid).toBe(true);

            typer.registerType<unknown, number>('small', (v) => {
                if (typeof v !== 'number' || v >= 3) throw new TypeError('Must be < 3');
                return v;
            }, true);

            expect(typer.checkStructure(schema, { value: 5 }).isValid).toBe(false);
        });

        it('picks up an unregistered type after the schema was first used', () => {
            const schema = { value: 'temp' };
            typer.registerType<unknown, unknown>('temp', (v) => v);
            expect(typer.checkStructure(schema, { value: 'anything' }).isValid).toBe(true);

            typer.unregisterType('temp');

            expect(typer.checkStructure(schema, { value: 'anything' }).errors).toEqual(['Unknown type: temp']);
        });
    });
});