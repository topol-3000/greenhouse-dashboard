/**
 * `formatRelativeInstant` is the one formatter that could quietly become a
 * judgement about a reading, so what is tested is the judgement it refuses to
 * make: which unit it rounds to, that it keeps the direction of the clock, and
 * that it never reaches for the "yesterday" wording that would read as a verdict
 * rather than a measurement.
 *
 * The expected strings are built with the same `Intl` options rather than
 * written out in English, so the assertions pin the rounding and the sign — the
 * parts this module decides — without pinning the runtime's locale, which it
 * does not.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { formatRelativeInstant } from "./format";

const NOW = Date.parse("2026-01-04T12:00:00Z");

/** What the runtime says for a value and a unit, in the viewer's own locale. */
function expected(value: number, unit: Intl.RelativeTimeFormatUnit): string {
  return new Intl.RelativeTimeFormat(undefined, { numeric: "always" }).format(value, unit);
}

/** An instant the given number of milliseconds away from {@link NOW}. */
function iso(offsetMs: number): string {
  return new Date(NOW + offsetMs).toISOString();
}

afterEach(() => {
  vi.useRealTimers();
});

describe("formatRelativeInstant", () => {
  it("says a recent instant in seconds", () => {
    expect(formatRelativeInstant(iso(-45_000), NOW)).toBe(expected(-45, "second"));
  });

  it("keeps an instant that rounds to zero in the past", () => {
    // -0 rather than 0: a reading taken a fraction of a second ago has been
    // taken, and "in 0 seconds" would say it is yet to happen.
    expect(formatRelativeInstant(iso(-400), NOW)).toBe(expected(-0, "second"));
  });

  it("says minutes, hours and days as the span grows", () => {
    expect(formatRelativeInstant(iso(-2 * 60_000), NOW)).toBe(expected(-2, "minute"));
    expect(formatRelativeInstant(iso(-6 * 3_600_000), NOW)).toBe(expected(-6, "hour"));
    expect(formatRelativeInstant(iso(-3 * 86_400_000), NOW)).toBe(expected(-3, "day"));
  });

  it("promotes a span to the next unit rather than overrunning one", () => {
    expect(formatRelativeInstant(iso(-59_600), NOW)).toBe(expected(-1, "minute"));
    expect(formatRelativeInstant(iso(-59.6 * 60_000), NOW)).toBe(expected(-1, "hour"));
    expect(formatRelativeInstant(iso(-23.6 * 3_600_000), NOW)).toBe(expected(-1, "day"));
  });

  it("has no coarser unit than a day", () => {
    expect(formatRelativeInstant(iso(-400 * 86_400_000), NOW)).toBe(expected(-400, "day"));
  });

  it("reports an instant in the future instead of clamping it to zero", () => {
    // A gateway whose clock runs ahead of the viewer's is a fact about the
    // data. Hiding it would make a wrong clock look like a right one.
    expect(formatRelativeInstant(iso(2 * 60_000), NOW)).toBe(expected(2, "minute"));
  });

  it("never uses the wording that would read as a verdict", () => {
    // `numeric: "auto"` is what produces "yesterday", "today" and "now". Those
    // describe the reading rather than the clock, so the day before must not
    // render the way `auto` would render it.
    const auto = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    const yesterday = formatRelativeInstant(iso(-86_400_000), NOW);

    expect(yesterday).toBe(expected(-1, "day"));
    if (auto.format(-1, "day") !== expected(-1, "day")) {
      expect(yesterday).not.toBe(auto.format(-1, "day"));
    }
  });

  it("measures from now when no moment is given", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    expect(formatRelativeInstant(iso(-5 * 60_000))).toBe(expected(-5, "minute"));
  });

  it("returns nothing for an instant it cannot parse", () => {
    // The caller still has the contract's own string to show. Guessing a date
    // out of an unreadable one would be inventing the very thing being read.
    expect(formatRelativeInstant("not an instant", NOW)).toBeNull();
    expect(formatRelativeInstant("", NOW)).toBeNull();
  });
});
