import { Typer, TyperError } from '../src/Typer';
import type { ValidationIssue } from '../src/Typer';
import { issuesOf, validateSync } from './helpers/standard';

const typer = new Typer();

/** Runs a validator and returns the single issue it reported. */
const issueOf = (run: () => unknown): ValidationIssue => {
    try {
        run();
    } catch (e) {
        if (e instanceof TyperError) return e.issues[0];
        throw e;
    }
    throw new Error('expected the validator to throw');
};

describe('constraint validators report a code, not just prose', () => {
    describe('bounds', () => {
        it.each<[string, () => unknown, Partial<ValidationIssue>]>([
            ['isInRange below', () => typer.isInRange(1000, 9999, 42), { code: 'too_small', minimum: 1000, maximum: 9999 }],
            ['isInRange above', () => typer.isInRange(1000, 9999, 99999), { code: 'too_big', minimum: 1000, maximum: 9999 }],
            ['isLength min', () => typer.isLength({ min: 3, max: 50 }, 'ab'), { code: 'too_small', minimum: 3 }],
            ['isLength max', () => typer.isLength({ min: 1, max: 2 }, 'abc'), { code: 'too_big', maximum: 2 }],
            ['isPort low', () => typer.isPort(0), { code: 'too_small', minimum: 1, maximum: 65535 }],
            ['isPort high', () => typer.isPort(70000), { code: 'too_big', minimum: 1, maximum: 65535 }],
            ['isPositiveNumber', () => typer.isPositiveNumber(-1), { code: 'too_small', minimum: 0 }],
            ['isPositiveInteger', () => typer.isPositiveInteger(-1), { code: 'too_small', minimum: 0 }],
            ['isNegativeInteger', () => typer.isNegativeInteger(1), { code: 'too_big', maximum: -1 }],
            ['isNegativeNumber', () => typer.isNegativeNumber(1), { code: 'too_big' }],
            ['isNonEmptyString', () => typer.isNonEmptyString('  '), { code: 'too_small', minimum: 1 }],
            ['isNonEmptyArray', () => typer.isNonEmptyArray([]), { code: 'too_small', minimum: 1 }],
            ['isNonEmpty (Set)', () => typer.isNonEmpty(new Set()), { code: 'too_small', minimum: 1 }],
            ['isEmpty (array)', () => typer.isEmpty([1]), { code: 'too_big', maximum: 0 }],
            ['arrayOf min', () => typer.arrayOf(typer.validators.asNumber, { min: 2 })([1]), { code: 'too_small', minimum: 2 }],
            ['arrayOf max', () => typer.arrayOf(typer.validators.asNumber, { max: 1 })([1, 2]), { code: 'too_big', maximum: 1 }],
            ['tuple short', () => typer.tuple([typer.validators.asNumber, typer.validators.asNumber])([1]), { code: 'too_small', minimum: 2 }],
            ['tuple long', () => typer.tuple([typer.validators.asNumber])([1, 2]), { code: 'too_big', maximum: 1 }],
        ])('%s', (_label, run, expected) => {
            expect(issueOf(run)).toMatchObject(expected);
        });
    });

    describe('formats', () => {
        it.each<[string, () => unknown, string]>([
            ['isEmail', () => typer.isEmail('nope'), 'email'],
            ['isURL', () => typer.isURL('nope'), 'url'],
            ['isUUID', () => typer.isUUID('nope'), 'uuid'],
            ['isIPv4', () => typer.isIPv4('999.1.1.1'), 'ipv4'],
            ['isIPv6', () => typer.isIPv6('nope'), 'ipv6'],
            ['isIP', () => typer.isIP('nope'), 'ip'],
            ['isSemver', () => typer.isSemver('nope'), 'semver'],
            ['isSlug', () => typer.isSlug('Nope!'), 'slug'],
            ['isJWT', () => typer.isJWT('nope'), 'jwt'],
            ['isMACAddress', () => typer.isMACAddress('nope'), 'mac address'],
            ['isHexColor', () => typer.isHexColor('nope'), 'hex color'],
            ['isISODate', () => typer.isISODate('nope'), 'iso date'],
            ['isBase64', () => typer.isBase64('!!'), 'base64'],
            ['isPhoneNumber', () => typer.isPhoneNumber('nope'), 'phone'],
            ['isInteger', () => typer.isInteger(1.5), 'integer'],
            ['isFiniteNumber', () => typer.isFiniteNumber(Infinity), 'finite number'],
            ['isSafeInteger', () => typer.isSafeInteger(2 ** 60), 'safe integer'],
            ['matches', () => typer.matches(/^a+$/, 'b'), '/^a+$/'],
        ])('%s', (_label, run, expected) => {
            expect(issueOf(run)).toMatchObject({ code: 'invalid_format', expected });
        });
    });

    describe('isInRange keeps the failing value out of the message', () => {
        it('does not name the value, which may be a PIN, an OTP or an amount', () => {
            const issue = issueOf(() => typer.isInRange(1000, 9999, 424242));

            expect(issue.message).toBe('value must be between 1000 and 9999');
            expect(issue.message).not.toContain('424242');
        });

        it('puts it on the issue instead, for callers that want to show it', () => {
            const issue = issueOf(() => typer.isInRange(1000, 9999, 42));
            expect(issue.value).toBe(42);
        });

        it('keeps it out of the aggregated error message too', () => {
            try {
                typer.parse({ pin: (v: unknown) => typer.isInRange(1000, 9999, v) }, { pin: 424242 });
            } catch (e) {
                expect((e as Error).message).not.toContain('424242');
                return;
            }
            throw new Error('expected a throw');
        });

        it('keeps it out of the Standard Schema output, which frameworks log whole', () => {
            const schema = typer.standard({ pin: (v: unknown) => typer.isInRange(1000, 9999, v) });
            const result = validateSync(schema, { pin: 424242 });
            const issues = issuesOf(result);

            expect(JSON.stringify(result)).not.toContain('424242');
            expect(issues[0]).not.toHaveProperty('value');
            expect(issues[0].code).toBe('too_big');
        });

        it('carries the value through a schema slot', () => {
            const result = typer.safeParse({ pin: (v: unknown) => typer.isInRange(1000, 9999, v) }, { pin: 42 });

            expect(result.success).toBe(false);
            if (result.success) return;
            expect(result.issues[0].value).toBe(42);
        });

        it('leaves isLength alone, which already reported only the length', () => {
            const issue = issueOf(() => typer.isLength({ min: 3 }, 'ab'));

            expect(issue.message).toBe('length must be >= 3, is 2');
            expect(issue.message).not.toContain('ab');
        });
    });

    it('still extends TypeError, so existing catch blocks keep working', () => {
        expect(() => typer.isEmail('nope')).toThrow(TypeError);
        expect(() => typer.isEmail('nope')).toThrow('must be a valid email address');
    });
});

