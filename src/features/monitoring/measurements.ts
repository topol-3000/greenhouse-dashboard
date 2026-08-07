/**
 * What the monitoring section is allowed to say, derived from the contract.
 *
 * Every rule here reads a field the API publishes — `point_kind`, `status`,
 * `data_type`, `unit`, `quality`, `observed_at` — and nothing else. No point is
 * classified by its name, its code or its `metric_type`, no unit is guessed
 * from what a metric usually carries, and no freshness threshold is invented:
 * `DataQuality` already contains the backend's own `stale`, and inventing a
 * second, local definition of "old" would contradict it.
 *
 * The transport shapes stay in `src/api`. What crosses into the screens is the
 * narrowed model below, which is also what keeps control and status points out
 * of monitoring by construction: their state is never copied into it.
 */

import type {
  ConfigurationPoint,
  ConfigurationPointState,
  DataQuality,
  FacilityConfigurationRead,
  PointDataType,
  StatusEnum,
  TelemetrySampleRead,
  ZonePointRole,
} from "../../api/contract";
import {
  ACTIVE_STATUS,
  GOOD_QUALITY,
  MEASUREMENT_POINT_KIND,
  NUMERIC_DATA_TYPES,
} from "../../api/contract";
import { sameResourceId } from "../../api/topology";

/** Whether a point's values can be placed on a numeric axis. */
export function isNumericDataType(dataType: PointDataType): boolean {
  return NUMERIC_DATA_TYPES.includes(dataType);
}

/**
 * Whether a point is a measurement the customer may monitor.
 *
 * Both halves are explicit contract fields. A `control` point called
 * "Greenhouse temperature control" is not a measurement, and an archived
 * measurement point is not one the portal presents as live.
 */
export function isActiveMeasurementPoint(point: ConfigurationPoint): boolean {
  return point.point_kind === MEASUREMENT_POINT_KIND && point.status === ACTIVE_STATUS;
}

/**
 * Whether a state projection carries a reading.
 *
 * `null` and an absent field both mean "nothing has been written here yet".
 * Everything else — including `0` and `false` — is a reading the backend
 * published and must render as one.
 */
export function hasReading(state: ConfigurationPointState): boolean {
  return state.value !== null && state.value !== undefined;
}

/**
 * Whether the backend attached a qualifier to a value it published.
 *
 * An allowlist against `good`, never a list of the bad ones. `uncertain`,
 * `stale`, `out_of_range`, `sensor_fault`, `simulated`, `manually_entered` and
 * any member the contract gains later are all things the backend said about its
 * own value, and a reading carrying one of them must not look like a reading
 * carrying none.
 *
 * This decides whether to show the qualifier, not how bad it is. The portal
 * ranks `DataQuality` members in no way, because the contract does not.
 *
 * @param quality The quality exactly as the API published it.
 * @returns Whether the reading is qualified in some way.
 */
export function isQualifiedQuality(quality: DataQuality): boolean {
  return quality !== GOOD_QUALITY;
}

/** One measurement point of a control zone, with its last known state. */
export interface ZoneMeasurement {
  readonly pointId: string;
  readonly code: string;
  readonly name: string;
  /** The quantity the backend says this point measures, verbatim. */
  readonly metricType: string;
  readonly dataType: PointDataType;
  /** The unit the API published, or `null` when it published none. */
  readonly unit: string | null;
  /** The part the point plays in this zone, from the zone's own link. */
  readonly role: ZonePointRole;
  readonly status: StatusEnum;
  /** Whether a telemetry history of this point can be charted. */
  readonly isNumeric: boolean;
  readonly state: ConfigurationPointState;
  /** Whether {@link state} carries a value at all. */
  readonly hasReading: boolean;
}

/** The monitoring inventory of one control zone. */
export interface ZoneMeasurementInventory {
  /**
   * Whether the configuration document contains this zone at all.
   *
   * The document leaves archived zones out by default, so a zone the topology
   * endpoints resolve can legitimately be absent here. That is a state to
   * explain, not an error and not an empty zone.
   */
  readonly zoneFound: boolean;
  readonly measurements: readonly ZoneMeasurement[];
}

/**
 * Read one zone's measurement points out of a facility configuration document.
 *
 * The document describes each point once, in its own `points` list, and each
 * zone refers to those points by identifier. The join is done on that
 * identifier — never on a code, a name or a position.
 *
 * @param configuration The facility's configuration document.
 * @param zoneId The zone to describe, as the route supplied it.
 * @returns The zone's active measurement points, in the document's own order.
 */
export function readZoneMeasurements(
  configuration: FacilityConfigurationRead,
  zoneId: string,
): ZoneMeasurementInventory {
  const zone = configuration.control_zones.find((candidate) =>
    sameResourceId(candidate.id, zoneId),
  );
  if (zone === undefined) {
    return { zoneFound: false, measurements: [] };
  }

  const byId = new Map(configuration.points.map((point) => [point.id.toLowerCase(), point]));

  const measurements: ZoneMeasurement[] = [];
  for (const link of zone.points) {
    const point = byId.get(link.point_id.toLowerCase());
    if (point === undefined || !isActiveMeasurementPoint(point)) {
      continue;
    }
    measurements.push({
      pointId: point.id,
      code: point.code,
      name: point.name,
      metricType: point.metric_type,
      dataType: point.data_type,
      unit: point.unit,
      role: link.role,
      status: point.status,
      isNumeric: isNumericDataType(point.data_type),
      state: point.state,
      hasReading: hasReading(point.state),
    });
  }
  return { zoneFound: true, measurements };
}

