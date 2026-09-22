import type { FieldChecker, SlotBound, TypeSlot } from "@/Types/Typer";
import type { CompileContext, CompiledChecker } from "@/Core/Compile";
import { boundIssue, compileField, getCompiledChecker, parseTypeSlot } from "@/Core/Compile";
import { getType } from "@/Core/Predicates";
import { makeIssue } from "@/Utils/Issues";
import { DANGEROUS_KEYS, stripDangerousKeys } from "@/Utils/Sanitize";

/**
 * A code generator for schemas: an alternative back end to the closure
 * compiler in `Core/Compile`.
 *
 * The closure compiler resolves everything it can ahead of time and leaves a
 * flat array of closures. Validating then costs one indirect call per field,
 * one `obj[key]` read through a captured variable, and one `joinPath` per
 * nesting level — none of it avoidable while the shape of the schema is known
 * only as data.
 *
 * Generating source removes all three. The schema becomes one straight-line
 * function with `obj.id` property reads the engine can inline-cache, direct
 * calls to the resolved predicates, and every statically known path folded
 * into a single string literal, so a field six levels down still costs one
 * concatenation and only when it fails.
 *
 * Two things keep this honest:
 *
 * - It emits code only for the forms it specialises — type-string slots,
 *   nested objects, arrays of type strings — and delegates every other field
 *   to the closure the ordinary compiler already built for it. A form this
 *   generator has not heard of cannot be miscompiled, only delegated.
 * - Every issue is built by the same `makeIssue`, `getType`, `boundIssue` and
 *   `stripDangerousKeys` the interpreter calls, so the wording has one source
 *   rather than two that have to be kept in step.
 *
 * `new Function` is unavailable under a Content-Security-Policy without
 * `unsafe-eval`. That is not an error here: {@link jitChecker} returns `null`
 * and the caller keeps the closure-compiled checker. It is also why this sits
 * behind its own entry point instead of switching on underneath everyone.
 */

/** Tables the generated source indexes into, in emission order. */
type Tables = {
    P: Array<(value: unknown) => boolean>;
    F: FieldChecker[];
    B: SlotBound[];
    S: Array<Set<string>>;
    D: Array<readonly string[]>;
};

/**
 * Beyond this many declared keys, strict mode reads from a `Set` rather than a
 * chain of `===`. The chain wins while the comparisons stay cheap; the
 * crossover is not sharp, and this sits inside the flat part of it.
 */
const SET_THRESHOLD = 8;

/** Property names safe to emit as `obj.name` rather than `obj["name"]`. */
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** A JavaScript string literal for arbitrary text, via the JSON grammar. */
const lit = (text: string): string => JSON.stringify(text);

/** Emits a property read, preferring the dot form the engine inline-caches. */
const member = (object: string, key: string): string =>
    IDENTIFIER.test(key) ? `${object}.${key}` : `${object}[${lit(key)}]`;

/**
 * Where in the value a generated fragment is operating.
 *
 * `base` is an expression for the enclosing prefix and `staticPrefix` the part
 * known at generation time, so a field's path is `base + "a.b.c.key"` — one
 * concatenation whatever the depth. `ownPath` is an expression for the path of
 * the object itself, which the delegated closures and the dangerous-key strip
 * both take.
 */
type Scope = {
    readonly obj: string;
    readonly base: string;
    readonly staticPrefix: string;
    readonly ownPath: string;
};

/** Accumulates generated source with block-structured indentation. */
class Emitter {
    private readonly lines: string[] = [];
    private depth = 1;
    /** Fresh binding names, so nested scopes never shadow each other. */
    private counter = 0;

    constructor(readonly tables: Tables) { }

    line(text: string): void {
        this.lines.push('  '.repeat(this.depth) + text);
    }

    /** Opens a block: emits the header and indents what follows. */
    open(header: string): void {
        this.line(header);
        this.depth += 1;
    }

    /** Closes a block, optionally continuing it (`} else {`). */
    close(footer = '}'): void {
        this.depth -= 1;
        this.line(footer);
        if (footer.endsWith('{')) this.depth += 1;
    }

