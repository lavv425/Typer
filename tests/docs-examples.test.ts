import { parse, safeParse, schema, createTyper, createRegistry, TyperError } from '../src/core';
import type { Infer, InferWith } from '../src/core';
import { isEmail, isPort, isString, asString, asNumber, isLength, isInRange } from '../src/validators';
import { arrayOf, objectOf, optional, literal, record, tuple, transform, lazy, discriminatedUnion, standard } from '../src/combinators';
import { parseAsync, safeParseAsync, asyncRefine } from '../src/async';
import { compile, canGenerate } from '../src/jit';
import { Typer } from '../src/Typer';
import type { Validator } from '../src/Types/Typer';
import { issuesOf, validateSync } from './helpers/standard';

/**
 * Every code block in README.md and guides/ that can be executed, executed.
 *
 * Documentation that does not compile is worse than none: the 4.x README
 * carried five examples calling methods that had been removed, and nothing
 * caught it.
 */
const typer = new Typer();
const payload: unknown = { id: 1, email: 'a@b.co', name: 'Ada', tags: ['x'] };

describe('README', () => {
    it('quick start', () => {
        const userSchema = schema({
            id: 'number',
            email: isEmail,
            name: 'string(2,50)',
            note: 'string?',
            tags: ['string'],
        });
        type User = Infer<typeof userSchema>;

        const user: User = parse(userSchema, payload);
        expect(user.id).toBe(1);

        const result = safeParse(userSchema, { id: 1, email: 'a@b.co', name: 'A', tags: [] });
        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues[0]).toMatchObject({ code: 'too_small', path: 'name', minimum: 2 });
    });

    it('opening example', () => {
        const user = parse({ id: 'number', email: 'string', note: 'string?' },
            { id: 1, email: 'a@b.co' });
        expect(user).toEqual({ id: 1, email: 'a@b.co' });
    });

    it('composing entry points', () => {
        expect(parse({ contacts: arrayOf(objectOf({ email: isEmail })) },
            { contacts: [{ email: 'a@b.co' }] })).toBeDefined();
    });
});

describe('guides/schemas', () => {
    it('the four slot kinds', () => {
        const orderSchema = schema({
            id: 'number',
            tags: ['string'],
            address: { city: 'string' },
            email: isEmail,
        });
        expect(parse(orderSchema, { id: 1, tags: [], address: { city: 'Rome' }, email: 'a@b.co' })).toBeDefined();
    });

    it('type string table', () => {
        expect(safeParse({ v: 'string' }, { v: 'x' }).success).toBe(true);
        expect(safeParse({ v: 'string?' }, {}).success).toBe(true);
        expect(safeParse({ v: 'string|number' }, { v: 1 }).success).toBe(true);
        expect(safeParse({ v: 'string(3,50)' }, { v: 'abc' }).success).toBe(true);
        expect(safeParse({ v: 'number(1,)' }, { v: 1 }).success).toBe(true);
        expect(safeParse({ v: 'array(,10)' }, { v: [] }).success).toBe(true);
        // Trimming and case folding are a runtime courtesy; the type layer
        // only knows the canonical spellings, so this is a compile error by
        // design and stays one.
        // @ts-expect-error -- ' STRING ' is not a KnownAlias
        expect(safeParse({ v: ' STRING ' }, { v: 'x' }).success).toBe(true);
    });

    it('optional vs optional()', () => {
        expect(safeParse({ note: optional((v: unknown) => String(v)) }, {}).success).toBe(true);
    });

    it('bounds report codes', () => {
        const r = safeParse({ name: 'string(3,)' }, { name: 'ab' });
        expect(r.success).toBe(false);
        if (r.success) return;
        expect(r.issues[0]).toMatchObject({ code: 'too_small', path: 'name', minimum: 3 });
        expect(r.issues[0].message).toBe('Expected "name" to have length >= 3, got 2');
    });

    it('malformed bounds are reported', () => {
        for (const v of ['string(a,b)', 'string(1,2,3)', 'string(,)']) {
            expect(safeParse({ v } as never, { v: 'abc' }).success).toBe(false);
        }
    });

    it('strict default and opt-out', () => {
        expect(() => parse({ id: 'number' }, { id: 1, role: 'admin' })).toThrow();
        expect(parse({ id: 'number' }, { id: 1, role: 'admin' }, { strict: false })).toBeDefined();
    });

    it('dangerous keys are stripped, not reported', () => {
        const p = JSON.parse('{"id":1,"__proto__":{"x":1}}');
        expect(safeParse({ id: 'number' }, p).success).toBe(true);
        expect(Object.keys(p)).toEqual(['id']);
    });

    it('composition', () => {
        const userSchema = typer.schema({ id: 'number', name: 'string', email: 'string' });
        expect(Object.keys(typer.pick(userSchema, ['id', 'name']))).toEqual(['id', 'name']);
        expect(Object.keys(typer.omit(userSchema, ['id']))).toEqual(['name', 'email']);
        expect(safeParse(typer.partial(typer.omit(userSchema, ['id'])) as never, {}).success).toBe(true);
        expect(Object.keys(typer.merge(userSchema, { createdAt: 'date' } as const))).toContain('createdAt');
    });

    it('createTyper', () => {
        const { parse: p, schema: s } = createTyper({
            positive: (v: unknown): number => {
                if (typeof v !== 'number' || v <= 0) throw new TypeError('Must be positive');
                return v;
            },
        });
        expect(p(s({ qty: 'positive' }), { qty: 2 })).toEqual({ qty: 2 });
    });
});

