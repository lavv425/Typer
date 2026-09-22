/**
 * The combinators, one import at a time.
 *
 * They compose with the `core` and `validators` entry points without any of
 * the three knowing about the others — every one of them produces or consumes
 * a plain `Validator`:
 *
 * @example
 * import { parse } from '@illavv/run_typer/core';
 * import { isEmail } from '@illavv/run_typer/validators';
 * import { arrayOf, optional, objectOf } from '@illavv/run_typer/combinators';
 *
 * parse({
 *     contacts: arrayOf(objectOf({ email: isEmail })),
 *     note: optional((v) => String(v)),
 * }, payload);
 */

export {
    nullable,
    optional,
    union,
    literal,
    refine,
    transform,
    withDefault,
    lazy,
    instanceOf,
} from './Combinators/Basic';

export {
    arrayOf,
    record,
    tuple,
} from './Combinators/Collections';

export {
    objectOf,
    discriminatedUnion,
    standard,
    asStandard,
} from './Combinators/Objects';

export type { ObjectOptions } from './Combinators/Objects';

export { STANDARD_VENDOR } from './Types/StandardSchema';
export type { StandardSchemaV1 } from './Types/StandardSchema';
export type { StandardValidator, Validator, DiscriminatedUnion } from './Types/Typer';
