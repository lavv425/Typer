import * as free from '../src/validators';
import { parse, safeParse } from '../src/core';
import { Typer, TyperError } from '../src/Typer';

const typer = new Typer();

/**
 * The validators moved out of the class, so the two must stay indistinguishable
 * — same result, same message, same issue code. These assert that against the
 * instance rather than restating the expectations by hand.
 */
const SAME: Array<[keyof typeof free, unknown[], unknown[]]> = [
    // [name, args that pass, args that fail]
    ['isEmail', ['a@b.co'], ['nope']],
    ['isURL', ['https://example.com'], ['nope']],
    ['isUUID', ['3f2504e0-4f89-11d3-9a0c-0305e82c3301'], ['nope']],
    ['isIPv4', ['192.168.0.1'], ['999.1.1.1']],
    ['isIPv6', ['::1'], ['nope']],
    ['isIP', ['192.168.0.1'], ['nope']],
    ['isSemver', ['1.0.0'], ['nope']],
    ['isSlug', ['hello-world'], ['Nope!']],
    ['isJWT', ['aaa.bbb.ccc'], ['nope']],
    ['isMACAddress', ['00:1A:2B:3C:4D:5E'], ['nope']],
    ['isHexColor', ['#fff'], ['nope']],
    ['isISODate', ['2026-09-21'], ['nope']],
    ['isBase64', ['aGk='], ['!!']],
    ['isPhoneNumber', ['+391234567'], ['nope']],
    ['isNonEmptyString', ['x'], ['  ']],
    ['isInteger', [42], [1.5]],
    ['isPositiveNumber', [1], [-1]],
    ['isPositiveInteger', [1], [-1]],
    ['isNegativeNumber', [-1], [1]],
    ['isNegativeInteger', [-1], [1]],
    ['isFiniteNumber', [1], [Infinity]],
    ['isSafeInteger', [1], [2 ** 60]],
    ['isPort', [8080], [0]],
    ['isNonEmptyArray', [[1]], [[]]],
    ['isEmpty', [[]], [[1]]],
    ['isNonEmpty', [[1]], [[]]],
    ['isPlainObject', [{}], [new Date()]],
    ['isPromise', [Promise.resolve()], [1]],
    ['asString', ['x'], [1]],
    ['asNumber', [1], ['x']],
    ['asBoolean', [true], ['x']],
    ['asArray', [[]], ['x']],
    ['asObject', [{}], ['x']],
];

describe('the free validators match the class', () => {
    it.each(SAME)('%s accepts and rejects the same values', (name, pass, fail) => {
        const freeFn = free[name] as (...args: unknown[]) => unknown;
        const method = (typer as unknown as Record<string, (...args: unknown[]) => unknown>)[name].bind(typer);

        expect(freeFn(...pass)).toEqual(method(...pass));

        let freeError: Error | undefined;
        let classError: Error | undefined;
        try { freeFn(...fail); } catch (e) { freeError = e as Error; }
        try { method(...fail); } catch (e) { classError = e as Error; }

        expect(freeError).toBeDefined();
        expect(classError).toBeDefined();
        expect(freeError!.message).toBe(classError!.message);
    });

    it.each([
        ['isInRange', [1000, 9999, 5000] as const, [1000, 9999, 42] as const],
        ['isOneOf', [['a', 'b'], 'a'] as const, [['a', 'b'], 'z'] as const],
        ['isLength', [{ min: 1 }, 'x'] as const, [{ min: 3 }, 'x'] as const],
        ['matches', [/^a+$/, 'aa'] as const, [/^a+$/, 'b'] as const],
    ])('%s (multi-argument) matches the class', (name, pass, fail) => {
        const freeFn = (free as unknown as Record<string, (...args: unknown[]) => unknown>)[name];
        const method = (typer as unknown as Record<string, (...args: unknown[]) => unknown>)[name].bind(typer);

        expect(freeFn(...(pass as unknown as unknown[]))).toEqual(method(...(pass as unknown as unknown[])));

        const freeMsg = ((): string => { try { freeFn(...(fail as unknown as unknown[])); return ''; } catch (e) { return (e as Error).message; } })();
        const classMsg = ((): string => { try { method(...(fail as unknown as unknown[])); return ''; } catch (e) { return (e as Error).message; } })();

        expect(freeMsg).not.toBe('');
        expect(freeMsg).toBe(classMsg);
    });

    it('keeps the constraint issue codes', () => {
        try {
            free.isInRange(1000, 9999, 42);
        } catch (e) {
            expect((e as TyperError).issues[0]).toMatchObject({ code: 'too_small', minimum: 1000 });
            return;
        }
        throw new Error('expected a throw');
    });

    it('keeps the format issue codes', () => {
        try {
            free.isEmail('nope');
        } catch (e) {
            expect((e as TyperError).issues[0]).toMatchObject({ code: 'invalid_format', expected: 'email' });
            return;
        }
        throw new Error('expected a throw');
    });

    it('exposes the type guards as guards, not assertions', () => {
        expect(free.isString('x')).toBe(true);
        expect(free.isString(1)).toBe(false);
        expect(free.isNumber(1)).toBe(true);
        expect(free.isBoolean(true)).toBe(true);
        expect(free.isArray([])).toBe(true);
        expect(free.isObject({})).toBe(true);
    });

    it('exposes isInstanceOf', () => {
        const date = new Date();
        expect(free.isInstanceOf(Date, date)).toBe(date);
        expect(() => free.isInstanceOf(Date, 1)).toThrow(TypeError);
    });

    it('exposes isType for the built-in aliases', () => {
        expect(free.isType('string', 'x')).toBe('x');
        expect(() => free.isType('string', 1)).toThrow('None of the types matched for 1');
    });
});

describe('free validators compose with the free core', () => {
    it('slots into a schema', () => {
        const userSchema = { email: free.isEmail, port: free.isPort };

        expect(parse(userSchema, { email: 'a@b.co', port: 8080 })).toEqual({ email: 'a@b.co', port: 8080 });

        const result = safeParse(userSchema, { email: 'nope', port: 0 });
        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues.map((i) => [i.path, i.code])).toEqual([
            ['email', 'invalid_format'],
            ['port', 'too_small'],
        ]);
    });

    it('slots into an array position', () => {
        const result = safeParse({ emails: [free.isEmail] }, { emails: ['a@b.co', 'nope'] });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues[0]).toMatchObject({ path: 'emails[1]', code: 'invalid_format' });
    });
});
