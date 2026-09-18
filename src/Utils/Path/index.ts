/**
 * Error-path helpers shared by the schema compiler and the legacy
 * `checkStructure` walker.
 *
 * These are plain functions rather than methods so the compiled closures can
 * call them without capturing `this`, and they are called **only on the
 * failure path**: building the dotted path eagerly costs one string
 * concatenation per field per validation, which otherwise dominates the cost
 * of a successful parse.
 */

/**
 * Builds the dotted path of a field inside its parent.
 *
 * @param parentPath - Path of the owning object, or `""` at the root.
 * @param key - The field name.
 * @returns `"user.address.city"` style path, or just `key` at the root.
 */
export const joinPath = (parentPath: string, key: string): string => (parentPath ? `${parentPath}.${key}` : key);

/**
 * Builds the path of an element inside an array field.
 *
 * @param arrayPath - Path of the array itself.
 * @param index - Zero-based index of the element.
 * @returns `"user.tags[2]"` style path.
 */
export const indexPath = (arrayPath: string, index: number): string => `${arrayPath}[${index}]`;
