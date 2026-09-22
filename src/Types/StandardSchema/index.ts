/**
 * The Standard Schema v1 interface.
 *
 * Vendored verbatim from the specification rather than pulled in as a
 * dependency. The alternative is `@standard-schema/spec`, the official
 * types-only package: it would keep the definition in sync automatically, but
 * it would also be the first non-`tslib` entry in `dependencies` for ~40 lines
 * of frozen, versioned interface that the spec explicitly invites libraries to
 * copy. Copying keeps the install footprint at zero.
 *
 * @see https://github.com/standard-schema/standard-schema
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
    /** The Standard Schema properties. */
    readonly '~standard': StandardSchemaV1.Props<Input, Output>;
}

// eslint-disable-next-line @typescript-eslint/no-namespace -- shape fixed by the Standard Schema spec
export declare namespace StandardSchemaV1 {
    /** The Standard Schema properties interface. */
    export interface Props<Input = unknown, Output = Input> {
        /** The version number of the standard. */
        readonly version: 1;
        /** The vendor name of the schema library. */
        readonly vendor: string;
        /** Validates unknown input values. */
        readonly validate: (value: unknown) => Result<Output> | Promise<Result<Output>>;
        /** Inferred types associated with the schema. */
        readonly types?: Types<Input, Output> | undefined;
    }

    /** The result interface of the validate function. */
    export type Result<Output> = SuccessResult<Output> | FailureResult;

    /** The result interface if validation succeeds. */
    export interface SuccessResult<Output> {
        /** The typed output value. */
        readonly value: Output;
        /** The non-existent issues. */
        readonly issues?: undefined;
    }

    /** The result interface if validation fails. */
    export interface FailureResult {
        /** The issues of failed validation. */
        readonly issues: ReadonlyArray<Issue>;
    }

    /** The issue interface of the failure output. */
    export interface Issue {
        /** The error message of the issue. */
        readonly message: string;
        /** The path of the issue, if any. */
        readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined;
    }

    /** The path segment interface of the issue. */
    export interface PathSegment {
        /** The key representing a path segment. */
        readonly key: PropertyKey;
    }

    /** The Standard Schema types interface. */
    export interface Types<Input = unknown, Output = Input> {
        /** The input type of the schema. */
        readonly input: Input;
        /** The output type of the schema. */
        readonly output: Output;
    }

    /** Infers the input type of a Standard Schema. */
    export type InferInput<Schema extends StandardSchemaV1> = NonNullable<Schema['~standard']['types']>['input'];

    /** Infers the output type of a Standard Schema. */
    export type InferOutput<Schema extends StandardSchemaV1> = NonNullable<Schema['~standard']['types']>['output'];
}

/**
 * The vendor name Typer reports in `~standard.vendor`.
 *
 * Consumers use it to attribute an issue to the library that produced it, so
 * it must stay stable across releases.
 */
export const STANDARD_VENDOR = 'typer';
