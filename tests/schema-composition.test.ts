import { Typer } from '../src/Typer';

const typer = new Typer();

const userSchema = typer.schema({
    id: 'number',
    name: 'string',
    email: 'string',
    password: 'string',
});

describe('pick', () => {
    it('keeps only the listed keys', () => {
        const publicUser = typer.pick(userSchema, ['id', 'name']);

        expect(Object.keys(publicUser)).toEqual(['id', 'name']);
        expect(typer.safeParse(publicUser, { id: 1, name: 'ada' }).success).toBe(true);
    });

    it('leaves the source schema untouched', () => {
        typer.pick(userSchema, ['id']);
        expect(Object.keys(userSchema)).toEqual(['id', 'name', 'email', 'password']);
    });

    it('produces a schema that still rejects bad values', () => {
        const publicUser = typer.pick(userSchema, ['id', 'name']);
        const result = typer.safeParse(publicUser, { id: 'one', name: 'ada' });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues[0]).toMatchObject({ code: 'invalid_type', path: 'id' });
    });

    it('no longer requires the keys it dropped', () => {
        const publicUser = typer.pick(userSchema, ['id']);
        expect(typer.safeParse(publicUser, { id: 1 }).success).toBe(true);
    });
});

describe('omit', () => {
    it('drops the listed keys and keeps declaration order', () => {
        const createUser = typer.omit(userSchema, ['id', 'password']);
        expect(Object.keys(createUser)).toEqual(['name', 'email']);
    });

    it('leaves the source schema untouched', () => {
        typer.omit(userSchema, ['id']);
        expect(Object.keys(userSchema)).toHaveLength(4);
    });

    it('is the complement of pick', () => {
        expect(Object.keys(typer.omit(userSchema, ['id', 'name'])))
            .toEqual(Object.keys(typer.pick(userSchema, ['email', 'password'])));
    });
});

describe('merge', () => {
    it('combines both schemas', () => {
        const timestamped = typer.merge(userSchema, { createdAt: 'date' } as const);

        expect(Object.keys(timestamped)).toEqual(['id', 'name', 'email', 'password', 'createdAt']);
        expect(typer.safeParse(timestamped, {
            id: 1, name: 'ada', email: 'a@b.co', password: 'x', createdAt: new Date(),
        }).success).toBe(true);
    });

    it('lets the extension win on overlapping keys', () => {
        const overridden = typer.merge(userSchema, { id: 'string' } as const);

        expect(overridden.id).toBe('string');
        expect(typer.safeParse(typer.pick(overridden, ['id']), { id: 'abc' }).success).toBe(true);
    });

    it('leaves both sources untouched', () => {
        const extension = { createdAt: 'date' } as const;
        typer.merge(userSchema, extension);

        expect(Object.keys(userSchema)).toHaveLength(4);
        expect(Object.keys(extension)).toEqual(['createdAt']);
    });
});

describe('partial', () => {
    it('makes every key optional', () => {
        const patch = typer.partial(typer.omit(userSchema, ['id']));

        expect(typer.safeParse(patch, {}).success).toBe(true);
        expect(typer.safeParse(patch, { name: 'ada' }).success).toBe(true);
    });

    it('still validates the keys that are present', () => {
        const patch = typer.partial(userSchema);
        const result = typer.safeParse(patch, { name: 42 });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues[0]).toMatchObject({ code: 'invalid_type', path: 'name' });
    });

    it('makes only the listed keys optional', () => {
        const draft = typer.partial(userSchema, ['name', 'email']);

        expect(typer.safeParse(draft, { id: 1, password: 'x' }).success).toBe(true);
        expect(typer.safeParse(draft, { name: 'ada' }).success).toBe(false);
    });

    it('is idempotent on slots that are already optional', () => {
        const once = typer.partial({ email: 'string?' } as const);
        expect(once.email).toBe('string?');
        expect(typer.partial(once).email).toBe('string?');
    });

    it('accepts null for a type-string slot, matching the ? marker', () => {
        const patch = typer.partial({ name: 'string' } as const);
        expect(typer.safeParse(patch, { name: null }).success).toBe(true);
    });

    it('handles validator slots', () => {
        const patch = typer.partial({ email: typer.validators.isEmail });

        expect(typer.safeParse(patch, {}).success).toBe(true);
        expect(typer.safeParse(patch, { email: 'a@b.co' }).success).toBe(true);
        expect(typer.safeParse(patch, { email: 'nope' }).success).toBe(false);
    });

    it('handles nested schema slots', () => {
        const patch = typer.partial({ address: { city: 'string' } } as const);

        expect(typer.safeParse(patch, {}).success).toBe(true);
        expect(typer.safeParse(patch, { address: { city: 'london' } }).success).toBe(true);
        expect(typer.safeParse(patch, { address: { city: 42 } }).success).toBe(false);
    });

    it('handles array slots', () => {
        const patch = typer.partial({ tags: ['string'] } as const);

        expect(typer.safeParse(patch, {}).success).toBe(true);
        expect(typer.safeParse(patch, { tags: ['a', 'b'] }).success).toBe(true);
        expect(typer.safeParse(patch, { tags: [1] }).success).toBe(false);
    });

    it('handles array slots of nested schemas', () => {
        const patch = typer.partial({ items: [{ qty: 'number' }] } as const);

        expect(typer.safeParse(patch, {}).success).toBe(true);
        expect(typer.safeParse(patch, { items: [{ qty: 1 }] }).success).toBe(true);
        expect(typer.safeParse(patch, { items: [{ qty: 'one' }] }).success).toBe(false);
    });

    it('reports a made-optional nested slot as one issue at the slot path', () => {
        // The documented trade-off: those slots have no optional marker of
        // their own, so they are rebuilt as validators and lose per-field paths.
        const patch = typer.partial({ address: { city: 'string' } } as const);
        const result = typer.safeParse(patch, { address: { city: 42 } });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues[0]).toMatchObject({ code: 'custom', path: 'address' });
        expect(result.issues[0].message).toContain('city');
    });

    it('leaves the source schema untouched', () => {
        const source = { name: 'string' } as const;
        typer.partial(source);
        expect(source.name).toBe('string');
    });

    it('passes a malformed slot through, so the compiler still reports it', () => {
        const patch = typer.partial({ bad: 42 } as unknown as Record<string, unknown>);
        const result = typer.safeParse(patch as never, { bad: 1 });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues[0].code).toBe('invalid_schema');
    });
});

describe('composition chains', () => {
    it('derives CreateUserDto from UserDto without a second copy', () => {
        const createUser = typer.merge(
            typer.omit(userSchema, ['id']),
            { confirmPassword: 'string' } as const,
        );

        expect(Object.keys(createUser)).toEqual(['name', 'email', 'password', 'confirmPassword']);
        expect(typer.safeParse(createUser, {
            name: 'ada', email: 'a@b.co', password: 'x', confirmPassword: 'x',
        }).success).toBe(true);
    });

    it('derives a PATCH body from the same source', () => {
        const patchUser = typer.partial(typer.omit(userSchema, ['id', 'password']));

        expect(typer.safeParse(patchUser, { email: 'a@b.co' }).success).toBe(true);
        expect(typer.safeParse(patchUser, { email: 42 }).success).toBe(false);
    });

    it('composes with standard() and objectOf()', () => {
        const publicUser = typer.standard(typer.pick(userSchema, ['id', 'name']));
        const result = publicUser['~standard'].validate({ id: 1, name: 'ada' });

        expect(result).toEqual({ value: { id: 1, name: 'ada' } });
    });
});