    name(stem: string): string {
        return `${stem}${this.counter++}`;
    }

    source(): string {
        return this.lines.join('\n');
    }

    predicate(fn: (value: unknown) => boolean): string {
        return `P[${this.tables.P.push(fn) - 1}]`;
    }
    fallback(checker: FieldChecker): string {
        return `F[${this.tables.F.push(checker) - 1}]`;
    }
    bound(value: SlotBound): string {
        return `B[${this.tables.B.push(value) - 1}]`;
    }
    keySet(keys: string[]): string {
        return `S[${this.tables.S.push(new Set(keys)) - 1}]`;
    }
    dangerous(keys: readonly string[]): string {
        return `D[${this.tables.D.push(keys) - 1}]`;
    }
}

/** The path expression for a key inside a scope, folded to one concatenation. */
const pathOf = (scope: Scope, key: string): string => `${scope.base} + ${lit(scope.staticPrefix + key)}`;

/** Emits the issue for a value that matched no alternative of its slot. */
const emitMismatch = (e: Emitter, valueExpr: string, pathExpr: string, slot: TypeSlot): void => {
    if (slot.unknownType !== null) {
        e.line(`const p = ${pathExpr};`);
        e.line(`issues.push(makeIssue('unknown_type', p, ${lit(`Unknown type: ${slot.unknownType}`)}, ${lit(slot.unknownType)}));`);
        return;
    }
    e.line(`const p = ${pathExpr};`);
    e.line(`const t = getType(${valueExpr});`);
    e.line(`issues.push(makeIssue('invalid_type', p, 'Expected "' + p + '" to be ' + ${lit(slot.description)} + ', got ' + t, ${lit(slot.description)}, t));`);
};

/**
 * Emits the alternative-matching chain for a type-string slot.
 *
 * Without bounds this collapses to one negated disjunction. With them it has
 * to stay a chain: the bound belongs to the alternative that matched and only
 * that one is consulted, which is the rule the interpreter's loop follows.
 */
const emitSlotMatch = (e: Emitter, slot: TypeSlot, valueExpr: string, pathExpr: string): void => {
    const { predicates, bounds, hasBounds } = slot;

    if (predicates.length === 0) {
        e.open('{');
        emitMismatch(e, valueExpr, pathExpr, slot);
        e.close();
        return;
    }

    if (!hasBounds) {
        const test = predicates.map((p) => `${e.predicate(p)}(${valueExpr})`).join(' || ');
        e.open(`if (!(${test})) {`);
        emitMismatch(e, valueExpr, pathExpr, slot);
        e.close();
        return;
    }

    predicates.forEach((predicate, i) => {
        const test = `${e.predicate(predicate)}(${valueExpr})`;
        if (i === 0) e.open(`if (${test}) {`);
        else e.close(`} else if (${test}) {`);

        const bound = bounds[i];
        if (bound === null) e.line('// unbounded alternative');
        else e.line(`const iss = boundIssue(${valueExpr}, ${e.bound(bound)}, ${pathExpr}); if (iss !== null) issues.push(iss);`);
    });

    e.close('} else {');
    emitMismatch(e, valueExpr, pathExpr, slot);
    e.close();
};

/** Emits a type-string field, mirroring `compileStringField`. */
const emitStringField = (e: Emitter, slot: TypeSlot, scope: Scope, key: string): void => {
    const pathExpr = pathOf(scope, key);
    const v = e.name('v');

    e.open('{');
    e.line(`const ${v} = ${member(scope.obj, key)};`);

    e.open(`if (${v} === undefined) {`);
    if (slot.isOptional) {
        e.line('// optional: absence is not a failure');
    } else {
        e.line(`const p = ${pathExpr};`);
        e.line(`issues.push(makeIssue('missing_key', p, 'Missing required key "' + p + '"', ${lit(slot.description)}, 'undefined'));`);
    }

    if (slot.isOptional) {
        e.close(`} else if (${v} === null) {`);
        e.line('// nullable, by the trailing `?`');
    }

    e.close('} else {');
    emitSlotMatch(e, slot, v, pathExpr);
    e.close();

    e.close();
};

