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
// eslint-disable-next-line @typescript-eslint/unbound-method -- called with .call, never as a method
const hasOwn = Object.prototype.hasOwnProperty;

/** Hoisted for the same reason, and compared by identity in {@link mayCarryUnsafeKey}. */
const objectProto = Object.prototype;

/**
 * Cheap, conservative pre-check: might this object carry one of
 * {@link DANGEROUS_KEYS} as an own property?
 *
 * Three inline-cached property reads (~2.5 ns) instead of three
 * `hasOwnProperty` calls (~15 ns), each comparing against the value a plain
 * object must produce when the key is only inherited. Note that
 * `Object.getPrototypeOf` would *not* catch an own `__proto__`: `JSON.parse`
 * defines it without invoking the setter.
 *
 * It may answer `true` when it should not — null-prototype objects and class
 * instances then find nothing in the exact check. It cannot answer `false`
 * when it should not, which is what makes it safe to gate on.
 *
 * @param obj - The object about to be validated.
 */
// eslint-disable-next-line no-proto -- reading it is the probe; see above
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
