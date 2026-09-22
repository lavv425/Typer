import { BUILTIN_CONTEXT } from '../src/Core/Registry';
import { getCompiledChecker } from '../src/Core/Compile';
import { jitChecker } from '../src/Core/Jit';
import { compile, canGenerate } from '../src/jit';

/**
 * A Content-Security-Policy without `unsafe-eval` makes `new Function` throw.
 *
 * The entry point promises that this degrades to the closure compiler rather
 * than failing, which is a promise about the one environment the test suite
 * does not run in — so it is simulated here by taking `Function` away.
 */
const withoutCodegen = <T>(body: () => T): T => {
    const original = globalThis.Function;
    const blocked = function (): never {
        throw new EvalError("Refused to evaluate a string as JavaScript because 'unsafe-eval' is not an allowed source of script");
    };
    // The generator resolves `Function` from the global scope at call time,
    // which is what makes this reachable at all.
    (globalThis as { Function: unknown }).Function = blocked;
    try {
        return body();
    } finally {
        (globalThis as { Function: unknown }).Function = original;
    }
};

describe('under a policy that forbids generated code', () => {
    it('the probe reports it rather than throwing', () => {
        expect(canGenerate()).toBe(true);
        expect(withoutCodegen(() => canGenerate())).toBe(false);
    });

    it('jitChecker returns null instead of propagating the EvalError', () => {
        expect(withoutCodegen(() => jitChecker(BUILTIN_CONTEXT, { id: 'number' }, true))).toBeNull();
    });

    it('compile still validates, and says it is not generating', () => {
        const schema = { id: 'number', addr: { city: 'string' }, tags: ['string'] };
        const user = withoutCodegen(() => compile(schema));

        expect(user.generated).toBe(false);

        const interpreted = getCompiledChecker(BUILTIN_CONTEXT, schema, true);
        for (const value of [
            { id: 1, addr: { city: 'Rome' }, tags: ['a'] },
            { id: 'x', addr: {}, tags: [2], extra: true },
        ]) {
            const result = user.safeParse(structuredClone(value));
            const expected = interpreted(structuredClone(value), '');

            expect(result.success).toBe(expected.length === 0);
            if (!result.success) expect(result.issues).toEqual(expected);
        }
    });

    it('parse throws the same error it would with codegen available', () => {
        const schema = { id: 'number' };
        const blocked = withoutCodegen(() => compile(schema));
        const generated = compile(schema);

        expect(generated.generated).toBe(true);

        const message = (run: () => void): string => {
            try { run(); return ''; } catch (e) { return (e as Error).message; }
        };

        expect(message(() => blocked.parse({ id: 'x' })))
            .toBe(message(() => generated.parse({ id: 'x' })));
    });
});
