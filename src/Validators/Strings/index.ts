import * as Patterns from "../../Constants/Patterns";
import { describing } from "../../Constants/Symbols";
import { assertString } from "../../Core/Checkers";
import { issueError } from "../../Utils/Issues";

/**
 * Format validators: string shapes with a name — email, URL, UUID, IP,
 * semver, slug, JWT, MAC, hex colour, ISO date, Base64, phone number.
 *
 * One export each, so importing `isEmail` costs an email validator rather
 * than the whole library. Moved out of the class unchanged: every message
 * and every issue code is what it was.
 */

/**
 * Checks if the provided parameter is a valid email address.
 * 
 * @param {unknown} p - The parameter to check.
 * @returns {string} The validated email string
 * @throws {TypeError} Throws if the parameter is not a valid email address.
 * @example
 * const email = typer.isEmail("test@example.com"); // email: string
 */
export const isEmail = /*#__PURE__*/ describing((p: unknown): string => {
    const str = assertString(p);
    if (!Patterns.EMAIL.test(str)) {
        throw issueError('invalid_format', `${p} must be a valid email address.`, 'email');
    }
    return str;
}, { type: 'string', format: 'email' });

/**
 * Checks if the provided parameter is a valid URL.
 * 
 * @param {unknown} p - The parameter to check.
 * @returns {String|Void}
 * @throws {TypeError} Throws if the parameter is not a valid URL.
 * @example
 * console.log(Typer.isURL("https://example.com")); // true
 * console.log(Typer.isURL("invalid-url")); // false
 */
export const isURL = /*#__PURE__*/ describing((p: unknown): string => {
    const str = assertString(p);
    try {
        new URL(str);
    } catch (_) {
        throw issueError('invalid_format', `${p} must be a valid URL.`, 'url');
    }
    return str;
}, { type: 'string', format: 'uri' });

/**
 * Checks that the parameter is a valid UUID (versions 1-5, RFC 4122).
 *
 * @param {unknown} p - The parameter to check
 * @returns {string} The validated UUID
 * @throws {TypeError} If `p` is not a valid UUID
 */
export const isUUID = /*#__PURE__*/ describing((p: unknown): string => {
    const str = assertString(p);
    if (!Patterns.UUID.test(str)) {
        throw issueError('invalid_format', `${p} must be a valid UUID.`, 'uuid');
    }
    return str;
}, { type: 'string', format: 'uuid' });

/**
 * Checks that the parameter is a valid IPv4 address (dotted-quad notation).
 *
 * @param {unknown} p - The parameter to check
 * @returns {string} The validated IPv4 address
 * @throws {TypeError} If `p` is not a valid IPv4 address
 */
export const isIPv4 = /*#__PURE__*/ describing((p: unknown): string => {
    const str = assertString(p);
    const parts = str.split('.');
    if (parts.length !== 4) {
        throw issueError('invalid_format', `${p} must be a valid IPv4 address.`, 'ipv4');
    }
    for (const part of parts) {
        if (!Patterns.DIGITS.test(part)) {
            throw issueError('invalid_format', `${p} must be a valid IPv4 address.`, 'ipv4');
        }
        const n = Number(part);
        // reject leading zeros (except the single "0") and out-of-range octets
        if (n < 0 || n > 255 || (part.length > 1 && part.startsWith('0'))) {
            throw issueError('invalid_format', `${p} must be a valid IPv4 address.`, 'ipv4');
        }
    }
    return str;
}, { type: 'string', format: 'ipv4' });

/**
 * Checks that the parameter is a valid IPv6 address.
 * Uses the `URL` constructor as a permissive parser: any string accepted as
 * the host portion of `http://[<addr>]/` is considered valid.
 *
 * @param {unknown} p - The parameter to check
 * @returns {string} The validated IPv6 address
 * @throws {TypeError} If `p` is not a valid IPv6 address
 */
export const isIPv6 = /*#__PURE__*/ describing((p: unknown): string => {
    const str = assertString(p);
    try {
        const url = new URL(`http://[${str}]`);
        // URL preserves the bracketed host; reject if parsing dropped digits
        /* istanbul ignore next — Node's URL parser keeps the brackets in
         * `hostname` for any address it accepts, so this guard fires only
         * if a future Node version changes that contract. */
        if (!url.hostname.startsWith('[') || !url.hostname.endsWith(']')) {
            throw new Error();
        }
    } catch {
        throw issueError('invalid_format', `${p} must be a valid IPv6 address.`, 'ipv6');
    }
    return str;
}, { type: 'string', format: 'ipv6' });

