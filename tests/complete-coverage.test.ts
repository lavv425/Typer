import { Typer } from '../src/Typer';

describe('Typer - Complete Coverage Tests', () => {
    let typer: Typer;

    beforeEach(() => {
        typer = new Typer();
    });

    describe('Missing coverage scenarios', () => {
        it('should handle DOM element validation in browser-like environment', () => {
            // Mock HTMLElement per simulare un ambiente browser
            const MockHTMLElement = class MockElement {};
            (global as any).HTMLElement = MockHTMLElement;
            
            const mockElement = new MockHTMLElement();
            
            try {
                expect(() => typer.isType('dom', mockElement)).not.toThrow();
            } finally {
                // Cleanup
                delete (global as any).HTMLElement;
            }
        });

        it('should handle Date validation edge cases', () => {
            const invalidDate = new Date('invalid date string');
            expect(() => typer.isType('date', invalidDate)).toThrow('must be a valid Date');
        });

        it('should handle expect function with returnType validation edge case', () => {
            const func = (x: number) => x;
            
            // Test case dove returnType è undefined ma non 'void'
            expect(() => typer.expect(func, {
                paramTypes: ['number'],
                returnType: undefined as any
            })).toThrow('Expected paramType, returnType types');
        });

        it('should handle expect function args validation in else branch', () => {
            const multiParamFunc = (x: number, y: string, z: boolean) => `${x}_${y}_${z}`;
            const typedFunc = typer.expect(multiParamFunc, {
                paramTypes: ['number', 'string', 'boolean'],
                returnType: ['string']
            });

            // Test the else branch where we validate each parameter by index
            expect(typedFunc(42, 'hello', true)).toBe('42_hello_true');
            
            // Test validation failure in the else branch
            expect(() => typedFunc(42, 123, true)).toThrow('must be a string');
        });
    });

    describe('Error path coverage for uncovered lines', () => {
        it('should handle null schema gracefully', () => {
            const result = typer.checkStructure(null as any, {});
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Invalid schema: must be a non-null object');
        });

        it('should handle array schema gracefully', () => {
            const result = typer.checkStructure([] as any, {});
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Invalid schema: must be a non-null object');
        });
    });

    describe('Complete type system edge cases', () => {
        it('should handle all undefined checks in expect function', () => {
            const func = (x: number) => x;
            
            // Test undefined paramTypes
            expect(() => typer.expect(func, {
                paramTypes: undefined as any,
                returnType: ['number']
            })).toThrow('Expected paramType, returnType types');
        });

        it('should test all DOM element variations', () => {
            // Test all DOM element type aliases
            expect(() => typer.isType('dom', 'not-dom')).toThrow();
            expect(() => typer.isType('domel', 'not-dom')).toThrow();
            expect(() => typer.isType('domelement', 'not-dom')).toThrow();
        });
    });
});