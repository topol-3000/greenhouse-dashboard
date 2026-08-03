/**
 * Monitoring requests: a facility's configuration, and one point's telemetry.
 *
 * The endpoint and schema mapping this file implements — including why the
 * configuration document is the current-state source and what the telemetry
 * contract does *not* promise — is documented in [`contract.ts`](./contract.ts).
 *
 * Two rules shape the decoders below.
 *
 * The configuration document is decoded strictly: it is one read model, and a
 * response that does not match the contract is a named error state rather than
 * `undefined` reaching a card.
 *
 * A telemetry response is decoded per sample. One unreadable sample must not
 * discard the rest of a window, so unreadable samples are counted and reported
 * instead of thrown — the screen says how many it could not read rather than
 * pretending the point has no history.
 *
 * Identifiers arriving from a route or from a query string are untrusted text
 * and are percent-encoded by {@link resourcePath} before they reach a URL.
 */

import { API_V1_PREFIX } from "./config";
import type {
  ConfigurationPoint,
  ConfigurationPointState,
  ConfigurationZone,
  ConfigurationZonePoint,
  DataQuality,
  FacilityConfigurationRead,
  PointDataType,
  PointKind,
  StatusEnum,
  TelemetrySampleRead,
  ZonePointRole,
  ZoneType,
} from "./contract";
import { MAX_TELEMETRY_LIMIT } from "./contract";
import {
  asRecord,
  readNullableString,
  requireArray,
  requireContractEnum,
  requireString,
} from "./decode";
import { getJson } from "./http";
import { resourcePath } from "./topology";

const FACILITIES_PATH = `${API_V1_PREFIX}/facilities`;
const POINTS_PATH = `${API_V1_PREFIX}/points`;

/** Cancellation, carried by every monitoring request. */
export interface MonitoringRequestOptions {
  readonly signal?: AbortSignal | undefined;
}

/**
 * Read a value the contract declares without a type.
 *
 * `value` on `ConfigurationPointState` and `TelemetrySampleRead` has no schema:
 * the backend stores measurements in one `jsonb` column, so a value may be a
 * number, a boolean, a string or `null`. It is carried through as `unknown` and
 * narrowed where it is displayed, never coerced here.
 */
function readValue(record: Record<string, unknown>): unknown {
  return record["value"];
}

/** Decode a `ConfigurationPointState`. */
export function parseConfigurationPointState(body: unknown): ConfigurationPointState {
  const context = "point state";
  const record = asRecord(body, context);
  return {
    value: readValue(record),
    quality: requireContractEnum<DataQuality>(record, "quality", context),
    observed_at: readNullableString(record, "observed_at"),
  };
}

/** Decode a `ConfigurationPoint`, including the state the document carries. */
export function parseConfigurationPoint(body: unknown): ConfigurationPoint {
  const context = "configuration point";
  const record = asRecord(body, context);
  return {
    id: requireString(record, "id", context),
    code: requireString(record, "code", context),
    name: requireString(record, "name", context),
    point_kind: requireContractEnum<PointKind>(record, "point_kind", context),
    metric_type: requireString(record, "metric_type", context),
    data_type: requireContractEnum<PointDataType>(record, "data_type", context),
    unit: readNullableString(record, "unit"),
    status: requireContractEnum<StatusEnum>(record, "status", context),
    state: parseConfigurationPointState(record["state"]),
  };
}

/** Decode a `ConfigurationZonePoint`: the link only, never the point itself. */
export function parseConfigurationZonePoint(body: unknown): ConfigurationZonePoint {
  const context = "configuration zone point";
  const record = asRecord(body, context);
  return {
    point_id: requireString(record, "point_id", context),
    code: requireString(record, "code", context),
    role: requireContractEnum<ZonePointRole>(record, "role", context),
  };
}

/** Decode a `ConfigurationZone` and its composition. */
export function parseConfigurationZone(body: unknown): ConfigurationZone {
  const context = "configuration zone";
  const record = asRecord(body, context);
  return {
    id: requireString(record, "id", context),
    name: requireString(record, "name", context),
    code: requireString(record, "code", context),
    zone_type: requireContractEnum<ZoneType>(record, "zone_type", context),
    status: requireContractEnum<StatusEnum>(record, "status", context),
    points: requireArray(record, "points", context).map(parseConfigurationZonePoint),
  };
}

