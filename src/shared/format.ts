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
