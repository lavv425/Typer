/**
 * Minimal type-level assertion helpers.
 *
 * These have no runtime counterpart: the "tests" are the `tsc` run itself
 * (`npm run test:types`). A failing assertion is a compile error.
 */

/**
 * Exact type equality — stricter than mutual assignability, so `any`, `unknown`
 * and optionality differences are all caught.
 */
export type Equal<A, B> =
    (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

/** Fails to compile unless `T` is exactly `true`. */
export type Expect<T extends true> = T;
