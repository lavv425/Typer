import { parse, safeParse, createRegistry } from '../src/core';
import { parseAsync } from '../src/async';
import { objectOf } from '../src/combinators';
import { Typer } from '../src/Typer';
import { BUILTIN_CONTEXT } from '../src/Core/Registry';
import { resolveChecker, CLOSURE_BACKEND } from '../src/Core/Backend';
import { installJit } from '../src/jit';

/**
 * `installJit` swaps the compilation strategy for the whole process, so these
 * assert two separate things: that everything which compiles a schema goes
 * through the slot, and that nothing observable changes when it does.
 *
 * Whether a schema has been upgraded is read by identity — the back end hands
 * back a different checker once it has generated one — rather than by timing,
 * which would be flaky.
 */
const uninstallers: Array<() => void> = [];
const install = (options?: Parameters<typeof installJit>[0]): void => {
    uninstallers.push(installJit(options));
};

afterEach(() => {
    while (uninstallers.length > 0) uninstallers.pop()!();
});

/** Fresh every time: warmth is keyed by schema object identity. */
const userSchema = (): Record<string, unknown> => ({ id: 'number', addr: { city: 'string' }, tags: ['string'] });

describe('installJit', () => {
    it('leaves the closure compiler in place until it is called', () => {
        const schema = userSchema();
        expect(resolveChecker(BUILTIN_CONTEXT, schema, true))
            .toBe(CLOSURE_BACKEND(BUILTIN_CONTEXT, schema, true));
    });

    it('upgrades a schema only once it has served the threshold', () => {
        install({ threshold: 5 });
        const schema = userSchema();
        const payload = { id: 1, addr: { city: 'Rome' }, tags: ['a'] };

        // Reading through `resolveChecker` is itself a use — in production
        // every such call is a validation — so the probes are counted here.
        for (let i = 0; i < 3; i++) parse(schema, structuredClone(payload));   // 3
        expect(resolveChecker(BUILTIN_CONTEXT, schema, true))                  // 4
            .toBe(CLOSURE_BACKEND(BUILTIN_CONTEXT, schema, true));

        parse(schema, structuredClone(payload));                              // 5 — upgrades
        expect(resolveChecker(BUILTIN_CONTEXT, schema, true))
            .not.toBe(CLOSURE_BACKEND(BUILTIN_CONTEXT, schema, true));
    });

    it('generates on first sight when eager', () => {
        install({ eager: true });
        const schema = userSchema();

        const first = resolveChecker(BUILTIN_CONTEXT, schema, true);
        const second = resolveChecker(BUILTIN_CONTEXT, schema, true);
        expect(second).toBe(first);

        // A separate schema object proves the upgrade happened at once rather
        // than on the second look.
        const other = userSchema();
        const closure = CLOSURE_BACKEND(BUILTIN_CONTEXT, other, true);
        expect(resolveChecker(BUILTIN_CONTEXT, other, true)).not.toBe(closure);
    });

    it('never upgrades a schema literal written per call', () => {
        install({ threshold: 2 });
        const payload = { id: 1, addr: { city: 'Rome' }, tags: ['a'] };

        // The antipattern: a new object each time, so nothing accumulates and
        // no generation is ever paid for.
        for (let i = 0; i < 50; i++) {
            expect(parse(userSchema(), structuredClone(payload))).toBeDefined();
        }

        const fresh = userSchema();
        expect(resolveChecker(BUILTIN_CONTEXT, fresh, true))
            .toBe(CLOSURE_BACKEND(BUILTIN_CONTEXT, fresh, true));
    });

    it('produces identical issues before and after the upgrade', () => {
        const schema = userSchema();
        const bad = { id: 'x', addr: {}, tags: [1], extra: true };

        const closure = safeParse(schema, structuredClone(bad));

        install({ eager: true });
        const generated = safeParse(userSchema(), structuredClone(bad));

        expect(closure.success).toBe(false);
        expect(generated.success).toBe(false);
        if (closure.success || generated.success) return;
        expect(generated.issues).toEqual(closure.issues);
    });

    it('reaches objectOf, the Typer class and parseAsync too', async () => {
        install({ eager: true });

        expect(safeParse(objectOf({ id: 'number' }), { id: 1 }).success).toBe(true);
        expect(safeParse(objectOf({ id: 'number' }), { id: 'x' }).success).toBe(false);

        const typer = new Typer();
        expect(typer.safeParse({ id: 'number' }, { id: 1 }).success).toBe(true);
        expect(typer.safeParse({ id: 'number' }, { id: 'x' }).success).toBe(false);

        await expect(parseAsync({ id: 'number' }, { id: 1 })).resolves.toEqual({ id: 1 });
        await expect(parseAsync({ id: 'number' }, { id: 'x' })).rejects.toThrow('Validation failed');
    });

    it('keeps one schema object honest across two registries', () => {
        install({ eager: true });

        const a = createRegistry({ positive: (v: unknown): number => { if (typeof v !== 'number' || v <= 0) throw new TypeError('nope'); return v; } });
        const b = createRegistry({ positive: (v: unknown): number => { if (typeof v !== 'number' || v >= 0) throw new TypeError('nope'); return v; } });

        // The same object, two registries that disagree about what `positive`
        // means. Warmth is keyed by schema identity, so this is exactly where a
        // shared entry would serve the wrong checker.
        const schema = { qty: 'positive' };

        for (let i = 0; i < 5; i++) {
            expect(safeParse(schema, { qty: 2 }, { registry: a }).success).toBe(true);
            expect(safeParse(schema, { qty: 2 }, { registry: b }).success).toBe(false);
            expect(safeParse(schema, { qty: -2 }, { registry: b }).success).toBe(true);
        }
    });

    it('the disposer restores the closure compiler', () => {
        const stop = installJit({ eager: true });
        const schema = userSchema();
        expect(resolveChecker(BUILTIN_CONTEXT, schema, true))
            .not.toBe(CLOSURE_BACKEND(BUILTIN_CONTEXT, schema, true));

        stop();

        const after = userSchema();
        expect(resolveChecker(BUILTIN_CONTEXT, after, true))
            .toBe(CLOSURE_BACKEND(BUILTIN_CONTEXT, after, true));
    });

    it('a stale disposer does not undo a later install', () => {
        const stale = installJit({ eager: true });
        install({ eager: true });

        stale();

        const schema = userSchema();
        expect(resolveChecker(BUILTIN_CONTEXT, schema, true))
            .not.toBe(CLOSURE_BACKEND(BUILTIN_CONTEXT, schema, true));
    });

    it('strict and loose compilations do not share warmth', () => {
        install({ threshold: 3 });
        const schema = userSchema();
        const payload = { id: 1, addr: { city: 'Rome' }, tags: ['a'], extra: true };

        for (let i = 0; i < 5; i++) safeParse(schema, structuredClone(payload), { strict: false });

        // Loose has warmed up; strict has seen this schema once at most, so it
        // must still be reporting the undeclared key.
        expect(safeParse(schema, structuredClone(payload), { strict: false }).success).toBe(true);
        expect(safeParse(schema, structuredClone(payload)).success).toBe(false);
    });
});
