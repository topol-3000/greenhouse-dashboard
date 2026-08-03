/**
 * The domain rules that decide what the screen shows.
 *
 * The point of these is that nothing here names a specific metric: the rules
 * read `point_kind`, `status` and `data_type`, so a new sensor type is covered
 * by the same assertions.
 */

import { describe, expect, it } from "vitest";
import type { ConfigurationPointDto } from "../api/types";
import { facilityConfiguration, POINT_IDS, telemetryHistory } from "../test/fixtures";
import {
  activeMeasurementPoints,
  hasCurrentValue,
  isNumericDataType,
  numericMeasurementPoints,
  summariseSeries,
  toChartSamples,
} from "./points";

const points = facilityConfiguration.points as unknown as ConfigurationPointDto[];

describe("measurement point derivation", () => {
  it("keeps active measurement points and drops control points", () => {
    const codes = activeMeasurementPoints(points).map((point) => point.code);

    expect(codes).toEqual(["air_temperature", "air_humidity", "soil_moisture", "fan_running"]);
    expect(codes).not.toContain("fan_power");
  });

  it("drops an archived measurement point", () => {
    const archived: ConfigurationPointDto = {
      ...points[0]!,
      id: "archived",
      code: "old_sensor",
      status: "archived",
    };

    const codes = activeMeasurementPoints([...points, archived]).map((point) => point.code);

    expect(codes).not.toContain("old_sensor");
  });

  it("offers only numeric points for the chart", () => {
    const codes = numericMeasurementPoints(points).map((point) => point.code);

    expect(codes).toEqual(["air_temperature", "air_humidity", "soil_moisture"]);
  });

  it("does not offer a boolean measurement point as a chart subject", () => {
    const chartable = numericMeasurementPoints(points).map((point) => point.id);

    expect(chartable).not.toContain(POINT_IDS.fanRunning);
  });

  it("treats float and integer as numeric and everything else as not", () => {
    expect(isNumericDataType("float")).toBe(true);
    expect(isNumericDataType("integer")).toBe(true);
    expect(isNumericDataType("boolean")).toBe(false);
    expect(isNumericDataType("string")).toBe(false);
    expect(isNumericDataType("a_type_added_later")).toBe(false);
  });

  it("separates a missing reading from a reading of zero", () => {
    const missing = points.find((point) => point.code === "soil_moisture")!;
    const zero: ConfigurationPointDto = {
      ...missing,
      state: { value: 0, quality: "good", observed_at: "2026-08-01T09:00:00Z" },
    };

    expect(hasCurrentValue(missing)).toBe(false);
    expect(hasCurrentValue(zero)).toBe(true);
  });
});

describe("chart samples", () => {
  it("reverses the backend's newest-first history into time order", () => {
    const samples = toChartSamples(telemetryHistory(100).items);

    expect(samples).toHaveLength(100);
    for (let index = 1; index < samples.length; index += 1) {
      expect(samples[index]!.timestamp).toBeGreaterThanOrEqual(samples[index - 1]!.timestamp);
    }
  });

  it("keeps at most the 100 samples the API was asked for", () => {
    expect(toChartSamples(telemetryHistory(100).items)).toHaveLength(100);
  });

  it("drops a non-numeric value instead of plotting it as zero", () => {
    const history = telemetryHistory(3);
    const withNull = [
      { ...history.items[0]!, value: null },
      { ...history.items[1]!, value: "warm" },
      history.items[2]!,
    ];

    const samples = toChartSamples(withNull);

    expect(samples).toHaveLength(1);
    expect(samples.every((sample) => typeof sample.value === "number")).toBe(true);
  });

  it("summarises a series so the chart is not the only source", () => {
    const summary = summariseSeries(toChartSamples(telemetryHistory(10).items));

    expect(summary.count).toBe(10);
    expect(summary.min).not.toBeNull();
    expect(summary.max).not.toBeNull();
    expect(summary.max!).toBeGreaterThanOrEqual(summary.min!);
    expect(summary.latest).toBe(summary.max);
  });

  it("summarises an empty series without inventing numbers", () => {
    const summary = summariseSeries([]);

    expect(summary).toEqual({
      count: 0,
      min: null,
      max: null,
      latest: null,
      firstObservedAt: null,
      lastObservedAt: null,
    });
  });
});
