import type { CompileContext, CompiledChecker } from "@/Core/Compile";
import { getCompiledChecker } from "@/Core/Compile";

/**
 * The single point where a schema becomes a checker.
 *
 * Every entry point — `parse`, `parseAsync`, `objectOf`, `discriminatedUnion`
 * and the `Typer` class — reaches a compiled checker through here, so
 * replacing what sits behind it replaces it for all of them at once. That is
 * what lets `installJit` be a line in a bootstrap file rather than a change to
 * every call site.
 *
 * The indirection is deliberately one module-level read: `/core` must never
 * import `/jit`, because that would put `new Function` into the bundle of
 * every consumer, including the ones a Content-Security-Policy would then
 * refuse. So the generator is installed into this slot from the outside, and a
 * consumer who never imports it pays nothing but this variable.
 */

/** Turns a schema into a checker, under some compilation strategy. */
export type Backend = (ctx: CompileContext, schema: Record<string, unknown>, strictMode: boolean) => CompiledChecker;

/**
 * The closure compiler, which is what runs unless something replaces it.
 *
 * Kept as a named binding rather than read from the slot, so the generator can
 * call it for the fields it delegates without dispatching back through here.
 */
export const CLOSURE_BACKEND: Backend = getCompiledChecker;

let active: Backend = CLOSURE_BACKEND;

/**
 * Replaces the compilation strategy for the whole process.
 *
 * Intended for `installJit`. Applications may call it; libraries must not —
 * it decides for the application that hosts them.
 *
 * @param backend - The strategy to install, or `null` to restore the default.
 */
export const setBackend = (backend: Backend | null): void => {
    active = backend ?? CLOSURE_BACKEND;
};

/** The strategy currently installed, for a caller that wants to restore it. */
export const getBackend = (): Backend => active;

/**
 * Compiles a schema through whatever strategy is installed.
 *
 * @param ctx - Alias resolution and the compiler's caches.
 * @param schema - The schema to compile.
 * @param strictMode - Whether undeclared keys are rejected.
 */
export const resolveChecker: Backend = (ctx, schema, strictMode) => active(ctx, schema, strictMode);