describe('guides/errors', () => {
    it('structured issues', () => {
        const result = safeParse({ id: 'number', addr: { city: 'string' } }, { id: 'nope', addr: {} });
        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues.map((i) => [i.path, i.code])).toEqual([
            ['id', 'invalid_type'],
            ['addr.city', 'missing_key'],
        ]);
    });

    it('constraint codes survive into a schema', () => {
        const result = safeParse({
            name: (v: unknown) => isLength({ min: 3, max: 50 }, v),
            pin: (v: unknown) => isInRange(1000, 9999, v),
        }, { name: 'ab', pin: 42 });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues.map((i) => i.code)).toEqual(['too_small', 'too_small']);
    });

    it('TyperError and flatten', () => {
        try {
            parse({ addr: { city: 'string' } }, { addr: { city: 1 } });
        } catch (e) {
            expect(e).toBeInstanceOf(TyperError);
            expect(Object.keys((e as TyperError).flatten())).toEqual(['addr.city']);
            return;
        }
        throw new Error('expected a throw');
    });

    it('isInRange keeps the value out of the message', () => {
        try {
            isInRange(1000, 9999, 4242424);
        } catch (e) {
            expect((e as Error).message).toBe('value must be between 1000 and 9999');
            return;
        }
        throw new Error('expected a throw');
    });
});

describe('guides/validators', () => {
    it('slots into a schema', () => {
        expect(parse({ email: isEmail, port: isPort }, { email: 'a@b.co', port: 8080 })).toBeDefined();
    });

    it('guards narrow, as* assert', () => {
        const value: unknown = 'x';
        expect(isString(value) ? value.toUpperCase() : null).toBe('X');
        expect(asString('x')).toBe('x');
    });

    it('coercion table', () => {
        const query: Record<string, unknown> = { page: '2', archived: 'false', since: '2026-01-01' };
        typer.parse({ page: typer.coerce.number, archived: typer.coerce.boolean, since: typer.coerce.date }, query);
        expect(query.page).toBe(2);
        expect(query.archived).toBe(false);
        expect(query.since).toBeInstanceOf(Date);

        for (const bad of ['', '   ', null, [], 'abc']) {
            expect(() => typer.coerce.number(bad)).toThrow();
        }
        expect(typer.coerce.boolean('false')).toBe(false);
        expect(typer.coerce.boolean('0')).toBe(false);
    });
});