/** Decode a `FacilityConfigurationRead`. */
export function parseFacilityConfiguration(body: unknown): FacilityConfigurationRead {
  const context = "facility configuration";
  const record = asRecord(body, context);
  const facility = asRecord(record["facility"], "configuration facility");
  const site = asRecord(record["site"], "configuration site");
  return {
    facility: {
      id: requireString(facility, "id", "configuration facility"),
      name: requireString(facility, "name", "configuration facility"),
      code: requireString(facility, "code", "configuration facility"),
      facility_type: requireContractEnum(facility, "facility_type", "configuration facility"),
      status: requireContractEnum<StatusEnum>(facility, "status", "configuration facility"),
    },
    site: {
      id: requireString(site, "id", "configuration site"),
      name: requireString(site, "name", "configuration site"),
      code: requireString(site, "code", "configuration site"),
      timezone: requireString(site, "timezone", "configuration site"),
    },
    control_zones: requireArray(record, "control_zones", context).map(parseConfigurationZone),
    points: requireArray(record, "points", context).map(parseConfigurationPoint),
  };
}

/** Decode one `TelemetrySampleRead`. */
export function parseTelemetrySample(body: unknown): TelemetrySampleRead {
  const context = "telemetry sample";
  const record = asRecord(body, context);
  return {
    id: requireString(record, "id", context),
    point_id: requireString(record, "point_id", context),
    value: readValue(record),
    unit: readNullableString(record, "unit"),
    observed_at: requireString(record, "observed_at", context),
    received_at: requireString(record, "received_at", context),
    quality: requireContractEnum<DataQuality>(record, "quality", context),
  };
}

/**
 * One bounded telemetry window, plus what the portal could not read of it.
 *
 * `TelemetryHistoryRead` publishes `items` and nothing else — no `total`, no
 * cursor — so this type adds no count the backend did not give. The one number
 * it does add is local and honest: how many entries of *this* response failed to
 * match the sample schema and were therefore left out of `items`.
 */
export interface TelemetryWindow {
  /** The samples that matched `TelemetrySampleRead`, in arrival order. */
  readonly items: readonly TelemetrySampleRead[];
  /** Entries of the response that did not match the contract. */
  readonly unreadableCount: number;
  /** The `limit` the portal asked for, so a full window can be recognised. */
  readonly requestedLimit: number;
}

/**
 * Decode a `TelemetryHistoryRead` without letting one bad entry lose the rest.
 *
 * @param body The decoded response body.
 * @param requestedLimit The `limit` this response was asked for.
 * @returns The readable samples, and a count of the entries that were not.
 * @throws {ParseError} When the envelope itself has no `items` array.
 */
export function parseTelemetryWindow(body: unknown, requestedLimit: number): TelemetryWindow {
  const context = "telemetry history";
  const record = asRecord(body, context);
  const entries = requireArray(record, "items", context);

  const items: TelemetrySampleRead[] = [];
  let unreadableCount = 0;
  for (const entry of entries) {
    try {
      items.push(parseTelemetrySample(entry));
    } catch {
      unreadableCount += 1;
    }
  }
  return { items, unreadableCount, requestedLimit };
}

/**
 * Read one facility's configuration document.
 *
 * `include_archived` is deliberately not sent, so the contract's default
 * applies and archived zones and points are left out by the backend rather than
 * filtered here.
 *
 * @param facilityId The facility to describe, untrusted.
 * @param options Cancellation.
 * @returns The facility, its site, its zones and its points with their state.
 */
export async function fetchFacilityConfiguration(
  facilityId: string,
  options: MonitoringRequestOptions = {},
): Promise<FacilityConfigurationRead> {
  const payload = await getJson(`${resourcePath(FACILITIES_PATH, facilityId)}/configuration`, {
    signal: options.signal,
  });
  return parseFacilityConfiguration(payload.body);
}

/**
 * Read one bounded window of a point's telemetry history.
 *
 * No `from` or `to` is sent. Bounding the window by time would let the screen
 * describe it as "the last day", and the contract cannot support that claim:
 * `TelemetryHistoryRead` carries no total and no cursor, so a response that
 * fills the `limit` is indistinguishable from one that did not have to. The
 * portal therefore asks for a fixed number of samples and says exactly that.
 *
 * @param pointId The point whose history to read, untrusted.
 * @param options Cancellation and the window size.
 * @returns The readable samples and the limit they were requested with.
 */
export async function fetchPointTelemetry(
  pointId: string,
  options: MonitoringRequestOptions & { readonly limit: number },
): Promise<TelemetryWindow> {
  const limit = Math.min(Math.max(Math.trunc(options.limit), 1), MAX_TELEMETRY_LIMIT);
  const payload = await getJson(`${resourcePath(POINTS_PATH, pointId)}/telemetry`, {
    signal: options.signal,
    query: { limit },
  });
  return parseTelemetryWindow(payload.body, limit);
}
