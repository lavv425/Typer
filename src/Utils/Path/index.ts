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

/**
 * Inverse of {@link joinPath}/{@link indexPath}: turns a dotted path back into
 * its segments, with array indices as numbers.
 *
 * Standard Schema reports `issue.path` as a segment array, while Typer builds
 * and stores it as a string — this is the adapter between the two.
 *
 * Object keys containing `.` or `[` are indistinguishable from separators once
 * joined, so they split here too. Typer never produces such a path itself
 * (schema keys with those characters would already be ambiguous in `errors[]`),
 * and reconstructing them would require changing the stored representation.
 *
 * @param path - A path as produced by `joinPath`/`indexPath`, `""` for the root.
 * @returns The segments, e.g. `"items[0].qty"` -> `['items', 0, 'qty']`.
 */
export const splitPath = (path: string): Array<string | number> => {
    if (path === '') return [];

    const segments: Array<string | number> = [];
    let current = '';

    for (let i = 0; i < path.length; i++) {
        const char = path[i];

        if (char === '.') {
            if (current !== '') {
                segments.push(current);
                current = '';
            }
            continue;
        }

        if (char === '[') {
            if (current !== '') {
                segments.push(current);
                current = '';
            }
            const end = path.indexOf(']', i);
            // Unterminated bracket: keep the remainder verbatim rather than
            // inventing a segment, so nothing is silently dropped.
            if (end === -1) {
                current = path.slice(i);
                break;
            }
            const raw = path.slice(i + 1, end);
            const index = Number(raw);
            segments.push(raw !== '' && Number.isInteger(index) ? index : raw);
            i = end;
            continue;
        }

        current += char;
    }

    if (current !== '') segments.push(current);
    return segments;
};
