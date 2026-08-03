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
