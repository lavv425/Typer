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
        it('should test all DOM element variations', () => {
            // Test all DOM element type aliases
            expect(() => typer.isType('dom', 'not-dom')).toThrow();
            expect(() => typer.isType('domel', 'not-dom')).toThrow();
            expect(() => typer.isType('domelement', 'not-dom')).toThrow();
        });
    });
});