import { Typer } from '../src/Typer';

describe('Typer - Expect, Validate, Assert Functions', () => {
    let typer: Typer;

    beforeEach(() => {
        typer = new Typer();
    });

    describe('expect function', () => {
        it('should create type-safe wrapper for single parameter function', () => {
            const multiply = (x: number) => x * 2;
            const typedMultiply = typer.expect(multiply, {
                paramTypes: ['number'],
                returnType: ['number']
            });

            expect(typedMultiply(5)).toBe(10);
        });

        it('should create type-safe wrapper for multiple parameter function', () => {
            const add = (x: number, y: number) => x + y;
            const typedAdd = typer.expect(add, {
                paramTypes: ['number', 'number'],
                returnType: ['number']
            });

            expect(typedAdd(3, 4)).toBe(7);
        });

        it('should validate parameter types', () => {
            const stringify = (x: number) => x.toString();
            const typedStringify = typer.expect(stringify, {
                paramTypes: ['number'],
                returnType: ['string']
            });

            expect(() => typedStringify('not a number' as any))
                .toThrow('must be a number, is string');
        });

        it('should validate return types', () => {
            const badFunction = (x: number) => 'always string';
            const typedBadFunction = typer.expect(badFunction, {
                paramTypes: ['number'],
                returnType: ['number']
            });

            expect(() => typedBadFunction(5))
                .toThrow('Return type mismatch');
        });

        it('should handle void return type', () => {
            const logFunction = (x: string) => {
                console.log(x);
                return undefined;
            };
            const typedLogFunction = typer.expect(logFunction, {
                paramTypes: ['string'],
                returnType: ['void']
            });

            expect(() => typedLogFunction('test')).not.toThrow();
        });

        it('should handle Promise return types', async () => {
            const asyncFunction = (x: number): Promise<string> => 
                Promise.resolve(x.toString());
            
            const typedAsyncFunction = typer.expect(asyncFunction, {
                paramTypes: ['number'],
                returnType: ['string']
            });

            const result = await typedAsyncFunction(42);
            expect(result).toBe('42');
        });

        it('should handle rejected Promises', async () => {
            const rejectedFunction = (x: number): Promise<string> => 
                Promise.reject(new Error('Test error'));
            
            const typedRejectedFunction = typer.expect(rejectedFunction, {
                paramTypes: ['number'],
                returnType: ['string']
            });

            await expect(typedRejectedFunction(42)).rejects.toThrow('Test error');
        });

        it('should handle Promise return type validation errors', async () => {
            const badAsyncFunction = (x: number): Promise<number> => 
                Promise.resolve('string' as any);
            
            const typedBadAsyncFunction = typer.expect(badAsyncFunction, {
                paramTypes: ['number'],
                returnType: ['number']
            });

            await expect(typedBadAsyncFunction(42)).rejects.toThrow('Return type mismatch');
        });

        it('should validate single parameter type for multiple arguments', () => {
            const sumAll = (...nums: number[]) => nums.reduce((a, b) => a + b, 0);
            const typedSumAll = typer.expect(sumAll, {
                paramTypes: ['number'],
                returnType: ['number']
            });

            expect(typedSumAll(1, 2, 3, 4)).toBe(10);
        });

        it('should throw for wrong number of arguments (multiple param types)', () => {
            const add = (x: number, y: number) => x + y;
            const typedAdd = typer.expect(add, {
                paramTypes: ['number', 'number'],
                returnType: ['number']
            });

            expect(() => typedAdd(5 as any)).toThrow('Expected 2 arguments, but got 1');
        });

        it('should validate each parameter type for multiple parameters', () => {
            const concat = (str: string, num: number) => str + num;
            const typedConcat = typer.expect(concat, {
                paramTypes: ['string', 'number'],
                returnType: ['string']
            });

            expect(() => typedConcat('hello', 'world' as any))
                .toThrow('must be a number, is string');
        });

        it('should handle multiple return types', () => {
            const flexible = (x: boolean) => x ? 42 : 'string';
            const typedFlexible = typer.expect(flexible, {
                paramTypes: ['boolean'],
                returnType: ['number', 'string']
            });

            expect(typedFlexible(true)).toBe(42);
            expect(typedFlexible(false)).toBe('string');
        });

        it('should throw for wrong types object structure', () => {
            const func = (x: number) => x;
            
            expect(() => typer.expect(func, { paramTypes: ['number'] } as any))
                .toThrow('Expected 2 types (paramTypes and returnTypes)');
        });

        it('should throw for missing required properties', () => {
            const func = (x: number) => x;
            
            expect(() => typer.expect(func, { returnType: ['number'] } as any))
                .toThrow('Expected 2 types (paramTypes and returnTypes)');
        });

        it('should throw for too many properties in types object', () => {
            const func = (x: number) => x;
            
            expect(() => typer.expect(func, {
                paramTypes: ['number'],
                returnType: ['number'],
                extra: 'property'
            } as any)).toThrow('Expected 2 types (paramTypes and returnTypes)');
        });

        it('should validate function parameter', () => {
            expect(() => typer.expect('not a function' as any, {
                paramTypes: ['number'],
                returnType: ['number']
            })).toThrow('must be a function');
        });

        it('should validate types object', () => {
            const func = (x: number) => x;
            
            expect(() => typer.expect(func, 'not an object' as any))
                .toThrow('Expected 2 types (paramTypes and returnTypes)');
        });
    });

    describe('validate function', () => {
        it('should validate object against schema and return errors', () => {
            const schema = { name: 'string', age: 'number' };
            const validObj = { name: 'John', age: 25 };
            
            const errors = typer.validate(schema, validObj);
            expect(errors).toEqual([]);
        });

        it('should detect type mismatches', () => {
            const schema = { name: 'string', age: 'number' };
            const invalidObj = { name: 'John', age: '25' };
            
            const errors = typer.validate(schema, invalidObj);
            expect(errors).toContain('Expected "age" to be of type number, got string');
        });

        it('should handle multiple type mismatches', () => {
            const schema = { name: 'string', age: 'number', active: 'boolean' };
            const invalidObj = { name: 123, age: '25', active: 'yes' };
            
            const errors = typer.validate(schema, invalidObj);
            expect(errors.length).toBe(3);
        });

        it('should handle array of allowed types', () => {
            const schema = { value: ['string', 'number'] };
            const validObj1 = { value: 'text' };
            const validObj2 = { value: 42 };
            
            expect(typer.validate(schema, validObj1)).toEqual([]);
            expect(typer.validate(schema, validObj2)).toEqual([]);
        });

        it('should handle missing properties', () => {
            const schema = { name: 'string', age: 'number' };
            const invalidObj = { name: 'John' };
            
            const errors = typer.validate(schema, invalidObj);
            expect(errors).toContain('Expected "age" to be of type number, got undefined');
        });
    });

    describe('assert function', () => {
        it('should not warn for correct type', () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            
            typer.assert('hello', 'string');
            typer.assert(42, 'number');
            typer.assert(true, 'boolean');
            
            expect(consoleSpy).not.toHaveBeenCalled();
            consoleSpy.mockRestore();
        });

        it('should warn for incorrect type', () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            
            typer.assert(42, 'string');
            
            expect(consoleSpy).toHaveBeenCalledWith(
                '[Typer] Assertion failed: Expected string, got number',
                42
            );
            consoleSpy.mockRestore();
        });

        it('should handle array of types', () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            
            typer.assert(42, ['string', 'number']);
            typer.assert('hello', ['string', 'number']);
            
            expect(consoleSpy).not.toHaveBeenCalled();
            consoleSpy.mockRestore();
        });

        it('should warn for array of types when none match', () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            
            typer.assert(true, ['string', 'number']);
            
            expect(consoleSpy).toHaveBeenCalledWith(
                '[Typer] Assertion failed: Expected string,number, got boolean',
                true
            );
            consoleSpy.mockRestore();
        });
    });
});