/**
 * Topology requests: sites, facilities, control zones and zone composition.
 *
 * The endpoint and schema mapping this file implements is documented in
 * [`contract.ts`](./contract.ts). Everything below goes through the portal's
 * one HTTP boundary, so base URL configuration, error normalisation and
 * cancellation are not re-implemented per resource.
 *
 * Identifiers arriving from a route are untrusted text. They are never
 * concatenated into a path raw: {@link resourcePath} percent-encodes them, so a
 * slash, a query character or an over-long value in the address bar becomes a
 * request the backend rejects rather than a request to a different endpoint.
 * The contract types identifiers as UUID strings and the portal treats them as
 * opaque — it never assumes they are numeric, sequential or short.
 */

import { API_V1_PREFIX } from "./config";
import type {
  ControlZoneRead,
  FacilityRead,
  FacilityType,
  SiteRead,
  StatusEnum,
  ZonePointAssignmentRead,
  ZonePointRole,
  ZoneType,
} from "./contract";
import { asRecord, readNullableString, requireContractEnum, requireString } from "./decode";
import { ApiError } from "./errors";
import { getJson } from "./http";
import type { Collection, PageWindow } from "./pagination";
import { collectPages, parsePage } from "./pagination";

const SITES_PATH = `${API_V1_PREFIX}/sites`;
const FACILITIES_PATH = `${API_V1_PREFIX}/facilities`;
const CONTROL_ZONES_PATH = `${API_V1_PREFIX}/control-zones`;

/**
 * Build the path of one resource from an untrusted identifier.
 *
 * @param collection The collection path, starting with `/`.
 * @param id The identifier as it arrived, typically from a route parameter.
 * @returns A path with the identifier percent-encoded.
 */
export function resourcePath(collection: string, id: string): string {
  return `${collection}/${encodeURIComponent(id)}`;
}

/**
 * Compare two identifiers from the contract.
 *
 * Both sides are trimmed and lower-cased because one of them normally comes
 * from the address bar, where a UUID may have been typed or copied in a
 * different case. Nothing else about the value is assumed.
 *
 * @param a One identifier.
 * @param b The other identifier.
 * @returns Whether they name the same resource.
 */
export function sameResourceId(a: string | undefined, b: string | undefined): boolean {
  if (a === undefined || b === undefined) {
    return false;
  }
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Whether a failure means "the cloud API has no such resource".
 *
 * `404` is the plain case. `422` is included because the contract types every
 * topology identifier as a UUID: an address bar holding anything else is
 * rejected by request validation, and to the customer that is still "this
 * facility does not exist" rather than a portal fault. Both are resource-level
 * states, never a global outage.
 *
 * @param error A caught value.
 * @returns Whether it identifies a missing resource.
 */
export function isResourceMissing(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 422);
}

/** Decode a `SiteRead`. */
export function parseSite(body: unknown): SiteRead {
  const record = asRecord(body, "site");
  return {
    id: requireString(record, "id", "site"),
    name: requireString(record, "name", "site"),
    code: requireString(record, "code", "site"),
    timezone: requireString(record, "timezone", "site"),
    status: requireContractEnum<StatusEnum>(record, "status", "site"),
    created_at: requireString(record, "created_at", "site"),
    updated_at: requireString(record, "updated_at", "site"),
  };
}

/** Decode a `FacilityRead`. */
export function parseFacility(body: unknown): FacilityRead {
  const record = asRecord(body, "facility");
  return {
    id: requireString(record, "id", "facility"),
    site_id: requireString(record, "site_id", "facility"),
    name: requireString(record, "name", "facility"),
    code: requireString(record, "code", "facility"),
    facility_type: requireContractEnum<FacilityType>(record, "facility_type", "facility"),
    status: requireContractEnum<StatusEnum>(record, "status", "facility"),
    created_at: requireString(record, "created_at", "facility"),
    updated_at: requireString(record, "updated_at", "facility"),
  };
}

/** Decode a `ControlZoneRead`. */
export function parseControlZone(body: unknown): ControlZoneRead {
  const record = asRecord(body, "control zone");
  return {
    id: requireString(record, "id", "control zone"),
    facility_id: requireString(record, "facility_id", "control zone"),
    name: requireString(record, "name", "control zone"),
    code: requireString(record, "code", "control zone"),
    zone_type: requireContractEnum<ZoneType>(record, "zone_type", "control zone"),
    status: requireContractEnum<StatusEnum>(record, "status", "control zone"),
    created_at: requireString(record, "created_at", "control zone"),
    updated_at: requireString(record, "updated_at", "control zone"),
  };
}

/**
 * Decode a `ZonePointAssignmentRead`.
 *
 * The point's descriptive fields are copied into the assignment by the
 * contract, which is what lets the ControlZone workspace list a zone's
 * composition without a request per point. No value, state or reading is part
 * of this schema, and the portal reads none.
 */
export function parseZonePointAssignment(body: unknown): ZonePointAssignmentRead {
  const context = "zone point assignment";
  const record = asRecord(body, context);
  return {
    id: requireString(record, "id", context),
    control_zone_id: requireString(record, "control_zone_id", context),
    point_id: requireString(record, "point_id", context),
    role: requireContractEnum<ZonePointRole>(record, "role", context),
    created_at: requireString(record, "created_at", context),
    point_code: requireString(record, "point_code", context),
    point_name: requireString(record, "point_name", context),
    point_kind: requireContractEnum(record, "point_kind", context),
    data_type: requireContractEnum(record, "data_type", context),
    unit: readNullableString(record, "unit"),
    reported_point_id: readNullableString(record, "reported_point_id"),
  };
}

