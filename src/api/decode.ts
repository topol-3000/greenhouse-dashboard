/**
 * Runtime decoding for responses from the cloud API.
 *
 * The generated contract types describe what the backend *promises*; these
 * helpers check what it actually sent before the portal renders it. A response
 * that does not match the contract becomes a {@link ParseError} — a named,
 * displayable state — rather than `undefined` leaking into a screen.
 *
 * Two rules follow the portal's existing health decoder:
 *
 * - unknown additive fields are ignored, never rejected, so a backend that
 *   publishes more later does not break this portal;
 * - an enum whose value the portal does not recognise is kept and rendered as
 *   it arrived, because a new `facility_type` is a new kind of greenhouse, not
 *   a broken response.
 */

import { ParseError } from "./errors";

/**
 * Narrow a decoded body to a JSON object.
 *
 * @param value The decoded body.
 * @param context What was being read, for the error message.
 * @returns The value as a record.
 * @throws {ParseError} When the value is not a JSON object.
 */
export function asRecord(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ParseError(`The cloud API's ${context} was not an object.`);
  }
  return value as Record<string, unknown>;
}

/**
 * Read a required string field.
 *
 * @param record The decoded object.
 * @param key The contract's field name.
 * @param context What was being read, for the error message.
 * @returns The field's value.
 * @throws {ParseError} When the field is missing or is not a string.
 */
export function requireString(
  record: Record<string, unknown>,
  key: string,
  context: string,
): string {
  const value = record[key];
  if (typeof value !== "string") {
    throw new ParseError(`The cloud API's ${context} has no readable "${key}".`);
  }
  return value;
}

/**
 * Read a required enum field without rejecting an unrecognised value.
 *
 * The contract's enums are open in practice: the backend may add a facility
 * type or a zone type without this portal being redeployed. The value is
 * therefore required to be a string and returned as the contract's union, and
 * every screen renders it through a formatter that accepts any string rather
 * than switching on it exhaustively.
 *
 * @param record The decoded object.
 * @param key The contract's field name.
 * @param context What was being read, for the error message.
 * @returns The field's value, typed as the contract's union.
 * @throws {ParseError} When the field is missing or is not a string.
 */
export function requireContractEnum<T extends string>(
  record: Record<string, unknown>,
  key: string,
  context: string,
): T {
  return requireString(record, key, context) as T;
}

/**
 * Read a required number field.
 *
 * @param record The decoded object.
 * @param key The contract's field name.
 * @param context What was being read, for the error message.
 * @returns The field's value.
 * @throws {ParseError} When the field is missing or is not a finite number.
 */
export function requireNumber(
  record: Record<string, unknown>,
  key: string,
  context: string,
): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ParseError(`The cloud API's ${context} has no readable "${key}".`);
  }
  return value;
}

/**
 * Read a required boolean field.
 *
 * Nothing is coerced. The contract's own command boundary refuses `1`, `"on"`
 * and `"true"` rather than guessing at them, and a reader that accepted what the
 * writer refuses would be the place a wrong guess entered the portal.
 *
 * @param record The decoded object.
 * @param key The contract's field name.
 * @param context What was being read, for the error message.
 * @returns The field's value.
 * @throws {ParseError} When the field is missing or is not a boolean.
 */
export function requireBoolean(
  record: Record<string, unknown>,
  key: string,
  context: string,
): boolean {
  const value = record[key];
  if (typeof value !== "boolean") {
    throw new ParseError(`The cloud API's ${context} has no readable "${key}".`);
  }
  return value;
}

/**
 * Read a field the contract declares as nullable string.
 *
 * @param record The decoded object.
 * @param key The contract's field name.
 * @returns The string, or `null` when the backend sent null or omitted it.
 */
export function readNullableString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

/**
 * Read a required array field.
 *
 * @param record The decoded object.
 * @param key The contract's field name.
 * @param context What was being read, for the error message.
 * @returns The array, still untyped per element.
 * @throws {ParseError} When the field is missing or is not an array.
 */
export function requireArray(
  record: Record<string, unknown>,
  key: string,
  context: string,
): readonly unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    throw new ParseError(`The cloud API's ${context} has no readable "${key}" list.`);
  }
  return value as readonly unknown[];
}
