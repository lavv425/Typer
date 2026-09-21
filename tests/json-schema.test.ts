import { Typer, TyperError } from '../src/Typer';

const typer = new Typer();

/** Drops the `$schema` head so the assertions read as just the shape. */
const body = (schema: Record<string, unknown>, options = {}) => {
    const { $schema: _dialect, ...rest } = typer.toJSONSchema(schema as never, options);
    return rest;
};

describe('toJSONSchema — structure', () => {
    it('declares the 2020-12 dialect by default', () => {
        expect(typer.toJSONSchema({ id: 'number' }).$schema)
            .toBe('https://json-schema.org/draft/2020-12/schema');
    });

    it('omits the dialect when asked, for embedding in a larger document', () => {
        expect(typer.toJSONSchema({ id: 'number' }, { $schema: false })).not.toHaveProperty('$schema');
    });

    it('carries the document metadata through', () => {
        const doc = typer.toJSONSchema({ id: 'number' }, {
            id: 'https://example.com/user.json',
            title: 'User',
            description: 'A user',
        });

        expect(doc).toMatchObject({ $id: 'https://example.com/user.json', title: 'User', description: 'A user' });
    });

    it('maps the built-in aliases', () => {
        expect(body({
            s: 'string', n: 'number', b: 'boolean', nul: 'null',
            a: 'array', o: 'object', big: 'bigint', d: 'date', j: 'json',
        })).toMatchObject({
            type: 'object',
            properties: {
                s: { type: 'string' },
                n: { type: 'number' },
                b: { type: 'boolean' },
                nul: { type: 'null' },
                a: { type: 'array' },
                o: { type: 'object' },
                big: { type: 'integer' },
                // A Date is an ISO string by the time a JSON Schema sees it.
                d: { type: 'string', format: 'date-time' },
                j: { type: 'string', contentMediaType: 'application/json' },
            },
        });
    });

    it('moves optional keys out of required and widens them with null', () => {
        expect(body({ id: 'number', note: 'string?' })).toEqual({
            type: 'object',
            properties: { id: { type: 'number' }, note: { type: ['string', 'null'] } },
            required: ['id'],
        });
    });

    it('omits required entirely when every key is optional', () => {
        expect(body({ note: 'string?' })).not.toHaveProperty('required');
    });

    it('compacts a union of plain types', () => {
        expect(body({ role: 'string|number' }).properties).toEqual({ role: { type: ['string', 'number'] } });
    });

    it('uses anyOf when a union alternative is not a plain type', () => {
        expect(body({ when: 'date|number' }).properties).toEqual({
            when: { anyOf: [{ type: 'string', format: 'date-time' }, { type: 'number' }] },
        });
    });

    it('adds null to an optional union of plain types', () => {
        expect(body({ role: 'string|number?' }).properties).toEqual({
            role: { type: ['string', 'number', 'null'] },
        });
    });

    it('falls back to anyOf when the optional slot is not a plain type', () => {
        expect(body({ when: 'date?' }).properties).toEqual({
            when: { anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] },
        });
    });

    it('emits {} for a malformed slot', () => {
        expect(body({ bad: 42 as unknown as string }).properties).toEqual({ bad: {} });
    });

    it('emits {} for an array slot that is not exactly one element', () => {
        expect(body({ a: [] as unknown as string[], b: ['string', 'number'] as unknown as string[] }).properties)
            .toEqual({ a: {}, b: {} });
    });

    it('converts array slots to items', () => {
        expect(body({ tags: ['string'] }).properties).toEqual({
            tags: { type: 'array', items: { type: 'string' } },
        });
    });

    it('recurses into nested objects', () => {
        expect(body({ address: { city: 'string', zip: 'string?' } }).properties).toEqual({
            address: {
                type: 'object',
                properties: { city: { type: 'string' }, zip: { type: ['string', 'null'] } },
                required: ['city'],
            },
        });
    });

    it('recurses into arrays of nested objects', () => {
        expect(body({ items: [{ qty: 'number' }] }).properties).toEqual({
            items: {
                type: 'array',
                items: { type: 'object', properties: { qty: { type: 'number' } }, required: ['qty'] },
            },
        });
    });

    it('emits additionalProperties: false in strict mode', () => {
        expect(body({ id: 'number' }, { strict: true })).toMatchObject({ additionalProperties: false });
        expect(body({ id: 'number' })).not.toHaveProperty('additionalProperties');
    });
});

