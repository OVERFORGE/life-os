/**
 * STRUCTURAL REGEX FIXTURE (POSITIVE TEST)
 * Demonstrates strictly permitted structural / syntax format validators
 * allowed in the delivery tier under LifeOS V2.3.0 Rule 9.
 */

// Permitted: UUID validation regex
export const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Permitted: ISO-8601 UTC timestamp regex
export const ISO_TIMESTAMP_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

// Permitted: HTTP Bearer authorization header regex
export const BEARER_AUTH_REGEX = /^Bearer\s+([A-Za-z0-9\-._~+/]+=*)$/i;

// Permitted: Email address syntax validation
export const EMAIL_SYNTAX_REGEX = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;

// Permitted: Numeric sequence digits regex
export const DIGITS_ONLY_REGEX = /^\d+$/;

export function validateStructuralFormat(input: string): boolean {
  return UUID_V4_REGEX.test(input) || ISO_TIMESTAMP_REGEX.test(input) || BEARER_AUTH_REGEX.test(input);
}

