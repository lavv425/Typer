import { Typer } from '../src/Typer';

describe('registerType invalidates the strict-mode compile cache', () => {
    it('recompiles a schema already compiled in strict mode', () => {
        const typer = new Typer();
        const schema = { qty: 'measure' } as unknown as Record<string, unknown>;

        // Compile in strict mode while the alias is still unknown.
        const before = typer.safeParse(typer.objectOf(schema as never, { strict: true }), { qty: 1 });
        expect(before.success).toBe(false);
        if (!before.success) expect(before.issues[0].code).toBe('unknown_type');

        typer.registerType('measure', (v: unknown) => {
            if (typeof v !== 'number') throw new TypeError('must be a number');
            return v;
        });

        // The same schema object must now be recompiled against the new alias.
        const after = typer.safeParse(typer.objectOf(schema as never, { strict: true }), { qty: 1 });
        expect(after.success).toBe(true);
    });
});
