/**
 * Defensive parsing of `greenhouse` read responses.
 *
 * Two rules shape this module:
 *
 * 1. Unknown additive fields are ignored. Every parser reads the fields it
 *    needs and copies nothing else, so a backend that adds a field ships
 *    without a dashboard release.
 * 2. A malformed *item* is dropped and counted; a malformed *document* raises
 *    {@link ParseError}. One unreadable point must not blank the screen, but a
 *    response that is not the documented shape at all is an error state rather
 *    than an empty one.
 */

import { ParseError } from "./errors";
import type {
  ConfigurationPointDto,
  ConfigurationZoneDto,
  ConfigurationZonePointDto,
  FacilityConfigurationDto,
  FacilityDto,
  PageDto,
  TelemetryHistoryDto,
  TelemetrySampleDto,
} from "./types";

/** Narrow an unknown value to a plain object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Read a required string field, or `undefined` when it is absent or empty. */
function optionalString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Read a string field that must be present and non-empty. */
function requiredString(source: Record<string, unknown>, key: string, context: string): string {
  const value = optionalString(source, key);
  if (value === undefined) {
    throw new ParseError(`${context} is missing a "${key}" string.`);
  }
  return value;
}

/** Read a nullable string field; anything that is not a string becomes `null`. */
function nullableString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" ? value : null;
}

/** Read a numeric field, falling back when it is absent or not finite. */
function numberOr(source: Record<string, unknown>, key: string, fallback: number): number {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Require an array field. */
function requiredArray(source: Record<string, unknown>, key: string, context: string): unknown[] {
  const value = source[key];
  if (!Array.isArray(value)) {
    throw new ParseError(`${context} is missing an "${key}" array.`);
  }
  return value;
}

/** Require the document root to be an object. */
function requiredRoot(value: unknown, context: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new ParseError(`${context} is not an object.`);
  }
  return value;
}

/** Parse one facility of the facility listing. */
function parseFacility(value: unknown): FacilityDto {
  const source = requiredRoot(value, "A facility");
  return {
    id: requiredString(source, "id", "A facility"),
    site_id: optionalString(source, "site_id") ?? "",
    name: requiredString(source, "name", "A facility"),
    code: optionalString(source, "code") ?? "",
    facility_type: optionalString(source, "facility_type") ?? "",
    status: optionalString(source, "status") ?? "",
  };
}

/**
 * Parse `GET /api/v1/facilities`.
 *
 * A facility without an `id` or `name` cannot be selected or labelled, so it is
 * dropped rather than rendered as a blank option.
 *
 * @param value The decoded response body.
 * @returns The facility page with unusable items removed.
 */
export function parseFacilityPage(value: unknown): PageDto<FacilityDto> {
  const source = requiredRoot(value, "The facility list");
  const rawItems = requiredArray(source, "items", "The facility list");
  const items: FacilityDto[] = [];
  for (const raw of rawItems) {
    try {
      items.push(parseFacility(raw));
    } catch {
      // A facility we cannot identify is not offered for selection.
    }
  }
  return {
    items,
    total: numberOr(source, "total", items.length),
    limit: numberOr(source, "limit", items.length),
    offset: numberOr(source, "offset", 0),
  };
}

/** Parse one point reference inside a zone's composition. */
function parseZonePoint(value: unknown): ConfigurationZonePointDto {
  const source = requiredRoot(value, "A zone point");
  return {
    point_id: requiredString(source, "point_id", "A zone point"),
    code: optionalString(source, "code") ?? "",
    role: optionalString(source, "role") ?? "",
  };
}

/** Parse one control zone of the configuration document. */
function parseZone(value: unknown): ConfigurationZoneDto {
  const source = requiredRoot(value, "A control zone");
  const rawPoints = Array.isArray(source["points"]) ? source["points"] : [];
  const points: ConfigurationZonePointDto[] = [];
  for (const raw of rawPoints) {
    try {
      points.push(parseZonePoint(raw));
    } catch {
      // An unreadable assignment does not invalidate its zone.
    }
  }
  return {
    id: requiredString(source, "id", "A control zone"),
    name: optionalString(source, "name") ?? "",
    code: optionalString(source, "code") ?? "",
    zone_type: optionalString(source, "zone_type") ?? "",
    status: optionalString(source, "status") ?? "",
    points,
  };
}