/** Emits an array field whose element is a type string, mirroring `compileArrayField`. */
const emitArrayField = (e: Emitter, slot: TypeSlot, scope: Scope, key: string): void => {
    const arrayPath = pathOf(scope, key);
    const a = e.name('a');
    const i = e.name('i');
    const v = e.name('v');
    const elementPath = `${scope.base} + ${lit(scope.staticPrefix + key)} + '[' + ${i} + ']'`;

    e.open('{');
    e.line(`const ${a} = ${member(scope.obj, key)};`);

    e.open(`if (${a} === undefined) {`);
    e.line(`const p = ${arrayPath};`);
    e.line(`issues.push(makeIssue('missing_key', p, 'Missing required key "' + p + '"', 'array', 'undefined'));`);

    e.close(`} else if (!Array.isArray(${a})) {`);
    e.line(`const p = ${arrayPath};`);
    e.line(`const t = getType(${a});`);
    e.line(`issues.push(makeIssue('invalid_type', p, 'Expected "' + p + '" to be an array, got ' + t, 'array', t));`);

    e.close('} else {');
    e.open(`for (let ${i} = 0; ${i} < ${a}.length; ${i}++) {`);
    e.line(`const ${v} = ${a}[${i}];`);
    if (slot.isOptional) e.line(`if (${v} === undefined || ${v} === null) continue;`);
    emitSlotMatch(e, slot, v, elementPath);
    e.close();
    e.close();

    e.close();
};

/** Emits a nested schema inline, so a three-level shape stays one function. */
const emitNestedField = (e: Emitter, ctx: CompileContext, scope: Scope, key: string, nested: Record<string, unknown>, strictMode: boolean): void => {
    const pathExpr = pathOf(scope, key);
    const o = e.name('o');
    const p = e.name('p');

    e.open('{');
    e.line(`const ${o} = ${member(scope.obj, key)};`);

    e.open(`if (${o} === undefined) {`);
    e.line(`const p = ${pathExpr};`);
    e.line(`issues.push(makeIssue('missing_key', p, 'Missing required key "' + p + '"', 'object', 'undefined'));`);

    e.close(`} else if (${o} === null || typeof ${o} !== 'object' || Array.isArray(${o})) {`);
    e.line(`const p = ${pathExpr};`);
    e.line(`const t = getType(${o});`);
    e.line(`issues.push(makeIssue('invalid_type', p, 'Expected "' + p + '" to be an object, got ' + t, 'object', t));`);

    e.close('} else {');
    e.line(`const ${p} = ${pathExpr};`);
    emitSchema(e, ctx, nested, {
        obj: o,
        base: scope.base,
        staticPrefix: `${scope.staticPrefix}${key}.`,
        ownPath: p,
    }, strictMode);
    e.close();

    e.close();
};

/** Emits every field of a schema object, plus the strict-mode sweep. */
function emitSchema(e: Emitter, ctx: CompileContext, schema: Record<string, unknown>, scope: Scope, strictMode: boolean): void {
    const keys = Object.keys(schema);

    const unsafe = DANGEROUS_KEYS.filter((key) => !keys.includes(key));
    if (unsafe.length > 0) {
        e.line(`stripDangerousKeys(${scope.obj}, ${e.dangerous(unsafe)}, issues, ${scope.ownPath});`);
    }

    for (const key of keys) {
        const expected = schema[key];

        if (typeof expected === 'string' && expected.trim() !== '') {
            const slot = parseTypeSlot(ctx, expected);
            if (slot !== null) {
                emitStringField(e, slot, scope, key);
                continue;
            }
        } else if (Array.isArray(expected) && expected.length === 1 && typeof expected[0] === 'string' && expected[0].trim() !== '') {
            const slot = parseTypeSlot(ctx, expected[0]);
            if (slot !== null) {
                emitArrayField(e, slot, scope, key);
                continue;
            }
        } else if (expected !== null && typeof expected === 'object' && !Array.isArray(expected)) {
            emitNestedField(e, ctx, scope, key, expected as Record<string, unknown>, strictMode);
            continue;
        }

        // Validators, malformed slots and every form not specialised above run
        // the closure the ordinary compiler built for them.
        e.line(`${e.fallback(compileField(ctx, key, expected, strictMode))}(${scope.obj}, issues, ${scope.ownPath});`);
    }

    if (!strictMode) return;

    const k = e.name('k');
    const ks = e.name('ks');
    e.open('{');
    e.line(`const ${ks} = Object.keys(${scope.obj});`);
    e.open(`for (let j = 0; j < ${ks}.length; j++) {`);
    e.line(`const ${k} = ${ks}[j];`);
    if (keys.length > SET_THRESHOLD) {
        e.line(`if (${e.keySet(keys)}.has(${k})) continue;`);
    } else if (keys.length > 0) {
        e.line(`if (${keys.map((key) => `${k} === ${lit(key)}`).join(' || ')}) continue;`);
    }
    e.line(`const p = ${scope.base} + ${lit(scope.staticPrefix)} + ${k};`);
    e.line(`issues.push(makeIssue('unexpected_key', p, 'Unexpected key "' + p + '" in strict mode'));`);
    e.close();
    e.close();
}

