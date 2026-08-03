/**
 * Display formatting shared across the portal.
 *
 * Formatting lives apart from transport and state so that a value is stored,
 * fetched and reasoned about in one shape and rendered in another.
 */

/**
 * Format an instant for display in the viewer's own locale and timezone.
 *
 * @param epochMs Milliseconds since the epoch.
 * @returns A human-readable local date and time.
 */
export function formatInstant(epochMs: number): string {
  return new Date(epochMs).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

/**
 * Format an ISO instant from the API for display.
 *
 * The instant itself is never altered: the string is parsed and rendered in the
 * viewer's own locale and timezone, which is a presentation of the same moment
 * rather than a different one. A string the runtime cannot parse is returned
 * unchanged rather than rendered as a wrong date.
 *
 * @param iso An instant as the contract published it.
 * @returns A human-readable local date and time.
 */
export function formatIsoInstant(iso: string): string {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? iso : formatInstant(parsed);
}

/**
 * Format a measured number without losing the precision the API published.
 *
 * The default fraction limit of `Intl.NumberFormat` is three digits, which
 * would quietly round a reading. Ten is far past any sensor's resolution and
 * keeps the value the backend sent readable rather than rewritten.
 *
 * @param value A finite number from the API.
 * @returns The number, grouped for the viewer's locale.
 */
export function formatMeasurement(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 10 }).format(value);
}

/**
 * Format an axis tick, where a scale marker is wanted rather than a reading.
 *
 * @param value A finite number.
 * @returns A short label.
 */
export function formatAxisNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumSignificantDigits: 4 }).format(value);
}

/**
 * Format an instant as a short time-of-day label for a chart axis.
 *
 * @param epochMs Milliseconds since the epoch.
 * @returns A short local time.
 */
export function formatClock(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Present a value of unknown type for reading.
 *
 * The contract gives `value` no schema, so a measurement may arrive as a
 * number, a boolean, a string or `null`. Each is shown as what it is: `0` and
 * `false` are readings, `null` is not, and a shape the portal has no way to
 * present is said to be unreadable rather than dumped as raw JSON.
 *
 * @param value The value exactly as the API sent it.
 * @returns The text to render.
 */
export function formatContractUnknown(value: unknown): string {
  if (typeof value === "number") {
    return Number.isFinite(value) ? formatMeasurement(value) : "Not a usable number";
  }
  if (typeof value === "boolean") {
    return value ? "True" : "False";
  }
  if (typeof value === "string") {
    return value;
  }
  return "Value could not be read";
}

/**
 * Present a contract enum value as a label without changing what it means.
 *
 * The backend's vocabulary is kept: `nutrient_solution` is shown as "Nutrient
 * solution", never renamed to something the API did not say. The transform is
 * mechanical — underscores become spaces and the first letter is capitalised —
 * so a value the portal has never seen still renders instead of falling through
 * a lookup table into a blank.
 *
 * @param value The value exactly as the API sent it.
 * @returns The label to display.
 */
export function formatContractValue(value: string): string {
  const spaced = value.replaceAll("_", " ").trim();
  if (spaced === "") {
    return value;
  }
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