/**
 * Parse one point with its current state.
 *
 * `state` is optional in practice: a backend that omitted it entirely still
 * yields a usable point, reported as `no_data` rather than as a zero.
 */
function parsePoint(value: unknown): ConfigurationPointDto {
  const source = requiredRoot(value, "A point");
  const rawState = isRecord(source["state"]) ? source["state"] : {};
  return {
    id: requiredString(source, "id", "A point"),
    code: optionalString(source, "code") ?? "",
    name: optionalString(source, "name") ?? optionalString(source, "code") ?? "Unnamed point",
    point_kind: optionalString(source, "point_kind") ?? "",
    metric_type: optionalString(source, "metric_type") ?? "",
    data_type: optionalString(source, "data_type") ?? "",
    unit: nullableString(source, "unit"),
    status: optionalString(source, "status") ?? "",
    state: {
      value: "value" in rawState ? rawState["value"] : null,
      quality: optionalString(rawState, "quality") ?? "no_data",
      observed_at: nullableString(rawState, "observed_at"),
    },
  };
}

/**
 * Parse `GET /api/v1/facilities/{facility_id}/configuration`.
 *
 * @param value The decoded response body.
 * @returns The configuration document, with unreadable points counted.
 */
export function parseFacilityConfiguration(value: unknown): FacilityConfigurationDto {
  const context = "The facility configuration";
  const source = requiredRoot(value, context);

  const rawFacility = source["facility"];
  if (!isRecord(rawFacility)) {
    throw new ParseError(`${context} is missing its "facility" block.`);
  }
  const rawSite = isRecord(source["site"]) ? source["site"] : {};

  const rawZones = Array.isArray(source["control_zones"]) ? source["control_zones"] : [];
  const control_zones: ConfigurationZoneDto[] = [];
  for (const raw of rawZones) {
    try {
      control_zones.push(parseZone(raw));
    } catch {
      // A zone we cannot identify is left out of the composition.
    }
  }

  const rawPoints = requiredArray(source, "points", context);
  const points: ConfigurationPointDto[] = [];
  let malformed_point_count = 0;
  for (const raw of rawPoints) {
    try {
      points.push(parsePoint(raw));
    } catch {
      malformed_point_count += 1;
    }
  }

  return {
    facility: {
      id: requiredString(rawFacility, "id", `${context} facility`),
      name: optionalString(rawFacility, "name") ?? "",
      code: optionalString(rawFacility, "code") ?? "",
      facility_type: optionalString(rawFacility, "facility_type") ?? "",
      status: optionalString(rawFacility, "status") ?? "",
    },
    site: {
      id: optionalString(rawSite, "id") ?? "",
      name: optionalString(rawSite, "name") ?? "",
      code: optionalString(rawSite, "code") ?? "",
      timezone: optionalString(rawSite, "timezone") ?? "",
    },
    control_zones,
    points,
    malformed_point_count,
  };
}

/** Parse one telemetry sample. */
function parseSample(value: unknown): TelemetrySampleDto {
  const source = requiredRoot(value, "A telemetry sample");
  return {
    id: optionalString(source, "id") ?? "",
    point_id: optionalString(source, "point_id") ?? "",
    value: "value" in source ? source["value"] : null,
    unit: nullableString(source, "unit"),
    observed_at: requiredString(source, "observed_at", "A telemetry sample"),
    received_at: optionalString(source, "received_at") ?? "",
    quality: optionalString(source, "quality") ?? "",
  };
}

/**
 * Parse `GET /api/v1/points/{point_id}/telemetry`.
 *
 * A sample without a usable `observed_at` cannot be placed on a time axis, so
 * it is dropped and counted instead of plotted at an arbitrary position.
 *
 * @param value The decoded response body.
 * @returns The history in backend order (newest first), with bad samples removed.
 */
export function parseTelemetryHistory(value: unknown): TelemetryHistoryDto {
  const context = "The telemetry history";
  const source = requiredRoot(value, context);
  const rawItems = requiredArray(source, "items", context);
  const items: TelemetrySampleDto[] = [];
  let malformed_sample_count = 0;
  for (const raw of rawItems) {
    try {
      const sample = parseSample(raw);
      if (Number.isNaN(Date.parse(sample.observed_at))) {
        malformed_sample_count += 1;
        continue;
      }
      items.push(sample);
    } catch {
      malformed_sample_count += 1;
    }
  }
  return { items, malformed_sample_count };
}
