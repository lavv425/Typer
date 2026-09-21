import type { TypeRegistry, Validator } from "../../Types/Typer";
import type { CompileContext, Resolver } from "../Compile";
import { createContext } from "../Compile";
import { BUILTIN_PREDICATES } from "../Predicates";

/**
 * Custom type aliases, as a value you hold rather than hidden instance state.
 *
 * The class keeps its aliases in a mutable `typesMap` that only it can reach,
 * which is exactly what stops the schema compiler from being usable without
 * constructing one. A registry is the same information as an ordinary value:
 * it carries its own compile context, so the caches are invalidated with it
 * simply by building a new one.
 */

/** Brand carrying the alias map in the type, with no runtime footprint. */
declare const REGISTRY: unique symbol;

/**
 * A set of custom aliases, carrying its `name -> produced type` map in its
 * type so `parse` can both alias-check a schema and infer its output.
 *
 * @template R - The alias map this registry provides
 */
export type Registry<R extends TypeRegistry> = {
    /** Type-level only; never present at runtime. */
    readonly [REGISTRY]?: R;
    /** Alias resolution plus the compiled-checker caches for these aliases. */
    readonly context: CompileContext;
};

/** Derives the `name -> produced type` map from a set of validators. */
export type RegistryOf<M> = { [K in keyof M]: M[K] extends Validator<infer T> ? T : never };

/** Recovers the alias map from a registry value's type. */
export type TypesOf<Reg> = Reg extends Registry<infer R> ? R : {};

/** Resolves only the built-in aliases. */
const builtinResolver: Resolver = (rawType: string) =>
    BUILTIN_PREDICATES[rawType.toLowerCase().trim()] ?? null;

/**
 * The context used when no registry is supplied — the overwhelmingly common
 * case.
 *
 * Shared at module level, which is safe precisely because it has no mutable
 * type table: nothing can register into it, so two callers can never observe
 * each other's aliases. Its caches are keyed by schema object identity, so
 * sharing them across callers is a benefit rather than a hazard.
 */
export const BUILTIN_CONTEXT: CompileContext = createContext(builtinResolver);

/**
 * Builds a registry of custom aliases.
 *
 * Each alias is an ordinary validator: it returns the value on success and
 * throws on failure, exactly like the ones a schema slot already accepts. The
 * difference is that a registered alias can be named by a type string, so it
 * composes with `?`, with `|` unions and with array slots.
 *
 * A custom alias shadows a built-in of the same name, which is the
 * `registerType(name, fn, true)` behaviour made explicit.
 *
 * @param aliases - The custom aliases, keyed by the name a schema will use.
 * @returns A registry to pass to `parse`, `safeParse` and `schema`.
 * @example
 * const registry = createRegistry({
 *     positive: (v: unknown): number => {
 *         if (typeof v !== 'number' || v <= 0) throw new TypeError('Must be positive');
 *         return v;
 *     },
 * });
 *
 * parse({ qty: 'positive' }, payload, { registry }); // { qty: number }
 */
export const createRegistry = <const M extends Record<string, Validator<unknown>>>(
    aliases: M,
): Registry<RegistryOf<M>> => {
    // Normalised once, so the hot path does not lowercase on every lookup.
    const normalised: Record<string, Validator<unknown>> = Object.create(null);
    for (const name of Object.keys(aliases)) {
        normalised[name.toLowerCase().trim()] = aliases[name];
    }

    const resolve: Resolver = (rawType: string) => {
        const norm = rawType.toLowerCase().trim();

        const custom = normalised[norm];
        if (custom !== undefined) {
            // Custom aliases throw to reject; the compiler wants a predicate,
            // so the throw is absorbed once here rather than per value.
            return (value: unknown): boolean => {
                try { custom(value); return true; } catch { return false; }
            };
        }

        return BUILTIN_PREDICATES[norm] ?? null;
    };

    return { context: createContext(resolve) };
};
