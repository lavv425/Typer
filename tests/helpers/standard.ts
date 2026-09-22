import type { StandardSchemaV1 } from '../../src/Typer';

/**
 * Calls `~standard.validate` the way a framework would and narrows the result
 * to the synchronous half.
 *
 * The spec lets `validate` return a promise; Typer never does. Asserting that
 * here keeps the assertion in one place and lets every caller read `issues`
 * without casting past the `Promise` arm of the union.
 */
export const validateSync = <T>(
    schema: StandardSchemaV1<unknown, T>,
    value: unknown,
): StandardSchemaV1.Result<T> => {
    const result = schema['~standard'].validate(value);
    if (result instanceof Promise) throw new Error('Typer validation must be synchronous');
    return result;
};

/**
 * The issues from a validation expected to fail, as plain records.
 *
 * Typer attaches `code` and the constraint metadata to each issue, which the
 * Standard Schema issue type does not declare — it is a floor, not a ceiling.
 * Reading them back needs one widening, kept here rather than at each call.
 */
export const issuesOf = (result: StandardSchemaV1.Result<unknown>): Record<string, unknown>[] => {
    if (result.issues === undefined) throw new Error('expected a failed validation');
    return result.issues as unknown as Record<string, unknown>[];
};
