import { parse, safeParse, createRegistry } from '../src/core';
import { parseAsync, safeParseAsync, asyncRefine } from '../src/async';
import { isEmail } from '../src/validators';
import { TyperError } from '../src/Typer';

const taken = new Set(['taken@b.co']);
const uniqueEmail = asyncRefine(
    isEmail,
    async (e: string) => !taken.has(e),
    'email already registered',
);

describe('parseAsync', () => {
    it('accepts a value that passes the awaited check', async () => {
        await expect(parseAsync({ email: uniqueEmail }, { email: 'free@b.co' }))
            .resolves.toEqual({ email: 'free@b.co' });
    });

    it('rejects one that fails it, at the right path', async () => {
        const result = await safeParseAsync({ email: uniqueEmail }, { email: 'taken@b.co' });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues[0]).toMatchObject({ path: 'email', code: 'custom' });
        expect(result.issues[0].message).toContain('email already registered');
    });

    it('runs the synchronous validator first, so the async check sees a valid value', async () => {
        const result = await safeParseAsync({ email: uniqueEmail }, { email: 'not-an-email' });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues[0].message).toContain('must be a valid email address');
    });

    it('still validates the synchronous slots around it', async () => {
        const result = await safeParseAsync(
            { id: 'number', email: uniqueEmail },
            { id: 'x', email: 'free@b.co' },
        );

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues.map((i) => i.path)).toEqual(['id']);
    });

    it('throws a TyperError from parseAsync', async () => {
        await expect(parseAsync({ email: uniqueEmail }, { email: 'taken@b.co' })).rejects.toThrow(TyperError);
    });

    it('works on a schema with no async slots at all', async () => {
        await expect(parseAsync({ id: 'number' }, { id: 1 })).resolves.toEqual({ id: 1 });
        expect((await safeParseAsync({ id: 'number' }, { id: 'x' })).success).toBe(false);
    });

    it('is strict by default, like its synchronous counterpart', async () => {
        expect((await safeParseAsync({ id: 'number' }, { id: 1, extra: true })).success).toBe(false);
        expect((await safeParseAsync({ id: 'number' }, { id: 1, extra: true }, { strict: false })).success).toBe(true);
    });

    it('honours a registry', async () => {
        const registry = createRegistry({ positive: (v: unknown): number => Number(v) });
        expect((await safeParseAsync({ qty: 'positive' }, { qty: 1 }, { registry })).success).toBe(true);
    });

    it('handles async slots nested in objects', async () => {
        const result = await safeParseAsync(
            { user: { email: uniqueEmail } },
            { user: { email: 'taken@b.co' } },
        );

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues[0].path).toBe('user.email');
    });

    it('handles async slots inside arrays', async () => {
        const result = await safeParseAsync(
            { emails: [uniqueEmail] },
            { emails: ['free@b.co', 'taken@b.co'] },
        );

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues[0].path).toBe('emails[1]');
    });

    it('starts the awaited checks together rather than in turn', async () => {
        let inFlight = 0;
        let peak = 0;
        const slow = asyncRefine(
            (v: unknown) => String(v),
            async () => {
                inFlight += 1;
                peak = Math.max(peak, inFlight);
                await new Promise((r) => setTimeout(r, 20));
                inFlight -= 1;
                return true;
            },
            'never fails',
        );

        await parseAsync({ a: slow, b: slow, c: slow }, { a: '1', b: '2', c: '3' });
        expect(peak).toBe(3);
    });

    it('writes the resolved value back, like a synchronous slot', async () => {
        const upper = asyncRefine((v: unknown) => String(v).toUpperCase(), async () => true, 'n/a');
        const payload: Record<string, unknown> = { code: 'abc' };

        await parseAsync({ code: upper }, payload);
        expect(payload.code).toBe('ABC');
    });
});

describe('the synchronous path refuses an async schema', () => {
    it('reports the offending key rather than validating nothing', () => {
        const result = safeParse({ email: uniqueEmail }, { email: 'free@b.co' });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues[0].path).toBe('email');
        expect(result.issues[0].message).toContain('requires parseAsync');
    });

    it('throws from parse', () => {
        expect(() => parse({ email: uniqueEmail }, { email: 'free@b.co' })).toThrow('requires parseAsync');
    });
});