describe('guides/combinators', () => {
    it('collections', () => {
        expect(arrayOf(asNumber, { min: 1, max: 10 })([1])).toEqual([1]);
        expect(record(asNumber)({ a: 1 })).toEqual({ a: 1 });
        expect(tuple([asNumber, asString])([1, 'a'])).toEqual([1, 'a']);
    });

    it('objectOf options', () => {
        expect(objectOf({ id: 'number' })({ id: 1 })).toEqual({ id: 1 });
        expect(objectOf({ id: 'number' }, { strict: false })({ id: 1, x: 2 })).toBeDefined();
        const registry = createRegistry({ positive: (v: unknown): number => Number(v) });
        expect(objectOf({ qty: 'positive' }, { registry })({ qty: 1 })).toEqual({ qty: 1 });
    });

    it('discriminatedUnion', () => {
        const event = discriminatedUnion('type', {
            created: { id: 'string', at: 'date' },
            renamed: { id: 'string', name: 'string' },
            deleted: { id: 'string' },
        });
        expect(event({ type: 'deleted', id: 'x' })).toBeDefined();

        const r = safeParse(event, { type: 'renamed', id: 'x', name: 42 });
        expect(r.success).toBe(false);
        if (r.success) return;
        expect(r.issues).toEqual([expect.objectContaining({ code: 'invalid_type', path: 'name' })]);
    });

    it('transform replaces the value in a slot', () => {
        const p: Record<string, unknown> = { slug: '  Hello  ' };
        parse({ slug: transform(asString, (s) => s.trim()) }, p);
        expect(p.slug).toBe('Hello');
    });

    it('lazy makes recursion expressible', () => {
        type Node = { name: string; children?: Node[] };
        const node: Validator<Node> = lazy(() => objectOf({
            name: 'string',
            children: optional(arrayOf(node)),
        }) as unknown as Validator<Node>);

        expect(node({ name: 'root', children: [{ name: 'leaf' }] })).toBeDefined();
    });

    it('literal', () => {
        expect(literal('a', 'b')('a')).toBe('a');
    });

    it('createRegistry and InferWith', () => {
        const registry = createRegistry({
            positive: (v: unknown): number => {
                if (typeof v !== 'number' || v <= 0) throw new TypeError('Must be positive');
                return v;
            },
        });
        const orderSchema = schema({ qty: 'positive' }, { registry });
        type Order = InferWith<typeof orderSchema, typeof registry>;
        const order: Order = parse(orderSchema, { qty: 2 }, { registry });
        expect(order.qty).toBe(2);
    });
});

describe('guides/standard-schema', () => {
    it('wraps and validates', () => {
        const userSchema = standard({ id: 'number', email: 'string' });
        expect(userSchema({ id: 1, email: 'a@b.co' })).toBeDefined();

        const issues = issuesOf(validateSync(userSchema, { id: 'one', email: 'a@b.co' }));
        expect(issues[0]).toMatchObject({ code: 'invalid_type', path: ['id'] });
    });

    it('composes like any validator', () => {
        expect(arrayOf(standard({ id: 'number' }))([{ id: 1 }])).toBeDefined();
    });
});

describe('guides/json-schema', () => {
    it('the opening document', () => {
        const doc = typer.toJSONSchema({ id: 'number', email: isEmail, note: 'string?' } as never);
        expect(doc).toMatchObject({
            type: 'object',
            properties: {
                id: { type: 'number' },
                email: { type: 'string', format: 'email' },
                note: { type: ['string', 'null'] },
            },
            required: ['id', 'email'],
            additionalProperties: false,
        });
    });

    it('bound keywords follow what is measured', () => {
        const props = (s: string) => (typer.toJSONSchema({ v: s } as never).properties as Record<string, unknown>).v;
        expect(props('string(3,50)')).toEqual({ type: 'string', minLength: 3, maxLength: 50 });
        expect(props('array(1,10)')).toEqual({ type: 'array', minItems: 1, maxItems: 10 });
        expect(props('number(1000,9999)')).toEqual({ type: 'number', minimum: 1000, maximum: 9999 });
        expect(props('date')).toEqual({ type: 'string', format: 'date-time' });
    });

    it('throws on request for unrepresentable slots', () => {
        expect(() => typer.toJSONSchema({ s: 'symbol' } as never, { unrepresentable: 'throw' })).toThrow();
    });
});