/** Fetch options shared by every topology request. */
export interface TopologyRequestOptions {
  readonly signal?: AbortSignal | undefined;
}

/**
 * The page window as query parameters.
 *
 * Exported so every paginated collection sends the same two parameters in the
 * same order: the window first, then whatever filter the operation takes. One
 * filter set is then always one URL, which is what the request tests assert.
 */
export function windowQuery(window: PageWindow): Record<string, string | number> {
  return { limit: window.limit, offset: window.offset };
}

/**
 * List every site the cloud API has, following pagination.
 *
 * No `status` filter is sent: the contract's default is every lifecycle state,
 * and the portal shows the `status` each site actually carries rather than
 * hiding rows behind a filter the customer did not choose.
 *
 * @param options Cancellation.
 * @returns The sites, the backend's total, and whether the two agree.
 */
export async function fetchSites(
  options: TopologyRequestOptions = {},
): Promise<Collection<SiteRead>> {
  return collectPages<SiteRead>(async (window) => {
    const payload = await getJson(SITES_PATH, {
      signal: options.signal,
      query: windowQuery(window),
    });
    return parsePage(payload.body, parseSite, "site page");
  });
}

/**
 * List facilities, following pagination.
 *
 * @param options Cancellation, and an optional `site_id` filter applied by the
 *   backend rather than by the portal.
 * @returns The facilities, the backend's total, and whether the two agree.
 */
export async function fetchFacilities(
  options: TopologyRequestOptions & { readonly siteId?: string | undefined } = {},
): Promise<Collection<FacilityRead>> {
  return collectPages<FacilityRead>(async (window) => {
    const query: Record<string, string | number> = windowQuery(window);
    if (options.siteId !== undefined) {
      query["site_id"] = options.siteId;
    }
    const payload = await getJson(FACILITIES_PATH, { signal: options.signal, query });
    return parsePage(payload.body, parseFacility, "facility page");
  });
}

/**
 * List one facility's control zones, filtered by the backend.
 *
 * @param facilityId The facility whose zones to list.
 * @param options Cancellation.
 * @returns The zones, the backend's total, and whether the two agree.
 */
export async function fetchControlZones(
  facilityId: string,
  options: TopologyRequestOptions = {},
): Promise<Collection<ControlZoneRead>> {
  return collectPages<ControlZoneRead>(async (window) => {
    const payload = await getJson(CONTROL_ZONES_PATH, {
      signal: options.signal,
      query: { ...windowQuery(window), facility_id: facilityId },
    });
    return parsePage(payload.body, parseControlZone, "control zone page");
  });
}

/**
 * Read one site directly.
 *
 * @param siteId The site's identifier, untrusted.
 * @param options Cancellation.
 * @returns The site.
 */
export async function fetchSite(
  siteId: string,
  options: TopologyRequestOptions = {},
): Promise<SiteRead> {
  const payload = await getJson(resourcePath(SITES_PATH, siteId), { signal: options.signal });
  return parseSite(payload.body);
}

/**
 * Read one facility directly.
 *
 * A deep link resolves the facility with this single request rather than by
 * listing every facility and searching it, which the contract's own
 * `GET /api/v1/facilities/{facility_id}` exists to make possible.
 *
 * @param facilityId The facility's identifier, untrusted.
 * @param options Cancellation.
 * @returns The facility, including the `site_id` it belongs to.
 */
export async function fetchFacility(
  facilityId: string,
  options: TopologyRequestOptions = {},
): Promise<FacilityRead> {
  const payload = await getJson(resourcePath(FACILITIES_PATH, facilityId), {
    signal: options.signal,
  });
  return parseFacility(payload.body);
}

/**
 * Read one control zone directly.
 *
 * @param zoneId The zone's identifier, untrusted.
 * @param options Cancellation.
 * @returns The zone, including the `facility_id` it belongs to.
 */
export async function fetchControlZone(
  zoneId: string,
  options: TopologyRequestOptions = {},
): Promise<ControlZoneRead> {
  const payload = await getJson(resourcePath(CONTROL_ZONES_PATH, zoneId), {
    signal: options.signal,
  });
  return parseControlZone(payload.body);
}

/**
 * List the points assigned to one control zone, following pagination.
 *
 * @param zoneId The zone whose composition to read, untrusted.
 * @param options Cancellation.
 * @returns The assignments, the backend's total, and whether the two agree.
 */
export async function fetchControlZonePoints(
  zoneId: string,
  options: TopologyRequestOptions = {},
): Promise<Collection<ZonePointAssignmentRead>> {
  const path = `${resourcePath(CONTROL_ZONES_PATH, zoneId)}/points`;
  return collectPages<ZonePointAssignmentRead>(async (window) => {
    const payload = await getJson(path, { signal: options.signal, query: windowQuery(window) });
    return parsePage(payload.body, parseZonePointAssignment, "zone point page");
  });
}

/** Re-exported so a caller needs one import for a topology collection. */
export type { Collection };
