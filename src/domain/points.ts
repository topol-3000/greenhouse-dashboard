/**
 * Domain rules the screen derives from the configuration document.
 *
 * All of them read metadata the API already publishes — `point_kind`, `status`
 * and `data_type`. Nothing here hard-codes a point code, a metric name or a
 * temperature-only identifier, so a facility that starts reporting soil
 * moisture needs no dashboard change.
 */

import type { ConfigurationPointDto, TelemetrySampleDto } from "../api/types";

/** Lifecycle value that means a resource is in use. */
const ACTIVE_STATUS = "active";

/** `point_kind` of a point the owner monitors rather than drives. */
const MEASUREMENT_KIND = "measurement";

/** `data_type` values that can be placed on a numeric axis. */
const NUMERIC_DATA_TYPES = new Set(["float", "integer"]);

/** Quality value meaning the point has never reported. */
export const NO_DATA_QUALITY = "no_data";

/** Whether a point's values can be charted on a numeric axis. */
export function isNumericDataType(dataType: string): boolean {
  return NUMERIC_DATA_TYPES.has(dataType);
}

/** Whether a point is an active measurement point. */
export function isActiveMeasurementPoint(point: ConfigurationPointDto): boolean {
  return point.status === ACTIVE_STATUS && point.point_kind === MEASUREMENT_KIND;
}

/**
 * The measurement points this screen shows, in the order the API returned them.
 *
 * @param points The configuration document's points.
 * @returns Active measurement points only.
 */
export function activeMeasurementPoints(points: ConfigurationPointDto[]): ConfigurationPointDto[] {
  return points.filter(isActiveMeasurementPoint);
}

/**
 * The measurement points eligible for the history chart.
 *
 * A boolean or string point is deliberately not offered: plotting `false` as
 * `0` would invent a numeric reading the backend never published.
 *
 * @param points The configuration document's points.
 * @returns Active numeric measurement points.
 */
export function numericMeasurementPoints(points: ConfigurationPointDto[]): ConfigurationPointDto[] {
  return activeMeasurementPoints(points).filter((point) => isNumericDataType(point.data_type));
}

/**
 * Whether a point currently has a reading.
 *
 * A point that has never reported carries `value: null` and
 * `quality: "no_data"`. That is a distinct state from "reported zero", and the
 * two must never render the same way.
 */
export function hasCurrentValue(point: ConfigurationPointDto): boolean {
  return point.state.value !== null && point.state.value !== undefined;
}

/** One charted sample, already reduced to what the chart needs. */
export interface ChartSample {
  /** `observed_at` as epoch milliseconds, for a real time axis. */
  timestamp: number;
  /** The original ISO instant, for the accessible table and tooltips. */
  observedAt: string;
  value: number;
}

/**
 * Turn a point's history into chart samples ordered oldest to newest.
 *
 * The API answers newest-first; a chart drawn in that order would run backwards
 * in time. Samples whose value is not a finite number are dropped rather than
 * coerced, so a `null` reading leaves a gap instead of a false zero.
 *
 * @param samples History as returned by the API, newest first.
 * @returns Chart samples ascending by `observed_at`.
 */
export function toChartSamples(samples: TelemetrySampleDto[]): ChartSample[] {
  const points: ChartSample[] = [];
  for (const sample of samples) {
    if (typeof sample.value !== "number" || !Number.isFinite(sample.value)) {
      continue;
    }
    const timestamp = Date.parse(sample.observed_at);
    if (Number.isNaN(timestamp)) {
      continue;
    }
    points.push({ timestamp, observedAt: sample.observed_at, value: sample.value });
  }
  return points.sort((left, right) => left.timestamp - right.timestamp);
}

/** Smallest and largest value of a series, for the chart's text summary. */
export interface SeriesSummary {
  count: number;
  min: number | null;
  max: number | null;
  latest: number | null;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
}

/**
 * Summarise a charted series so the visualization is never the only source.
 *
 * @param samples Chart samples, ascending by time.
 * @returns The summary rendered next to the chart and read by screen readers.
 */
export function summariseSeries(samples: ChartSample[]): SeriesSummary {
  if (samples.length === 0) {
    return {
      count: 0,
      min: null,
      max: null,
      latest: null,
      firstObservedAt: null,
      lastObservedAt: null,
    };
  }
  let min = samples[0]!.value;
  let max = samples[0]!.value;
  for (const sample of samples) {
    if (sample.value < min) min = sample.value;
    if (sample.value > max) max = sample.value;
  }
  return {
    count: samples.length,
    min,
    max,
    latest: samples[samples.length - 1]!.value,
    firstObservedAt: samples[0]!.observedAt,
    lastObservedAt: samples[samples.length - 1]!.observedAt,
  };
}
