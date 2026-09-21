/**
 * The validators, one import at a time.
 *
 * Every export here is an ordinary `Validator`: it returns the value on
 * success and throws a `TyperError` carrying a coded issue on failure. That is
 * exactly what a schema slot accepts, so these compose with the `core` entry
 * without either one knowing about the other:
 *
 * @example
 * import { parse } from '@illavv/run_typer/core';
 * import { isEmail, isPort } from '@illavv/run_typer/validators';
 *
 * parse({ email: isEmail, port: isPort }, payload);
 *
 * Importing one costs one validator. The class reaches the same
 * implementations, so behaviour is identical either way.
 */

export { isEmail, isURL, isUUID, isIPv4, isIPv6, isIP, isSemver, isSlug, isJWT, isMACAddress, isHexColor, isISODate, isBase64, isPhoneNumber, matches, isNonEmptyString } from './Validators/Strings';

export { isInteger, isInRange, isPositiveNumber, isPositiveInteger, isNegativeNumber, isNegativeInteger, isFiniteNumber, isSafeInteger, isPort } from './Validators/Numbers';

export { isLength, isEmpty, isNonEmpty, isNonEmptyArray, isOneOf } from './Validators/Sizes';

export { isString, isNumber, isBoolean, isArray, isObject, asString, asNumber, asBoolean, asArray, asObject, isPlainObject, isPromise, isInstanceOf } from './Validators/Guards';

export { isType } from './Core/Checkers';

export { TyperError } from './Errors/TyperError';
export type { Validator, ValidationIssue, IssueCode } from './Types/Typer';
