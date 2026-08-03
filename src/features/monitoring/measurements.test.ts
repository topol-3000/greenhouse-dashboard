/**
 * The monitoring rules, tested apart from the screen that renders them.
 *
 * These are the decisions that would otherwise be invisible: which points count
 * as measurements, what order a history is drawn in, and which samples may be
 * plotted at all. Every case here comes from something `openapi.json` allows —
 * an unordered response, a `null` value, a unit that changes mid-window — not
 * from a shape invented to make a test pass.
 */

import { describe, expect, it } from "vitest";
import type { ConfigurationPoint, FacilityConfigurationRead } from "../../api/contract";
import {
  climateZone,
  northConfiguration,
  northConfigurationPoints,
  POINT_IDS,
  telemetrySample,
} from "../../test/fixtures";
import {
  hasReading,
  isNumericDataType,
  readZoneMeasurements,
  summariseSeries,
  toPlottableSegments,
  toTelemetrySeries,
} from "./measurements";

/** Rebuild the configuration document with a different set of points. */
function withPoints(points: readonly ConfigurationPoint[]): FacilityConfigurationRead {
  return { ...northConfiguration, points: [...points] };
}

describe("measurement discovery", () => {
  it("keeps only the points the contract calls measurements", () => {
    const { zoneFound, measurements } = readZoneMeasurements(northConfiguration, climateZone.id);

    expect(zoneFound).toBe(true);
    expect(measurements.map((measurement) => measurement.code)).toEqual([
      "north-air-temp",
      "north-co2",
      "north-soil-moisture",
      "north-leaf-wetness",
    ]);
  });

  it("classifies by point_kind, never by a point's name", () => {
    const { measurements } = readZoneMeasurements(northConfiguration, climateZone.id);

    // The control point is called "North air temperature vent" and the status
    // point "North humidity sensor". Both read like measurements and are not.
    expect(measurements.some((measurement) => measurement.pointId === POINT_IDS.vent)).toBe(false);
    expect(
      measurements.some((measurement) => measurement.pointId === POINT_IDS.humiditySensorStatus),
    ).toBe(false);
  });

  it("leaves out a measurement point the API marks archived", () => {
    const archived: ConfigurationPoint = {
      id: POINT_IDS.airTemp,
      code: "north-air-temp",
      name: "North air temperature",
      point_kind: "measurement",
      metric_type: "air_temperature",
      data_type: "float",
      unit: "degC",
      status: "archived",
      state: { value: 21.4, quality: "good", observed_at: "2026-01-04T09:05:00Z" },
    };
    const configuration = withPoints([
      archived,
      ...northConfigurationPoints.filter((point) => point.id !== POINT_IDS.airTemp),
    ]);

    const { measurements } = readZoneMeasurements(configuration, climateZone.id);
    expect(measurements.some((measurement) => measurement.code === "north-air-temp")).toBe(false);
  });

  it("reports a zone the configuration document does not contain", () => {
    const { zoneFound, measurements } = readZoneMeasurements(
      northConfiguration,
      "9b3e1f5c-8d30-4b49-9d8f-7b4d3e1f9999",
    );
    expect(zoneFound).toBe(false);
    expect(measurements).toHaveLength(0);
  });

  it("separates a reading of zero or false from no reading at all", () => {
    expect(hasReading({ value: 0, quality: "good", observed_at: null })).toBe(true);
    expect(hasReading({ value: false, quality: "good", observed_at: null })).toBe(true);
    expect(hasReading({ value: "", quality: "good", observed_at: null })).toBe(true);
    expect(hasReading({ value: null, quality: "no_data", observed_at: null })).toBe(false);
    expect(hasReading({ quality: "no_data", observed_at: null })).toBe(false);
  });

  it("allows a numeric axis only for the contract's numeric data types", () => {
    expect(isNumericDataType("float")).toBe(true);
    expect(isNumericDataType("integer")).toBe(true);
    expect(isNumericDataType("boolean")).toBe(false);
    expect(isNumericDataType("string")).toBe(false);
  });
});

describe("ordering a telemetry window", () => {
  it("sorts by observed_at rather than trusting the response order", () => {
    const series = toTelemetrySeries([
      telemetrySample({ id: "b", point_id: "p", value: 2, observed_at: "2026-01-04T10:00:00Z" }),
      telemetrySample({ id: "a", point_id: "p", value: 1, observed_at: "2026-01-04T09:00:00Z" }),
      telemetrySample({ id: "c", point_id: "p", value: 3, observed_at: "2026-01-04T11:00:00Z" }),
    ]);

    expect(series.samples.map((sample) => sample.numericValue)).toEqual([1, 2, 3]);
  });

  it("orders samples sharing an instant deterministically", () => {
    const at = "2026-01-04T09:00:00Z";
    const first = toTelemetrySeries([
      telemetrySample({ id: "b", point_id: "p", value: 2, observed_at: at }),
      telemetrySample({ id: "a", point_id: "p", value: 1, observed_at: at }),
    ]);
    const second = toTelemetrySeries([
      telemetrySample({ id: "a", point_id: "p", value: 1, observed_at: at }),
      telemetrySample({ id: "b", point_id: "p", value: 2, observed_at: at }),
    ]);

    expect(first.samples.map((sample) => sample.id)).toEqual(["a", "b"]);
    expect(second.samples.map((sample) => sample.id)).toEqual(["a", "b"]);
  });

  it("does not mutate the array it was given", () => {
    const input = [
      telemetrySample({ id: "b", point_id: "p", value: 2, observed_at: "2026-01-04T10:00:00Z" }),
      telemetrySample({ id: "a", point_id: "p", value: 1, observed_at: "2026-01-04T09:00:00Z" }),
    ];
    const before = input.map((sample) => sample.id);

    toTelemetrySeries(input);

    expect(input.map((sample) => sample.id)).toEqual(before);
  });
});