describe('the code survives into a schema', () => {
    it('distinguishes too short from out of range — the case that motivated this', () => {
        const schema = {
            name: (v: unknown) => typer.isLength({ min: 3, max: 50 }, v),
            pin: (v: unknown) => typer.isInRange(1000, 9999, v),
        };

        const result = typer.safeParse(schema, { name: 'ab', pin: 42 });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues.map((i) => [i.path, i.code])).toEqual([
            ['name', 'too_small'],
            ['pin', 'too_small'],
        ]);
        expect(result.issues[0].minimum).toBe(3);
        expect(result.issues[1].minimum).toBe(1000);
        expect(result.issues[1].maximum).toBe(9999);
    });

    it('keeps the path-naming message it has always had', () => {
        const result = typer.safeParse({ email: typer.validators.isEmail }, { email: 'nope' });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues[0].message).toBe('Validation failed at "email": nope must be a valid email address.');
        expect(result.issues[0].code).toBe('invalid_format');
    });

    it('works for array element slots too', () => {
        const result = typer.safeParse({ emails: [typer.validators.isEmail] }, { emails: ['a@b.co', 'nope'] });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues[0]).toMatchObject({ code: 'invalid_format', path: 'emails[1]', expected: 'email' });
    });

    it('leaves a nested objectOf reporting as custom, since it fails at its own paths', () => {
        const result = typer.safeParse(
            { user: typer.objectOf({ id: 'number' }) },
            { user: { id: 'one' } },
        );

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.issues[0].code).toBe('custom');
    });

    it('surfaces the code through Standard Schema as well', () => {
        const schema = typer.standard({ pin: (v: unknown) => typer.isInRange(1000, 9999, v) });
        const issues = issuesOf(validateSync(schema, { pin: 42 }));

        expect(issues[0]).toMatchObject({ code: 'too_small', minimum: 1000 });
    });
});
