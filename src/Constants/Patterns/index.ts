/**
 * Regular expressions used by the format validators.
 *
 * They live here rather than inline in the validators so each pattern is
 * compiled once at module load instead of on every call, and so the set of
 * accepted formats can be reviewed in one place.
 *
 * None of these use the `g` or `y` flags: those carry `lastIndex` state across
 * calls, which would make a shared instance return alternating results.
 */

/** Pragmatic email shape — a local part, `@`, and a dotted domain. */
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * International phone number, allowing `+`, parentheses, spaces, hyphens and
 * periods. Digit-count limits are enforced separately by the validator.
 */
export const PHONE = /^(\+?[1-9]\d{0,3})?[\s\-.]?(\(?\d{1,4}\)?[\s\-.]?)?[\d\s\-.()]{6,}$/;

/** Leading `+`, used to exclude the sign from the digit count. */
export const LEADING_PLUS = /^\+/;

/** RFC 4122 UUID, versions 1 to 5. */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** A run of digits, used to validate a single IPv4 octet. */
export const DIGITS = /^\d+$/;

/** CSS hex color: `#RGB`, `#RGBA`, `#RRGGBB` or `#RRGGBBAA`. */
export const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** ISO 8601 date, with optional time and timezone parts. */
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/**
 * Semantic Versioning 2.0.0, including optional pre-release and build
 * metadata. Taken from the specification's own recommended expression.
 */
export const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/**
 * URL-friendly slug: lowercase alphanumerics in hyphen-separated groups.
 * Rejects leading, trailing and repeated hyphens.
 */
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * JSON Web Token: three base64url segments separated by dots. The signature
 * may be empty, as it is for the `none` algorithm.
 */
export const JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;

/** MAC address in colon- or hyphen-separated form (`00:1A:2B:3C:4D:5E`). */
export const MAC_ADDRESS = /^(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i;
