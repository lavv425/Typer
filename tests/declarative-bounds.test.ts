import { parse, safeParse } from '../src/core';
import { Typer } from '../src/Typer';

const typer = new Typer();

/**
 * The other half of the audit's P1-1. 4.1 gave constraint failures their own
 * issue codes; this gives constraints a declarative form, so
 * "a string of 3 to 50 characters" no longer has to descend into a closure.
 */
describe('inline bounds in a type string', () => {
    describe('strings and arrays are bounded by length', () => {
        it.each([
            ['string(3,50)', 'abc', true],
            ['string(3,50)', 'ab', false],
            ['string(3,50)', 'x'.repeat(51), false],
            ['string(3,)', 'abcd', true],
            ['string(3,)', 'ab', false],
            ['string(,5)', 'abcde', true],
            ['string(,5)', 'abcdef', false],
            ['array(1,2)', ['a'], true],
            ['array(1,2)', [], false],
            ['array(1,2)', ['a', 'b', 'c'], false],
        ])('%s accepts %p -> %p', (type, value, ok) => {
            expect(safeParse({ v: type } as never, { v: value }).success).toBe(ok);
        });
    });

    describe('numbers are bounded by value', () => {
        it.each([
            ['number(1000,9999)', 5000, true],
            ['number(1000,9999)', 42, false],
            ['number(1000,9999)', 99999, false],
            ['number(0,)', 0, true],
            ['number(0,)', -1, false],
            ['number(,100)', 100, true],
            ['number(,100)', 101, false],
        ])('%s accepts %p -> %p', (type, value, ok) => {
            expect(safeParse({ v: type } as never, { v: value }).success).toBe(ok);
        });
    });

    it('reports too_small with the bound, not a flat custom', () => {
        const result = safeParse({ name: 'string(3,50)' } as never, { name: 'ab' });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues[0]).toMatchObject({
            code: 'too_small', path: 'name', minimum: 3, maximum: 50,
        });
        expect(result.issues[0].message).toBe('Expected "name" to have length >= 3, got 2');
    });

    it('reports too_big with the bound', () => {
        const result = safeParse({ pin: 'number(1000,9999)' } as never, { pin: 99999 });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues[0]).toMatchObject({ code: 'too_big', path: 'pin', maximum: 9999 });
        expect(result.issues[0].message).toBe('Expected "pin" to have value <= 9999, got 99999');
    });

    it('keeps the type mismatch when the value is the wrong type entirely', () => {
        const result = safeParse({ name: 'string(3,50)' } as never, { name: 42 });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues[0].code).toBe('invalid_type');
    });

    it('composes with the optional marker', () => {
        expect(safeParse({ name: 'string(3,50)?' } as never, {}).success).toBe(true);
        expect(safeParse({ name: 'string(3,50)?' } as never, { name: null }).success).toBe(true);
        expect(safeParse({ name: 'string(3,50)?' } as never, { name: 'ab' }).success).toBe(false);
    });

    it('binds to the matching alternative of a union, not the whole slot', () => {
        const schema = { v: 'string(3,)|number' } as never;

        expect(safeParse(schema, { v: 'abc' }).success).toBe(true);
        expect(safeParse(schema, { v: 'ab' }).success).toBe(false);
        // The number branch carries no bound, so any number passes.
        expect(safeParse(schema, { v: 1 }).success).toBe(true);
    });

    it('applies inside array element slots', () => {
        const result = safeParse({ tags: ['string(2,)'] } as never, { tags: ['ok', 'x'] });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues[0]).toMatchObject({ code: 'too_small', path: 'tags[1]', minimum: 2 });
    });

    it('works through the class as well', () => {
        expect(() => typer.parse({ name: 'string(3,50)' } as never, { name: 'ab' })).toThrow(TypeError);
        expect(typer.parse({ name: 'string(3,50)' } as never, { name: 'abc' })).toEqual({ name: 'abc' });
    });

    describe('a malformed bound is reported, never ignored', () => {
        it.each([
            ['string(a,b)', 'unreadable numbers'],
            ['string(1,2,3)', 'too many parts'],
            ['string(,)', 'no bound at all'],
            ['(3,50)', 'no type name'],
        ])('%s (%s)', (type) => {
            const result = safeParse({ v: type } as never, { v: 'abc' });

            expect(result.success).toBe(false);
            if (result.success) return;
            expect(result.issues[0].code).toBe('unknown_type');
        });
    });

    it('leaves unbounded slots untouched', () => {
        expect(parse({ a: 'string', b: 'number' }, { a: 'x', b: 1 })).toEqual({ a: 'x', b: 1 });
    });
});

describe('bounds reach JSON Schema', () => {
    // The keyword follows what is being measured, not the syntax: JSON Schema
    // names the same constraint three different ways.
    it.each([
        ['string(3,50)', { type: 'string', minLength: 3, maxLength: 50 }],
        ['string(3,)', { type: 'string', minLength: 3 }],
        ['string(,50)', { type: 'string', maxLength: 50 }],
        ['array(1,10)', { type: 'array', minItems: 1, maxItems: 10 }],
        ['number(1000,9999)', { type: 'number', minimum: 1000, maximum: 9999 }],
    ])('%s emits %p', (type, expected) => {
        const doc = typer.toJSONSchema({ v: type } as never);
        expect((doc.properties as Record<string, unknown>).v).toEqual(expected);
    });

    it('widens a bounded optional slot with null', () => {
        const doc = typer.toJSONSchema({ v: 'string(3,)?' } as never);
        expect((doc.properties as Record<string, unknown>).v).toEqual({
            anyOf: [{ type: 'string', minLength: 3 }, { type: 'null' }],
        });
    });

    it('reports a malformed bound as unrepresentable', () => {
        expect(() => typer.toJSONSchema({ v: 'string(a,b)' } as never, { unrepresentable: 'throw' }))
            .toThrow(TypeError);
    });
});