/**
 * Checks that the parameter is a valid IP address, of either version.
 *
 * @param {unknown} p - The parameter to check
 * @returns {string} The validated address
 * @throws {TypeError} If `p` is neither a valid IPv4 nor a valid IPv6 address
 * @example
 * typer.isIP('192.168.0.1');
 * typer.isIP('::1');
 */
export const isIP = /*#__PURE__*/ describing((p: unknown): string => {
    const str = assertString(p);
    try {
        return isIPv4(str);
    } catch {
        // Fall through: an IPv4 miss says nothing about IPv6.
    }
    try {
        return isIPv6(str);
    } catch {
        throw issueError('invalid_format', `${p} must be a valid IP address.`, 'ip');
    }
}, { type: 'string' });

/**
 * Checks that the parameter is a valid Semantic Versioning 2.0.0 string,
 * including optional pre-release and build metadata.
 *
 * @param {unknown} p - The parameter to check
 * @returns {string} The validated version
 * @throws {TypeError} If `p` is not a valid semver string
 * @example
 * typer.isSemver('1.0.0');
 * typer.isSemver('2.1.0-beta.1+build.5');
 */
export const isSemver = /*#__PURE__*/ describing((p: unknown): string => {
    const str = assertString(p);
    if (!Patterns.SEMVER.test(str)) {
        throw issueError('invalid_format', `${p} must be a valid semver string.`, 'semver');
    }
    return str;
}, { type: 'string' });

/**
 * Checks that the parameter is a URL-friendly slug: lowercase alphanumeric
 * groups separated by single hyphens.
 *
 * @param {unknown} p - The parameter to check
 * @returns {string} The validated slug
 * @throws {TypeError} If `p` is not a valid slug
 * @example
 * typer.isSlug('hello-world');
 */
export const isSlug = /*#__PURE__*/ describing((p: unknown): string => {
    const str = assertString(p);
    if (!Patterns.SLUG.test(str)) {
        throw issueError('invalid_format', `${p} must be a valid slug.`, 'slug');
    }
    return str;
}, { type: 'string' });

/**
 * Checks that the parameter is structurally a JSON Web Token: three
 * base64url segments separated by dots.
 *
 * This validates the shape only — it does **not** verify the signature or
 * decode the claims, and must not be used as an authentication check.
 *
 * @param {unknown} p - The parameter to check
 * @returns {string} The validated token
 * @throws {TypeError} If `p` does not have the shape of a JWT
 */
export const isJWT = /*#__PURE__*/ describing((p: unknown): string => {
    const str = assertString(p);
    if (!Patterns.JWT.test(str)) {
        throw issueError('invalid_format', `${p} must be a valid JWT.`, 'jwt');
    }
    return str;
}, { type: 'string' });

/**
 * Checks that the parameter is a MAC address in colon- or hyphen-separated
 * form.
 *
 * @param {unknown} p - The parameter to check
 * @returns {string} The validated address
 * @throws {TypeError} If `p` is not a valid MAC address
 * @example
 * typer.isMACAddress('00:1A:2B:3C:4D:5E');
 */
export const isMACAddress = /*#__PURE__*/ describing((p: unknown): string => {
    const str = assertString(p);
    if (!Patterns.MAC_ADDRESS.test(str)) {
        throw issueError('invalid_format', `${p} must be a valid MAC address.`, 'mac address');
    }
    return str;
}, { type: 'string' });

/**
 * Checks that the parameter is a valid CSS hex color (`#RGB`, `#RGBA`,
 * `#RRGGBB`, or `#RRGGBBAA`).
 *
 * @param {unknown} p - The parameter to check
 * @returns {string} The validated hex color
 * @throws {TypeError} If `p` is not a valid hex color
 */
export const isHexColor = /*#__PURE__*/ describing((p: unknown): string => {
    const str = assertString(p);
    if (!Patterns.HEX_COLOR.test(str)) {
        throw issueError('invalid_format', `${p} must be a valid hex color.`, 'hex color');
    }
    return str;
}, { type: 'string' });

/**
 * Checks that the parameter is a valid ISO 8601 date string and returns
 * the parsed `Date`. Accepts the formats produced by `Date#toISOString`
 * plus reasonable variants (e.g. with timezone offsets).
 *
 * @param {unknown} p - The parameter to check
 * @returns {Date} The parsed date (always valid)
 * @throws {TypeError} If `p` is not a valid ISO 8601 date string
 */
