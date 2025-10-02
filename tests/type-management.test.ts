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
});