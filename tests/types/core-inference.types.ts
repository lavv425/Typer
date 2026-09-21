/**
 * Type-level suite for the instance-free API. Run with `npm run test:types`.
 *
 * These pin the result of the 5.0 typing spike: the registry now arrives as an
 * argument rather than on a class type parameter, and the compile-time alias
 * checking has to survive that move — including the case the spike caught,
 * where omitting the registry silently turned every misspelled alias into a
 * valid one.
 */
import { parse, safeParse, schema, createTyper, createRegistry } from '../../src/core';
import type { InferWith } from '../../src/core';
import type { Infer } from '../../src/Types/Typer';
import type { Equal, Expect } from './assert';

declare const payload: unknown;

// ---------------------------------------------------------------------------
//  No registry — the common case
// ---------------------------------------------------------------------------

const user = parse({ id: 'number', name: 'string', email: 'string?' }, payload);
type _User = Expect<Equal<typeof user, { id: number; name: string; email?: string | null }>>;

const nested = parse({ items: [{ qty: 'number' }], addr: { city: 'string' } }, payload);
type _Nested = Expect<Equal<typeof nested, { items: { qty: number }[]; addr: { city: string } }>>;

const safe = safeParse({ id: 'number' }, payload);
// `ParseResult` is a union, so the success branch has to be extracted rather
// than matched with a conditional, which would collapse the whole union.
type _Safe = Expect<Equal<Extract<typeof safe, { success: true }>['data'], { id: number }>>;

// The spike's finding: with the registry omitted, `R` must default to `{}`
// rather than falling back to its constraint — otherwise `KnownAlias<R>`
// widens to `string` and this line compiles.
// @ts-expect-error - 'nubmer' is not a known alias
parse({ id: 'nubmer' }, payload);

// @ts-expect-error - and through safeParse
safeParse({ id: 'nubmer' }, payload);

// @ts-expect-error - and through the schema helper
schema({ id: 'nubmer' });

// @ts-expect-error - inside a nested schema
parse({ addr: { city: 'strng' } }, payload);

// @ts-expect-error - inside an array slot
parse({ tags: ['strng'] }, payload);

// A schema declared once still infers, and still parses.
const userSchema = schema({ id: 'number', email: 'string?' });
type User = Infer<typeof userSchema>;
type _DeclaredUser = Expect<Equal<User, { id: number; email?: string | null }>>;
const reparsed = parse(userSchema, payload);
type _Reparsed = Expect<Equal<typeof reparsed, User>>;

// ---------------------------------------------------------------------------
//  With a registry
// ---------------------------------------------------------------------------

const registry = createRegistry({
    positive: (v: unknown): number => {
        if (typeof v !== 'number' || v <= 0) throw new TypeError('Must be positive');
        return v;
    },
    handle: (v: unknown): string => String(v),
});

const order = parse({ qty: 'positive', slug: 'handle', id: 'number' }, payload, { registry });
type _Order = Expect<Equal<typeof order, { qty: number; slug: string; id: number }>>;

// Optional markers and unions compose with a custom alias.
const optionalCustom = parse({ qty: 'positive?', mixed: 'positive|string' }, payload, { registry });
type _OptionalCustom = Expect<Equal<typeof optionalCustom, { mixed: number | string; qty?: number | null }>>;

// @ts-expect-error - 'positiv' is not registered
parse({ qty: 'positiv' }, payload, { registry });

// @ts-expect-error - a built-in typo is still caught when a registry is present
parse({ id: 'nubmer' }, payload, { registry });

const otherRegistry = createRegistry({ negative: (v: unknown): number => Number(v) });
// @ts-expect-error - 'positive' belongs to a different registry
parse({ qty: 'positive' }, payload, { registry: otherRegistry });

// `Infer` reads the alias map off the registry value rather than a hand-written map.
const orderSchema = schema({ qty: 'positive' }, { registry });
type Order = InferWith<typeof orderSchema, typeof registry>;
type _OrderInfer = Expect<Equal<Order, { qty: number }>>;

// ---------------------------------------------------------------------------
//  Bound form
// ---------------------------------------------------------------------------

const bound = createTyper({
    positive: (v: unknown): number => {
        if (typeof v !== 'number' || v <= 0) throw new TypeError('Must be positive');
        return v;
    },
});

const boundOrder = bound.parse({ qty: 'positive', id: 'number' }, payload);
type _BoundOrder = Expect<Equal<typeof boundOrder, { qty: number; id: number }>>;

// @ts-expect-error - typos are still compile errors through the bound form
bound.parse({ qty: 'positiv' }, payload);

// @ts-expect-error - including built-in typos
bound.parse({ id: 'nubmer' }, payload);

// Destructuring keeps the types, which is what makes it tree-shakable.
const { parse: boundParse, schema: boundSchema } = bound;
const boundSchemaValue = boundSchema({ qty: 'positive' });
const destructured = boundParse(boundSchemaValue, payload);
type _Destructured = Expect<Equal<typeof destructured, { qty: number }>>;

// @ts-expect-error - and still reject typos after destructuring
boundParse({ qty: 'positiv' }, payload);

export type { User, Order };
export { user, nested, order, boundOrder, destructured, reparsed, optionalCustom };