export const isISODate = /*#__PURE__*/ describing((p: unknown): Date => {
    const str = assertString(p);
    // Require at least YYYY-MM-DD; allow time and timezone parts.
    if (!Patterns.ISO_DATE.test(str)) {
        throw issueError('invalid_format', `${p} must be a valid ISO 8601 date string.`, 'iso date');
    }
    const date = new Date(str);
    if (Number.isNaN(date.getTime())) {
        throw issueError('invalid_format', `${p} must be a valid ISO 8601 date string.`, 'iso date');
    }
    return date;
}, { type: 'string', format: 'date-time' });

/**
 * Checks that the parameter is a syntactically valid Base64 string.
 * Supports both standard and URL-safe variants. Padding is required when
 * `requirePadding` is true (default).
 *
 * @param {unknown} p - The parameter to check
 * @param {{ urlSafe?: boolean, requirePadding?: boolean }} [opts] - Options
 * @returns {string} The validated Base64 string
 * @throws {TypeError} If `p` is not a valid Base64 string
 */
export const isBase64 = /*#__PURE__*/ describing((p: unknown, opts: { urlSafe?: boolean; requirePadding?: boolean } = {}): string => {
    const { urlSafe = false, requirePadding = true } = opts;
    const str = assertString(p);
    const charClass = urlSafe ? '[A-Za-z0-9_-]' : '[A-Za-z0-9+/]';
    const padded = requirePadding
        ? new RegExp(`^(?:${charClass}{4})*(?:${charClass}{2}==|${charClass}{3}=|${charClass}{4})$`)
        : new RegExp(`^(?:${charClass}{4})*(?:${charClass}{2,4}={0,2})?$`);
    if (str.length === 0 || !padded.test(str)) {
        throw issueError('invalid_format', `${p} must be a valid Base64 string.`, 'base64');
    }
    return str;
}, { type: 'string', contentEncoding: 'base64' });

/**
 * Checks if the provided parameter is a valid phone number.
 * 
 * @param {unknown} p - The parameter to check.
 * @returns {string} The validated phone number string
 * @throws {TypeError} Throws if the parameter is not a valid phone number.
 * @example
 * const phone = typer.isPhoneNumber("+1234567890"); // phone: string
 * const phone2 = typer.isPhoneNumber("(555) 123-4567"); // phone2: string
 */
export const isPhoneNumber = /*#__PURE__*/ describing((p: unknown): string => {
    const str = assertString(p);

    // Remove all non-digit characters except + for counting
    const digitsOnly = str.replace(/[^\d+]/g, '');

    // Check if empty after cleaning
    if (digitsOnly.length === 0) {
        throw issueError('invalid_format', `${p} must be a valid phone number.`, 'phone');
    }

    // More restrictive regex for phone number validation
    // Allows: +country code, parentheses, spaces, hyphens, and periods
    // Requires at least 7 digits, max 15 (international standard)
    if (!Patterns.PHONE.test(str)) {
        throw issueError('invalid_format', `${p} must be a valid phone number.`, 'phone');
    }

    // Count actual digits (excluding + sign)
    const digitCount = digitsOnly.replace(Patterns.LEADING_PLUS, '').length;

    // Validate digit count (7-15 digits for international numbers)
    if (digitCount < 7 || digitCount > 15) {
        throw issueError('invalid_format', `${p} must be a valid phone number with 7-15 digits.`, 'phone');
    }

    // Check for invalid patterns
    if (str.includes('..') || str.includes('--') || str.includes('  ')) {
        throw issueError('invalid_format', `${p} must be a valid phone number.`, 'phone');
    }

    return str;
}, { type: 'string' });

/**
 * Checks that the parameter is a string matching the given regular expression.
 *
 * @param {RegExp} regex - The pattern to match against
 * @param {unknown} p - The parameter to check
 * @returns {string} The validated string
 * @throws {TypeError} If `p` is not a string or does not match
 */
export const matches = (regex: RegExp, p: unknown): string => {
    const str = assertString(p);
    if (!regex.test(str)) {
        throw issueError('invalid_format', `${p} must match ${regex}.`, String(regex));
    }
    return str;
};

/**
 * Checks if the provided parameter is a non-empty string.
 * 
 * @param {unknown} p - The parameter to check.
 * @returns {string} The validated non-empty string
 * @throws {TypeError} Throws if the parameter is not a non-empty string.
 * @example
 * const name = typer.isNonEmptyString("Hello"); // name: string
 */
export const isNonEmptyString = /*#__PURE__*/ describing((p: unknown): string => {
    const str = assertString(p);
    if (str.trim().length === 0) {
        throw issueError('too_small', `${p} must be a non-empty string.`, undefined, undefined, { minimum: 1 });
    }
    return str;
}, { type: 'string', minLength: 1 });