describe('toJSONSchema — validators describe themselves', () => {
    it('emits formats for the built-in format validators', () => {
        expect(body({
            email: typer.validators.isEmail,
            url: typer.validators.isURL,
            uuid: typer.validators.isUUID,
            when: typer.validators.isISODate,
            ip: typer.validators.isIPv4,
        }).properties).toEqual({
            email: { type: 'string', format: 'email' },
            url: { type: 'string', format: 'uri' },
            uuid: { type: 'string', format: 'uuid' },
            when: { type: 'string', format: 'date-time' },
            ip: { type: 'string', format: 'ipv4' },
        });
    });

    it('emits numeric bounds for the bounded validators', () => {
        expect(body({ port: typer.validators.isPort, count: typer.validators.isPositiveInteger }).properties).toEqual({
            port: { type: 'integer', minimum: 1, maximum: 65535 },
            count: { type: 'integer', minimum: 0 },
        });
    });

    it('describes literal() as an enum', () => {
        expect(body({ role: typer.literal('admin', 'user') }).properties).toEqual({
            role: { enum: ['admin', 'user'] },
        });
    });

    it('describes arrayOf, including its length bounds', () => {
        expect(body({ tags: typer.arrayOf(typer.validators.asString, { min: 1, max: 10 }) }).properties).toEqual({
            tags: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 10 },
        });
    });

    it('describes record() as additionalProperties', () => {
        expect(body({ scores: typer.record(typer.validators.asNumber) }).properties).toEqual({
            scores: { type: 'object', additionalProperties: { type: 'number' } },
        });
    });

    it('describes tuple() with prefixItems and a fixed length', () => {
        expect(body({ point: typer.tuple([typer.validators.asNumber, typer.validators.asNumber]) }).properties).toEqual({
            point: {
                type: 'array',
                prefixItems: [{ type: 'number' }, { type: 'number' }],
                minItems: 2,
                maxItems: 2,
            },
        });
    });

    it('describes objectOf() as the object it validates', () => {
        expect(body({ user: typer.objectOf({ id: 'number' }) }).properties).toEqual({
            user: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] },
        });
    });

    it('describes nullable() by widening the inner fragment', () => {
        expect(body({ note: typer.nullable(typer.validators.asString) }).properties).toEqual({
            note: { type: ['string', 'null'] },
        });
    });

    it('describes optional() by dropping the key from required', () => {
        const doc = body({ id: 'number', note: typer.optional(typer.validators.asString) });

        expect(doc.required).toEqual(['id']);
        expect((doc.properties as Record<string, unknown>).note).toEqual({ type: 'string' });
    });

    it('describes withDefault() with the default value', () => {
        const doc = body({ limit: typer.withDefault(typer.validators.asNumber, 10) });

        expect(doc).not.toHaveProperty('required');
        expect((doc.properties as Record<string, unknown>).limit).toEqual({ type: 'number', default: 10 });
    });

    it('omits the default when it comes from a factory, which has no single value', () => {
        const doc = body({ tags: typer.withDefault(typer.validators.asArray, () => []) });
        expect((doc.properties as Record<string, unknown>).tags).toEqual({ type: 'array' });
    });

    it('describes the coercions by the wire shape they accept', () => {
        expect(body({ page: typer.coerce.number, on: typer.coerce.boolean }).properties).toEqual({
            page: { type: ['number', 'string'] },
            on: { type: ['boolean', 'string', 'number'] },
        });
    });

    it('describes discriminatedUnion as a discriminating oneOf', () => {
        const shape = typer.discriminatedUnion('kind', {
            circle: { radius: 'number' },
            square: { side: 'number' },
        });

        expect(body({ shape }).properties).toEqual({
            shape: {
                discriminator: { propertyName: 'kind' },
                oneOf: [
                    {
                        type: 'object',
                        properties: { kind: { const: 'circle' }, radius: { type: 'number' } },
                        required: ['kind', 'radius'],
                    },
                    {
                        type: 'object',
                        properties: { kind: { const: 'square' }, side: { type: 'number' } },
                        required: ['kind', 'side'],
                    },
                ],
            },
        });
    });

    it('never leaks the internal optional marker into the document', () => {
        const doc = typer.toJSONSchema({
            a: typer.optional(typer.validators.asString),
            b: typer.withDefault(typer.validators.asNumber, 1),
        });

        expect(JSON.stringify(doc)).not.toContain('$typerOptional');
    });
});

describe('toJSONSchema — slots with no equivalent', () => {
    it('emits {} for a caller-written validator', () => {
        expect(body({ weird: (v: unknown) => v }).properties).toEqual({ weird: {} });
    });

    it('emits {} for aliases JSON cannot carry', () => {
        expect(body({ f: 'function', m: 'map', sym: 'symbol' }).properties).toEqual({ f: {}, m: {}, sym: {} });
    });

    it('emits {} for an alias registered at runtime', () => {
        const extended = new Typer().extend('positive', (v): number => {
            if (typeof v !== 'number' || v <= 0) throw new TypeError('Must be positive');
            return v;
        });

        expect(extended.toJSONSchema({ qty: 'positive' }).properties).toEqual({ qty: {} });
    });

    it('throws on request, naming every offending path', () => {
        expect(() => typer.toJSONSchema(
            { good: 'string', bad: 'function', nested: { alsoBad: 'symbol' } },
            { unrepresentable: 'throw' },
        )).toThrow(TyperError);

        try {
            typer.toJSONSchema({ bad: 'function', nested: { alsoBad: 'symbol' } }, { unrepresentable: 'throw' });
        } catch (e) {
            expect((e as TyperError).issues.map((i) => i.path)).toEqual(['bad', 'nested.alsoBad']);
            return;
        }
        throw new Error('expected a throw');
    });

    it('does not throw when everything is representable', () => {
        expect(() => typer.toJSONSchema({ id: 'number' }, { unrepresentable: 'throw' })).not.toThrow();
    });
});

describe('toJSONSchema — composition', () => {
    it('follows a derived schema', () => {
        const userSchema = typer.schema({ id: 'number', name: 'string', password: 'string' });
        const publicUser = typer.pick(userSchema, ['id', 'name']);

        expect(body(publicUser)).toEqual({
            type: 'object',
            properties: { id: { type: 'number' }, name: { type: 'string' } },
            required: ['id', 'name'],
        });
    });

    it('follows partial()', () => {
        const patch = typer.partial(typer.schema({ id: 'number', name: 'string' }));

        expect(body(patch)).toEqual({
            type: 'object',
            properties: { id: { type: ['number', 'null'] }, name: { type: ['string', 'null'] } },
        });
    });
});
