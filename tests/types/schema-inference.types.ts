/**
 * Type-level test suite. Run with `npm run test:types`.
 *
 * Two kinds of assertion are used:
 *  - `Expect<Equal<A, B>>` — the inferred type is exactly what we claim.
 *  - `@ts-expect-error`    — the line MUST fail to compile; tsc reports an
 *                            "Unused '@ts-expect-error' directive" if it does not.
 */
import { Typer } from '../../src/Typer';
import type { Infer, ValidationIssue } from '../../src/Types/Typer';
import type { Equal, Expect } from './assert';

const typer = new Typer();

// ---------------------------------------------------------------------------
//  Infer: primitives, unions, optionality
// ---------------------------------------------------------------------------

const userSchema = typer.schema({
    id: 'number',
    name: 'string',
    email: 'string?',
});

type User = Infer<typeof userSchema>;
type _User = Expect<Equal<User, { id: number; name: string; email?: string | null }>>;

const unionSchema = typer.schema({ role: 'string|number', flag: 'boolean|null' });
type UnionShape = Infer<typeof unionSchema>;
type _Union = Expect<Equal<UnionShape, { role: string | number; flag: boolean | null }>>;

// Whitespace around alternatives is trimmed, at runtime and at the type level.
const spacedSchema = typer.schema({ role: ' string | number ' });
type Spaced = Infer<typeof spacedSchema>;
type _Spaced = Expect<Equal<Spaced, { role: string | number }>>;

const optionalUnionSchema = typer.schema({ role: 'string|number?' });
type OptionalUnion = Infer<typeof optionalUnionSchema>;
type _OptionalUnion = Expect<Equal<OptionalUnion, { role?: string | number | null }>>;

// ---------------------------------------------------------------------------
//  Infer: arrays and nesting
// ---------------------------------------------------------------------------

const nestedSchema = typer.schema({
    tags: ['string'],
    address: { city: 'string', zip: 'string?' },
    people: [{ name: 'string' }],
});

type Nested = Infer<typeof nestedSchema>;
type _Nested = Expect<Equal<Nested, {
    tags: string[];
    address: { city: string; zip?: string | null };
    people: { name: string }[];
}>>;

// ---------------------------------------------------------------------------
//  Infer: validator slots
// ---------------------------------------------------------------------------

const validatorSchema = typer.schema({
    id: typer.isPositiveInteger,
    nickname: typer.optional((v) => typer.asString(v)),
    note: typer.nullable((v) => typer.asString(v)),
});

type WithValidators = Infer<typeof validatorSchema>;
// `optional()` widens to `| undefined`, which makes the key optional.
type _WithValidators = Expect<Equal<WithValidators, {
    id: number;
    note: string | null;
    nickname?: string | undefined;
}>>;

// ---------------------------------------------------------------------------
//  parse / safeParse return types
// ---------------------------------------------------------------------------

declare const payload: unknown;

const parsed = typer.parse(userSchema, payload);
type _Parsed = Expect<Equal<typeof parsed, User>>;

const parsedInline = typer.parse({ id: 'number', name: 'string' }, payload);
type _ParsedInline = Expect<Equal<typeof parsedInline, { id: number; name: string }>>;

const alias = typer.isType('string', payload);
type _Alias = Expect<Equal<typeof alias, string>>;

const aliasUnion = typer.isType(['string', 'number'], payload);
type _AliasUnion = Expect<Equal<typeof aliasUnion, string | number>>;

const safe = typer.safeParse(userSchema, payload);
if (safe.success) {
    type _SafeData = Expect<Equal<typeof safe.data, User>>;
} else {
    type _SafeIssues = Expect<Equal<typeof safe.issues, ValidationIssue[]>>;
    // `error` stays a TypeError so existing `instanceof TypeError` code is fine.
    const err: TypeError = safe.error;
    void err;
}

// Type guards narrow.
if (typer.is(payload, 'string')) {
    type _Narrowed = Expect<Equal<typeof payload, string>>;
}

// ---------------------------------------------------------------------------
//  extend(): custom aliases become known to schemas and to Infer
// ---------------------------------------------------------------------------

const extended = new Typer().extend('positive', (v): number => {
    if (typeof v !== 'number' || v <= 0) throw new TypeError('Must be positive');
    return v;
});

const orderSchema = extended.schema({ qty: 'positive', sku: 'string' });
type Order = Infer<typeof orderSchema, { positive: number }>;
type _Order = Expect<Equal<Order, { qty: number; sku: string }>>;

// Chaining keeps every alias.
const twice = new Typer()
    .extend('positive', (v): number => v as number)
    .extend('slug', (v): string => v as string);
twice.schema({ a: 'positive', b: 'slug' });

// ---------------------------------------------------------------------------
//  Combinators produce precise types
// ---------------------------------------------------------------------------

