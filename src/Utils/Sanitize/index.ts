import type { ValidationIssue } from "../../Types/Typer";
import { makeIssue } from "../Issues";
import { joinPath } from "../Path";

/**
 * Own keys that are never safe to carry through validation unnoticed.
 *
 * `JSON.parse` happily produces them as ordinary own data properties — Typer
 * validates in place and hands back the same reference, so without this they
 * would survive a `success: true` and get a second chance downstream, at the
 * first spread, `Object.assign` or ORM update.
 *
 * `constructor` and `prototype` are included for the same reason: they are
 * inert as own data properties, and dangerous the moment the object is merged
 * into something that reads them off the prototype chain.
 */
export const DANGEROUS_KEYS: readonly string[] = ['__proto__', 'constructor', 'prototype'];

/** Hoisted so the strip loop does not walk the prototype chain to find it. */
const hasOwn = Object.prototype.hasOwnProperty;

/** Hoisted for the same reason, and compared by identity in {@link mayCarryUnsafeKey}. */
const objectProto = Object.prototype;

/**
 * Cheap, conservative pre-check: does this object possibly carry one of
 * {@link DANGEROUS_KEYS} as an own property?
 *
 * Every validated object pays for this, so it is three inline-cached property
 * reads (~2.5 ns) instead of three `hasOwnProperty` calls (~15 ns). Each read
 * compares against the value a plain object *must* produce when the key is
 * only inherited:
 *
 *  - `__proto__` — an own data property shadows `Object.prototype`'s accessor,
 *    so the read returns that value instead of the real prototype. Note that
 *    `Object.getPrototypeOf` would *not* catch this: `JSON.parse` defines the
 *    key without ever invoking the setter, leaving the prototype untouched.
 *  - `constructor` — inherited, it is `Object` for every plain object.
 *  - `prototype` — not on `Object.prototype` at all, so it reads `undefined`.
 *
 * It is allowed to answer `true` when it should not: `Object.create(null)`
 * objects and class instances fail all three comparisons and then find nothing
 * in the exact check. It is not allowed to answer `false` when it should not,
 * and it does not — slipping through would require an own property whose value
 * is *exactly* the inherited one, which is both unproducible from JSON and
 * indistinguishable from the safe case anyway.
 *
 * @param obj - The object about to be validated.
 */
const mayCarryUnsafeKey = (obj: Record<string, unknown>): boolean => obj['__proto__'] !== objectProto || obj['constructor'] !== Object || obj['prototype'] !== undefined;

/**
 * Removes the given dangerous keys from an object, in place.
 *
 * Deletion is attempted with `Reflect.deleteProperty` rather than `delete`:
 * the latter throws on a frozen or sealed object in strict mode, and a throw
 * here would turn a hardening measure into a new failure mode. When the key
 * genuinely cannot be removed the object cannot be made safe, so that is
 * reported as an issue instead of passing silently.
 *
 * @param obj - The object to sanitize.
 * @param keys - The dangerous keys not declared by the schema.
 * @param issues - Collector for keys that could not be removed.
 * @param parentPath - Path of the owning object, for error reporting.
 */
export const stripDangerousKeys = (obj: Record<string, unknown>, keys: readonly string[], issues: ValidationIssue[], parentPath: string): void => {
    if (!mayCarryUnsafeKey(obj)) return;

    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (!hasOwn.call(obj, key)) continue;
        if (Reflect.deleteProperty(obj, key)) continue;

        const path = joinPath(parentPath, key);
        issues.push(makeIssue(
            'dangerous_key',
            path,
            `Cannot remove unsafe key "${path}": the object is frozen or the property is non-configurable`,
        ));
    }
};
