import { Typer } from '../src/Typer';

describe('Typer - Edge Cases and Error Handling', () => {
    let typer: Typer;

    beforeEach(() => {
        typer = new Typer();
    });

    describe('getType helper method', () => {
        it('should correctly identify null', () => {
            // Testing via checkStructure since getType is private
            const result = typer.checkStructure({ value: 'null' }, { value: null });
            expect(result.isValid).toBe(true);
        });

        it('should correctly identify arrays', () => {
            const result = typer.checkStructure({ value: 'array' }, { value: [] });
            expect(result.isValid).toBe(true);
        });

        it('should correctly identify dates', () => {
            const result = typer.checkStructure({ value: 'date' }, { value: new Date() });
            expect(result.isValid).toBe(true);
        });

        it('should correctly identify regexp', () => {
            const result = typer.checkStructure({ value: 'regexp' }, { value: /test/ });
            expect(result.isValid).toBe(true);
        });

        it('should correctly identify maps', () => {
            const result = typer.checkStructure({ value: 'map' }, { value: new Map() });
            expect(result.isValid).toBe(true);
        });

        it('should correctly identify sets', () => {
            const result = typer.checkStructure({ value: 'set' }, { value: new Set() });
            expect(result.isValid).toBe(true);
        });
    });

    describe('checkStructure edge cases', () => {
        it('should handle invalid schema (null)', () => {
            const result = typer.checkStructure(null as any, {});
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Invalid schema: must be a non-null object');
        });

        it('should handle invalid schema (array)', () => {
            const result = typer.checkStructure([] as any, {});
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Invalid schema: must be a non-null object');
        });

        it('should handle invalid object (null)', () => {
            const result = typer.checkStructure({}, null as any);
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Invalid object: must be a non-null object, got null');
        });

        it('should handle invalid object (array)', () => {
            const result = typer.checkStructure({}, [] as any);
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Invalid object: must be a non-null object, got array');
        });

        it('should handle empty string type definition', () => {
            const result = typer.checkStructure({ value: '' }, { value: 'test' });
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Empty type definition at "value"');
        });

        it('should handle invalid union type definition', () => {
            const result = typer.checkStructure({ value: '|' }, { value: 'test' });
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Invalid type definition "|" at "value"');
        });

        it('should handle empty array schema', () => {
            const result = typer.checkStructure({ arr: [] }, { arr: [] });
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Empty array schema definition at "arr"');
        });

        it('should handle array schema with multiple elements', () => {
            const result = typer.checkStructure({ arr: ['string', 'number'] }, { arr: [] });
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Array schema must have exactly one element type definition at "arr"');
        });

        it('should handle array schema with non-string element type', () => {
            const result = typer.checkStructure({ arr: [123] }, { arr: [] });
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Array element type must be a string at "arr"');
        });

        it('should handle non-array value for array schema', () => {
            const result = typer.checkStructure({ arr: ['string'] }, { arr: 'not array' });
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Expected "arr" to be an array, got string');
        });

        it('should handle array element validation errors', () => {
            const result = typer.checkStructure({ arr: ['number'] }, { arr: [1, 'two', 3] });
            expect(result.isValid).toBe(false);
            expect(result.errors.some(err => err.includes('arr[1]'))).toBe(true);
        });

        it('should handle non-object value for object schema', () => {
            const result = typer.checkStructure({ nested: { prop: 'string' } }, { nested: 'not object' });
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Expected "nested" to be an object, got string');
        });

        it('should handle invalid schema definition types', () => {
            const result = typer.checkStructure({ value: 123 as any }, { value: 'test' });
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Invalid schema definition at "value": expected string, array, or object, got number');
        });

        it('should handle validateSchemaValue exceptions', () => {
            // Test basic validation error handling in nested structures
            const result = typer.checkStructure({ value: 'unknowntype' }, { value: 'test' });
            expect(result.isValid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });

        it('should handle nested path errors correctly', () => {
            const schema = {
                user: {
                    profile: {
                        name: 'string'
                    }
                }
            };
            const obj = {
                user: {
                    profile: {
                        name: 123
                    }
                }
            };
            
            const result = typer.checkStructure(schema, obj);
            expect(result.isValid).toBe(false);
            expect(result.errors.some(err => err.includes('user.profile.name'))).toBe(true);
        });

        it('should handle complex nested validation with strict mode', () => {
            const schema = {
                data: {
                    items: ['number']
                }
            };
            const obj = {
                data: {
                    items: [1, 2, 3],
                    extra: 'not allowed'
                }
            };
            
            const result = typer.checkStructure(schema, obj, '', true);
            expect(result.isValid).toBe(false);
            expect(result.errors.some(err => err.includes('Unexpected key "data.extra"'))).toBe(true);
        });
    });

    describe('Error message formatting', () => {
        it('should include full path in error messages', () => {
            const schema = {
                level1: {
                    level2: {
                        level3: 'number'
                    }
                }
            };
            const obj = {
                level1: {
                    level2: {
                        level3: 'string'
                    }
                }
            };
            
            const result = typer.checkStructure(schema, obj);
            expect(result.isValid).toBe(false);
            expect(result.errors.some(err => err.includes('level1.level2.level3'))).toBe(true);
        });

        it('should handle array indices in error paths', () => {
            const schema = {
                items: ['string']
            };
            const obj = {
                items: ['valid', 123, 'another']
            };
            
            const result = typer.checkStructure(schema, obj);
            expect(result.isValid).toBe(false);
            expect(result.errors.some(err => err.includes('items[1]'))).toBe(true);
        });
    });

    describe('Union type validation edge cases', () => {
        it('should handle whitespace in union types', () => {
            const result = typer.checkStructure({ value: ' string | number ' }, { value: 42 });
            expect(result.isValid).toBe(true);
        });

        it('should handle empty parts in union types', () => {
            const result = typer.checkStructure({ value: 'string||number' }, { value: 'test' });
            expect(result.isValid).toBe(true);
        });

        it('should collect all validation errors for union types', () => {
            const result = typer.checkStructure({ value: 'array|object' }, { value: 'string' });
            expect(result.isValid).toBe(false);
            expect(result.errors.some(err => err.includes('one of [array, object]'))).toBe(true);
        });
    });

    describe('Type validation error aggregation', () => {
        it('should collect multiple validation errors', () => {
            const schema = {
                name: 'string',
                age: 'number', 
                active: 'boolean',
                tags: ['string']
            };
            const obj = {
                name: 123,
                age: 'twenty',
                active: 'yes',
                tags: [1, 2, 3]
            };
            
            const result = typer.checkStructure(schema, obj);
            expect(result.isValid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(4); // At least one error per field + array elements
        });
    });

    describe('Optional field handling', () => {
        it('should handle null values for optional fields', () => {
            const result = typer.checkStructure({ name: 'string?' }, { name: null });
            expect(result.isValid).toBe(true);
        });

        it('should validate optional field types when present', () => {
            const result = typer.checkStructure({ name: 'string?' }, { name: 123 });
            expect(result.isValid).toBe(false);
        });
    });
});