const role = typer.literal('admin', 'user', 'guest');
type _Role = Expect<Equal<ReturnType<typeof role>, 'admin' | 'user' | 'guest'>>;

const mixedLiteral = typer.literal(1, true, null);
type _MixedLiteral = Expect<Equal<ReturnType<typeof mixedLiteral>, 1 | true | null>>;

const tags = typer.arrayOf((v) => typer.asString(v));
type _Tags = Expect<Equal<ReturnType<typeof tags>, string[]>>;

const scores = typer.record((v) => typer.asNumber(v));
type _Scores = Expect<Equal<ReturnType<typeof scores>, Record<string, number>>>;

const point = typer.tuple([(v) => typer.asNumber(v), (v) => typer.asString(v)]);
type _Point = Expect<Equal<ReturnType<typeof point>, [number, string]>>;

const trimmed = typer.transform((v) => typer.asString(v), (s) => s.length);
type _Trimmed = Expect<Equal<ReturnType<typeof trimmed>, number>>;

const even = typer.refine((v) => typer.asNumber(v), (n) => n % 2 === 0, 'must be even');
type _Even = Expect<Equal<ReturnType<typeof even>, number>>;

const limit = typer.withDefault((v) => typer.asNumber(v), 10);
type _Limit = Expect<Equal<ReturnType<typeof limit>, number>>;

const when = typer.instanceOf(Date);
type _When = Expect<Equal<ReturnType<typeof when>, Date>>;

const userObject = typer.objectOf({ id: 'number', name: 'string', email: 'string?' });
type _UserObject = Expect<Equal<ReturnType<typeof userObject>, User>>;

// Combinators nest, and the nesting is reflected in the type.
const userList = typer.arrayOf(typer.objectOf({ id: 'number' }));
type _UserList = Expect<Equal<ReturnType<typeof userList>, { id: number }[]>>;

// objectOf() is alias-checked exactly like schema().
// @ts-expect-error - 'nubmer' is not a known alias
typer.objectOf({ id: 'nubmer' });

// ---------------------------------------------------------------------------
//  Standard Schema
// ---------------------------------------------------------------------------

// A standard schema stays a callable validator, and keeps its inferred output.
const standardUser = typer.standard({ id: 'number', name: 'string', email: 'string?' });
type _StandardUser = Expect<Equal<ReturnType<typeof standardUser>, User>>;
type _StandardUserVersion = Expect<Equal<(typeof standardUser)['~standard']['version'], 1>>;

// objectOf() carries the contract too, so it can be handed to a framework as-is.
type _ObjectOfIsStandard = Expect<Equal<(typeof userObject)['~standard']['vendor'], string>>;

// Aliases and validators are wrapped with their own type preserved.
const standardAlias = typer.standard('number');
type _StandardAlias = Expect<Equal<ReturnType<typeof standardAlias>, number>>;

const standardValidator = typer.standard(typer.arrayOf((v) => typer.asString(v)));
type _StandardValidator = Expect<Equal<ReturnType<typeof standardValidator>, string[]>>;

// standard() is alias-checked exactly like schema().
// @ts-expect-error - 'nubmer' is not a known alias
typer.standard({ id: 'nubmer' });

// ---------------------------------------------------------------------------
//  Dynamically built schemas must still be accepted
// ---------------------------------------------------------------------------

declare const dynamicSchema: Record<string, string>;
typer.checkStructure(dynamicSchema, {});

// ---------------------------------------------------------------------------
//  Rejections — each line MUST fail to compile
// ---------------------------------------------------------------------------

// @ts-expect-error - 'nubmer' is not a known alias
typer.schema({ id: 'nubmer' });

// @ts-expect-error - typo in one alternative of a union
typer.schema({ id: 'number|strng' });

// @ts-expect-error - typo under an optional marker
typer.schema({ id: 'nubmer?' });

// @ts-expect-error - typo in an array element type
typer.schema({ tags: ['strng'] });

// @ts-expect-error - typo inside a nested schema
typer.schema({ addr: { city: 'strng' } });

// @ts-expect-error - typo inside a schema nested in an array
typer.schema({ people: [{ name: 'strng' }] });

// @ts-expect-error - parse() rejects the same typos as schema()
typer.parse({ id: 'nubmer' }, payload);

// @ts-expect-error - safeParse() rejects them too
typer.safeParse({ id: 'nubmer' }, payload);

// @ts-expect-error - 'positive' is registered on `extended`, not on `typer`
typer.schema({ qty: 'positive' });

// @ts-expect-error - 'id' is required, so it cannot be omitted
const incomplete: User = { name: 'x' };

// @ts-expect-error - 'email' is `string | null`, not `number`
const wrongOptional: User = { id: 1, name: 'x', email: 2 };

export type { User, Nested, Order };
export { incomplete, wrongOptional };
