import { Typer } from '../src/Typer';
import { safeParse, createRegistry } from '../src/core';

/**
 * A schema names its types with strings, and those strings were looked up on
 * an ordinary object — so `Object.prototype`'s own members answered.
 *
 * `{ role: 'constructor' }` resolved to `Object.prototype.constructor`, which
 * the resolver treated as a registered custom type; since `Object(value)`
 * never throws, the wrapped predicate returned `true` for everything. The key
 * was silently exempt from validation, and `success: true` said otherwise.
 *
 * Present in every published release up to and including 4.1.1.
 */
const INHERITED = ['constructor', 'toString', 'hasOwnProperty', 'valueOf', 'isPrototypeOf', '__defineGetter__'];

describe('inherited Object.prototype members are not type aliases', () => {
    describe('Typer class', () => {
        it.each(INHERITED)('rejects %p as an unknown type', (alias) => {
            const typer = new Typer();
            const result = typer.safeParse({ role: alias } as never, { role: 'anything at all' });

            expect(result.success).toBe(false);
            if (result.success) return;
            expect(result.issues[0]).toMatchObject({ code: 'unknown_type', path: 'role', expected: alias });
        });

        it('does not accept an arbitrary object for a "constructor"-typed key', () => {
            const typer = new Typer();
            expect(typer.safeParse({ role: 'constructor' } as never, { role: { nested: true } }).success).toBe(false);
        });

        it('still reports them through checkStructure', () => {
            const typer = new Typer();
            const result = typer.checkStructure({ role: 'constructor' }, { role: 1 });

            expect(result.isValid).toBe(false);
            expect(result.issues[0].code).toBe('unknown_type');
        });

        it('leaves a genuinely registered alias of that name working', () => {
            // Registering it explicitly is a legitimate, if odd, thing to do —
            // the fix is about not resolving it by accident.
            const typer = new Typer();
            typer.registerType('constructor', (v: unknown) => {
                if (typeof v !== 'number') throw new TypeError('must be a number');
                return v;
            });

            expect(typer.safeParse({ role: 'constructor' } as never, { role: 1 }).success).toBe(true);
            expect(typer.safeParse({ role: 'constructor' } as never, { role: 'x' }).success).toBe(false);
        });
    });

    describe('free API', () => {
        it.each(INHERITED)('rejects %p as an unknown type', (alias) => {
            const result = safeParse({ role: alias } as never, { role: 'anything at all' });

            expect(result.success).toBe(false);
            if (result.success) return;
            expect(result.issues[0].code).toBe('unknown_type');
        });

        it.each(INHERITED)('rejects %p with a registry too', (alias) => {
            const registry = createRegistry({ positive: (v: unknown): number => Number(v) });
            const result = safeParse({ role: alias } as never, { role: 'anything' }, { registry });

            expect(result.success).toBe(false);
            if (result.success) return;
            expect(result.issues[0].code).toBe('unknown_type');
        });
    });
});