/** One telemetry sample, reduced to what a chart and a table need. */
export interface SeriesSample {
  /** The sample's own identifier, used as a stable key and as a tie-break. */
  readonly id: string;
  readonly observedAt: string;
  readonly receivedAt: string;
  readonly unit: string | null;
  readonly quality: DataQuality;
  /** The value exactly as the API sent it, not yet narrowed. */
  readonly value: unknown;
  /** `observed_at` as epoch milliseconds, or `null` when it does not parse. */
  readonly timestamp: number | null;
  /** The value as a finite number, or `null` when it is not one. */
  readonly numericValue: number | null;
}

/** A point's loaded telemetry window, ordered and classified for display. */
export interface TelemetrySeries {
  /** Every readable sample, ascending by `observed_at`, then by sample id. */
  readonly samples: readonly SeriesSample[];
  /** Samples that cannot be plotted: a non-numeric value or an unusable time. */
  readonly unplottableCount: number;
  /** Samples that can be plotted, in the same order. */
  readonly plottable: readonly SeriesSample[];
  /** The distinct units present, with `null` kept as its own distinct value. */
  readonly units: readonly (string | null)[];
  /** The one unit the whole window carries, when there is exactly one. */
  readonly unit: string | null;
  /** Whether the window mixes units and therefore cannot be one series. */
  readonly mixedUnits: boolean;
}

/**
 * Order and classify a telemetry window for display.
 *
 * The response order is not used: the telemetry operation documents none, so
 * trusting it would risk drawing time backwards. Samples are sorted by
 * `observed_at` and, for samples sharing an instant, by their identifier — a
 * total order, so the same window always renders the same way.
 *
 * Nothing is coerced. A value that is not a finite number and a timestamp that
 * does not parse make a sample unplottable; they do not become `0`, and they do
 * not remove the sample from the table where it can still be read.
 *
 * @param window The samples the API returned, in whatever order they arrived.
 * @returns The ordered series and what can be drawn from it.
 */
export function toTelemetrySeries(window: readonly TelemetrySampleRead[]): TelemetrySeries {
  const samples = window
    .map<SeriesSample>((sample) => {
      const parsed = Date.parse(sample.observed_at);
      const numeric =
        typeof sample.value === "number" && Number.isFinite(sample.value) ? sample.value : null;
      return {
        id: sample.id,
        observedAt: sample.observed_at,
        receivedAt: sample.received_at,
        unit: sample.unit,
        quality: sample.quality,
        value: sample.value,
        timestamp: Number.isNaN(parsed) ? null : parsed,
        numericValue: numeric,
      };
    })
    .sort((left, right) => {
      // A sample whose instant cannot be read is ordered last rather than
      // dropped, so the table still shows it and the chart still ignores it.
      if (left.timestamp === null || right.timestamp === null) {
        if (left.timestamp === right.timestamp) return left.id.localeCompare(right.id);
        return left.timestamp === null ? 1 : -1;
      }
      if (left.timestamp !== right.timestamp) return left.timestamp - right.timestamp;
      return left.id.localeCompare(right.id);
    });

  const plottable = samples.filter(
    (sample) => sample.numericValue !== null && sample.timestamp !== null,
  );

  const units: (string | null)[] = [];
  for (const sample of samples) {
    if (!units.includes(sample.unit)) {
      units.push(sample.unit);
    }
  }

  return {
    samples,
    plottable,
    unplottableCount: samples.length - plottable.length,
    units,
    unit: units.length === 1 ? (units[0] ?? null) : null,
    mixedUnits: units.length > 1,
  };
}

/** The numbers a chart's text summary reports, so the drawing is never alone. */
export interface SeriesSummary {
  readonly count: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly latest: number;
  readonly firstObservedAt: string;
  readonly lastObservedAt: string;
}

/**
 * Summarise a plottable series.
 *
 * @param samples Plottable samples, already ordered.
 * @returns The summary, or `null` when there is nothing to summarise.
 */
export function summariseSeries(samples: readonly SeriesSample[]): SeriesSummary | null {
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (first === undefined || last === undefined) {
    return null;
  }

  let minimum = first.numericValue ?? 0;
  let maximum = minimum;
  for (const sample of samples) {
    const value = sample.numericValue;
    if (value === null) continue;
    if (value < minimum) minimum = value;
    if (value > maximum) maximum = value;
  }

  return {
    count: samples.length,
    minimum,
    maximum,
    latest: last.numericValue ?? 0,
    firstObservedAt: first.observedAt,
    lastObservedAt: last.observedAt,
  };
}

/**
 * Split an ordered series into runs of consecutive plottable samples.
 *
 * A gap left by an unplottable sample must stay a gap: joining the samples on
 * either side of it would draw a straight line through a reading the backend
 * did not publish, which is exactly the interpolation the chart must not imply.
 *
 * @param samples Every readable sample, ordered.
 * @returns One array per unbroken run of plottable samples.
 */
export function toPlottableSegments(
  samples: readonly SeriesSample[],
): readonly (readonly SeriesSample[])[] {
  const segments: SeriesSample[][] = [];
  let current: SeriesSample[] = [];

  for (const sample of samples) {
    if (sample.numericValue === null || sample.timestamp === null) {
      if (current.length > 0) {
        segments.push(current);
        current = [];
      }
      continue;
    }
    current.push(sample);
  }
  if (current.length > 0) {
    segments.push(current);
  }
  return segments;
}
