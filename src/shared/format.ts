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

interface RelativeDivision {
  readonly unit: Intl.RelativeTimeFormatUnit;
  readonly ms: number;
  /** The value at which the next unit up says the same span more plainly. */
  readonly limit: number;
}

/**
 * The units a relative instant is rounded to, finest first.
 *
 * `limit` is the point at which a value is better said in the next unit up, so
 * 59.6 seconds is "1 minute ago" rather than "60 seconds ago".
 */
const RELATIVE_DIVISIONS = [
  { unit: "second", ms: 1_000, limit: 60 },
  { unit: "minute", ms: 60_000, limit: 60 },
  { unit: "hour", ms: 3_600_000, limit: 24 },
] as const satisfies readonly RelativeDivision[];

/** The unit any span of a day or more is said in. There is nothing coarser. */
const RELATIVE_DAY = { unit: "day", ms: 86_400_000 } as const satisfies Omit<
  RelativeDivision,
  "limit"
>;

/**
 * Say how long ago an instant was, without saying anything about the value.
 *
 * This is a rendering of `observed_at` and nothing more. It rounds to a unit —
 * seconds, minutes, hours, days — and that rounding is the only judgement it
 * makes: it does not classify a reading as recent, old, fresh or stale, and it
 * invents no threshold at which one becomes the other. `DataQuality` already
 * carries the backend's own `stale`, and a second, local definition of "old"
 * would contradict it.
 *
 * `numeric: "always"` is deliberate. It keeps the output on the "1 day ago"
 * form rather than "yesterday", and stops the runtime producing "now", which
 * would read as a verdict about the reading rather than a statement about the
 * clock.
 *
 * An instant in the future is said to be in the future rather than clamped to
 * zero: a gateway whose clock runs ahead of the viewer's is a fact about the
 * data, and hiding it would make a wrong clock look like a right one.
 *
 * @param iso An instant as the contract published it.
 * @param now The moment to measure from, in milliseconds since the epoch.
 * @returns The phrase, or `null` when the instant cannot be parsed.
 */
export function formatRelativeInstant(iso: string, now: number = Date.now()): string | null {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    return null;
  }

  const deltaMs = parsed - now;
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "always" });

  for (const division of RELATIVE_DIVISIONS) {
    // `Math.round` preserves the sign of a value that rounds to zero, so an
    // instant a fraction of a second in the past reads "0 seconds ago" rather
    // than "in 0 seconds".
    const value = Math.round(deltaMs / division.ms);
    if (Math.abs(value) < division.limit) {
      return formatter.format(value, division.unit);
    }
  }
  return formatter.format(Math.round(deltaMs / RELATIVE_DAY.ms), RELATIVE_DAY.unit);
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