/**
 * Generates a checker for a schema, or `null` when code generation is
 * unavailable.
 *
 * @param ctx - Alias resolution, shared with the closure compiler.
 * @param schema - The schema to generate for.
 * @param strictMode - Whether undeclared keys are rejected.
 */
export const jitChecker = (ctx: CompileContext, schema: Record<string, unknown>, strictMode: boolean): CompiledChecker | null => {
    const tables: Tables = { P: [], F: [], B: [], S: [], D: [] };
    const e = new Emitter(tables);

    e.open(`if (value === null || typeof value !== 'object' || Array.isArray(value)) {`);
    e.line('const t = getType(value);');
    e.line(`return [makeIssue('invalid_type', rootPath, 'Invalid object: must be a non-null object, got ' + t, 'object', t)];`);
    e.close();
    e.line('const issues = [];');
    e.line(`const R = rootPath === '' ? '' : rootPath + '.';`);

    emitSchema(e, ctx, schema, { obj: 'value', base: 'R', staticPrefix: '', ownPath: 'rootPath' }, strictMode);

    e.line('return issues;');

    const source = `return function jitChecker(value, rootPath) {\n${e.source()}\n};`;

    try {
        // eslint-disable-next-line @typescript-eslint/no-implied-eval -- generating the checker is the point; see the module comment
        const build = new Function(
            'makeIssue', 'getType', 'boundIssue', 'stripDangerousKeys', 'P', 'F', 'B', 'S', 'D',
            source,
        ) as (...args: unknown[]) => CompiledChecker;

        return build(makeIssue, getType, boundIssue, stripDangerousKeys, tables.P, tables.F, tables.B, tables.S, tables.D);
    } catch {
        // A Content-Security-Policy without `unsafe-eval`, or an engine that
        // refuses generated code. Neither is a validation failure.
        return null;
    }
};

/**
 * Returns the generated source for a schema, for inspection and for the tests
 * that assert what got specialised rather than only that the result matched.
 *
 * @param ctx - Alias resolution, shared with the closure compiler.
 * @param schema - The schema to generate for.
 * @param strictMode - Whether undeclared keys are rejected.
 */
export const jitSource = (ctx: CompileContext, schema: Record<string, unknown>, strictMode: boolean): string => {
    const e = new Emitter({ P: [], F: [], B: [], S: [], D: [] });
    emitSchema(e, ctx, schema, { obj: 'value', base: 'R', staticPrefix: '', ownPath: 'rootPath' }, strictMode);
    return e.source();
};

/**
 * A generated checker, falling back to the closure-compiled one where
 * generation is unavailable.
 *
 * @param ctx - Alias resolution and the closure compiler's caches.
 * @param schema - The schema to compile.
 * @param strictMode - Whether undeclared keys are rejected.
 */
export const getJitChecker = (ctx: CompileContext, schema: Record<string, unknown>, strictMode: boolean): CompiledChecker =>
    jitChecker(ctx, schema, strictMode) ?? getCompiledChecker(ctx, schema, strictMode);
