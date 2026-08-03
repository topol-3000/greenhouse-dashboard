/**
 * Display formatting, kept apart from the transport DTOs.
 *
 * The separation is what makes missing data safe: a formatter is the only place
 * allowed to turn an absent reading into text, and it turns it into an explicit
 * dash rather than into a zero.
 */

import type { ConfigurationPointDto } from "../api/types";
import { hasCurrentValue } from "./points";

/** What is rendered wherever a value does not exist. */
export const NO_DATA_TEXT = "—";

/** Maximum fractional digits shown for a float reading. */
const MAX_FRACTION_DIGITS = 2;

/**
 * Format a point's current reading.
 *
 * @param point The point and its state.
 * @returns The reading, or {@link NO_DATA_TEXT} when there is none.
 */
export function formatPointValue(point: ConfigurationPointDto): string {
  if (!hasCurrentValue(point)) {
    return NO_DATA_TEXT;
  }
  const value = point.state.value;
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? value.toLocaleString()
      : value.toLocaleString(undefined, { maximumFractionDigits: MAX_FRACTION_DIGITS });
  }
  if (typeof value === "boolean") {
    return value ? "On" : "Off";
  }
  if (typeof value === "string") {
    return value;
  }
  return NO_DATA_TEXT;
}

/**
 * Format the unit snapshot beside a reading.
 *
 * A unit is only meaningful next to an actual value, and a boolean point has
 * none at all.
 */
export function formatUnit(point: ConfigurationPointDto): string {
  if (!hasCurrentValue(point) || point.unit === null || point.unit.length === 0) {
    return "";
  }
  return point.unit;
}

/** Turn a snake_case API token into a human label ("out_of_range" → "Out of range"). */
export function humaniseToken(token: string): string {
  if (token.length === 0) {
    return NO_DATA_TEXT;
  }
  const spaced = token.replaceAll("_", " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Format an ISO instant for display in the viewer's locale.
 *
 * @param iso The instant, or `null` when the point has never reported.
 * @returns A readable local time, or {@link NO_DATA_TEXT}.
 */
export function formatInstant(iso: string | null): string {
  if (iso === null || iso.length === 0) {
    return NO_DATA_TEXT;
  }
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    return NO_DATA_TEXT;
  }
  return new Date(parsed).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

/** Format a clock time only, used for the dense chart axis. */
export function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Format a number for the chart summary, tolerating `null`. */
export function formatNumber(value: number | null): string {
  if (value === null) {
    return NO_DATA_TEXT;
  }
  return Number.isInteger(value)
    ? value.toLocaleString()
    : value.toLocaleString(undefined, { maximumFractionDigits: MAX_FRACTION_DIGITS });
}