describe('guides/async', () => {
    const exists = async ({ email }: { email: string }) => email === 'taken@b.co';

    const userSchema = {
        email: asyncRefine(isEmail, async (email: string) => !(await exists({ email })), 'email already registered'),
    };

    it('the opening example', async () => {
        await expect(parseAsync(userSchema, { email: 'free@b.co' })).resolves.toBeDefined();
        expect((await safeParseAsync(userSchema, { email: 'taken@b.co' })).success).toBe(false);
    });

    it('the synchronous path refuses, naming the key', () => {
        expect(() => parse(userSchema, { email: 'free@b.co' })).toThrow('requires parseAsync');
    });

    it('async slots inside arrays report indexed paths', async () => {
        const checkToken = asyncRefine((v: unknown) => String(v), async () => false, 'bad token');
        const r = await safeParseAsync({ rows: [{ token: checkToken }] }, { rows: [{ token: 'a' }, { token: 'b' }] });

        expect(r.success).toBe(false);
        if (r.success) return;
        expect(r.issues.map((i) => i.path).sort()).toEqual(['rows[0].token', 'rows[1].token']);
    });
});

describe('guides/class', () => {
    it('extend chains and infers', () => {
        const extended = new Typer().extend('positive', (v): number => {
            if (typeof v !== 'number' || v <= 0) throw new TypeError('Must be positive');
            return v;
        });
        expect(extended.parse(extended.schema({ qty: 'positive' }), { qty: 2 })).toEqual({ qty: 2 });
    });

    it('checkStructure, strict by default', () => {
        const dynamic: Record<string, unknown> = { id: 'number' };
        expect(typer.checkStructure(dynamic, { id: 1 }).isValid).toBe(true);
        expect(typer.checkStructure(dynamic, { id: 1, x: 2 }).isValid).toBe(false);
        expect(typer.checkStructure(dynamic, { id: 1, x: 2 }, '', false).isValid).toBe(true);
    });

    it('typer.validators can be passed as values', () => {
        expect(typer.parse(typer.schema({ id: typer.validators.isPositiveInteger }), { id: 5 })).toBeDefined();
    });

    it('instances are independent', () => {
        const a = new Typer();
        const b = new Typer();
        a.registerType('custom', (v: unknown) => v);
        expect(a.listTypes()).toContain('custom');
        expect(b.listTypes()).not.toContain('custom');
    });

    it('the removed methods are gone', () => {
        expect((typer as unknown as Record<string, unknown>).expect).toBeUndefined();
        expect((typer as unknown as Record<string, unknown>).validate).toBeUndefined();
        expect((typer as unknown as Record<string, unknown>).assert).toBeUndefined();
    });
});

describe('guides/jit.md', () => {
    const userSchema = { id: 'number', email: 'string', note: 'string?' } as const;

    it('compile parses and safeParses like the free API', () => {
        const user = compile(userSchema);

        expect(user.parse({ id: 1, email: 'a@b.co' })).toBeDefined();
        expect(user.safeParse({ id: 1, email: 'a@b.co' }).success).toBe(true);
        expect(user.safeParse({ id: 'x', email: 'a@b.co' }).success).toBe(false);
    });

    it('reports whether it is generating', () => {
        const user = compile(userSchema);
        expect(user.generated).toBe(true);
        expect(canGenerate()).toBe(true);
    });

    it('takes the same registry and strictness options', () => {
        const registry = createRegistry({
            positive: (v: unknown): number => {
                if (typeof v !== 'number' || v <= 0) throw new TypeError('Must be positive');
                return v;
            },
        });

        const order = compile({ qty: 'positive' }, { registry });
        expect(order.safeParse({ qty: 2 }).success).toBe(true);
        expect(order.safeParse({ qty: -1 }).success).toBe(false);

        expect(compile({ id: 'number' }).safeParse({ id: 1, x: 2 }).success).toBe(false);
        expect(compile({ id: 'number' }, { strict: false }).safeParse({ id: 1, x: 2 }).success).toBe(true);
    });
});