describe("what may be plotted", () => {
  it("keeps a non-numeric or unreadable sample out of the plot without dropping it", () => {
    const series = toTelemetrySeries([
      telemetrySample({ id: "a", point_id: "p", value: 1, observed_at: "2026-01-04T09:00:00Z" }),
      telemetrySample({ id: "b", point_id: "p", value: null, observed_at: "2026-01-04T09:01:00Z" }),
      telemetrySample({ id: "c", point_id: "p", value: "12", observed_at: "2026-01-04T09:02:00Z" }),
      telemetrySample({ id: "d", point_id: "p", value: 4, observed_at: "not-a-timestamp" }),
      telemetrySample({ id: "e", point_id: "p", value: 5, observed_at: "2026-01-04T09:04:00Z" }),
    ]);

    // Every sample survives for the table.
    expect(series.samples).toHaveLength(5);
    // Only the two that are a finite number at a readable instant are plotted,
    // and "12" is never parsed into a number the API did not send.
    expect(series.plottable.map((sample) => sample.numericValue)).toEqual([1, 5]);
    expect(series.unplottableCount).toBe(3);
  });

  it("rejects NaN and infinity rather than drawing them as zero", () => {
    const series = toTelemetrySeries([
      telemetrySample({ id: "a", point_id: "p", value: Number.NaN }),
      telemetrySample({ id: "b", point_id: "p", value: Number.POSITIVE_INFINITY }),
    ]);

    expect(series.plottable).toHaveLength(0);
    expect(series.samples.every((sample) => sample.numericValue === null)).toBe(true);
  });

  it("breaks the line across a gap instead of drawing through it", () => {
    const series = toTelemetrySeries([
      telemetrySample({ id: "a", point_id: "p", value: 1, observed_at: "2026-01-04T09:00:00Z" }),
      telemetrySample({ id: "b", point_id: "p", value: 2, observed_at: "2026-01-04T09:01:00Z" }),
      telemetrySample({ id: "c", point_id: "p", value: null, observed_at: "2026-01-04T09:02:00Z" }),
      telemetrySample({ id: "d", point_id: "p", value: 4, observed_at: "2026-01-04T09:03:00Z" }),
    ]);

    const segments = toPlottableSegments(series.samples);
    expect(segments.map((segment) => segment.map((sample) => sample.numericValue))).toEqual([
      [1, 2],
      [4],
    ]);
  });
});

describe("units in a window", () => {
  it("reports one unit when the whole window agrees", () => {
    const series = toTelemetrySeries([
      telemetrySample({ id: "a", point_id: "p", value: 1, unit: "degC" }),
      telemetrySample({ id: "b", point_id: "p", value: 2, unit: "degC" }),
    ]);

    expect(series.unit).toBe("degC");
    expect(series.mixedUnits).toBe(false);
  });

  it("refuses to call a window single-unit when the units disagree", () => {
    const series = toTelemetrySeries([
      telemetrySample({ id: "a", point_id: "p", value: 1, unit: "degC" }),
      telemetrySample({ id: "b", point_id: "p", value: 2, unit: "degF" }),
    ]);

    expect(series.mixedUnits).toBe(true);
    expect(series.unit).toBeNull();
    expect(series.units).toEqual(["degC", "degF"]);
  });

  it("treats an absent unit as its own value rather than filling one in", () => {
    const series = toTelemetrySeries([
      telemetrySample({ id: "a", point_id: "p", value: 1, unit: null }),
      telemetrySample({ id: "b", point_id: "p", value: 2, unit: "degC" }),
    ]);

    expect(series.mixedUnits).toBe(true);
    expect(series.units).toEqual([null, "degC"]);
  });
});

describe("summarising a series", () => {
  it("reports the count, extremes and bounds of the loaded samples", () => {
    const series = toTelemetrySeries([
      telemetrySample({ id: "a", point_id: "p", value: 5, observed_at: "2026-01-04T09:00:00Z" }),
      telemetrySample({ id: "b", point_id: "p", value: 1, observed_at: "2026-01-04T09:01:00Z" }),
      telemetrySample({ id: "c", point_id: "p", value: 3, observed_at: "2026-01-04T09:02:00Z" }),
    ]);

    expect(summariseSeries(series.plottable)).toEqual({
      count: 3,
      minimum: 1,
      maximum: 5,
      latest: 3,
      firstObservedAt: "2026-01-04T09:00:00Z",
      lastObservedAt: "2026-01-04T09:02:00Z",
    });
  });

  it("has nothing to summarise for an empty series", () => {
    expect(summariseSeries([])).toBeNull();
  });
});
