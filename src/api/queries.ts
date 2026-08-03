/**
 * Server state for the portal.
 *
 * TanStack Query owns every request, so one bounded poll or one topology read
 * is shared by every component that asks for it: the shell's availability
 * indicator and the dashboard's availability panel read the same health query,
 * and the Greenhouses overview, the Dashboard and the facility switcher read
 * the same site and facility queries rather than three copies of the topology.
 *
 * Query keys are hierarchical and live here, so a later unit can invalidate or
 * cancel `["topology"]`, `["topology", "facilities"]` or one resource without
 * guessing what a feature named its key.
 *
 * Health and topology are deliberately independent. A topology request is never
 * gated on `/health` answering, a health failure never discards loaded
 * topology, and each carries its own loading and error state.
 */

import { useQuery } from "@tanstack/react-query";
import { fetchHealth } from "./health";
import { fetchFacilityConfiguration, fetchPointTelemetry } from "./monitoring";
import {
  fetchControlZone,
  fetchControlZonePoints,
  fetchControlZones,
  fetchFacilities,
  fetchFacility,
  fetchSite,
  fetchSites,
  isResourceMissing,
} from "./topology";

/** How often the portal rechecks cloud API availability, in milliseconds. */
export const HEALTH_POLL_MS = 30_000;

/**
 * How long a topology answer is treated as fresh, in milliseconds.
 *
 * Topology is configuration, not telemetry: sites, facilities and zones change
 * when someone provisions them, not every few seconds. Moving between the
 * overview, a facility and a zone therefore renders from cache instead of
 * re-requesting, and nothing here polls on an interval.
 */
export const TOPOLOGY_STALE_MS = 60_000;

/**
 * How often a facility's configuration document is re-read, in milliseconds.
 *
 * Monitoring is not topology: the document carries the points' last known
 * state, so it is re-read on an interval where topology is not. One request per
 * interval describes every measurement point of the facility, so the cost does
 * not grow with the number of points in the zone.
 */
export const MONITORING_POLL_MS = 30_000;

/** How long a configuration answer is treated as fresh, in milliseconds. */
export const MONITORING_STALE_MS = 15_000;

/**
 * How often the selected point's telemetry window is re-read.
 *
 * Slower than current state on purpose: the card answers "what does it read
 * now", and re-drawing a two-hundred-sample chart every thirty seconds would
 * cost more than it tells anyone.
 */
export const TELEMETRY_POLL_MS = 60_000;

/** How long a telemetry window is treated as fresh, in milliseconds. */
export const TELEMETRY_STALE_MS = 30_000;

/**
 * Samples requested per telemetry window.
 *
 * The contract caps `limit` at 1000 and publishes no total and no cursor, so
 * there is no page to follow and no completeness to reach. 200 is chosen to be
 * enough to read a trend and small enough to draw and to tabulate on a phone;
 * the screen always says the window is bounded rather than complete.
 */
export const TELEMETRY_HISTORY_LIMIT = 200;

/** Query keys, kept in one place so cancellation and invalidation agree. */
export const queryKeys = {
  health: () => ["api-health"] as const,
  topology: () => ["topology"] as const,
  siteList: () => ["topology", "sites", "list"] as const,
  site: (siteId: string) => ["topology", "sites", "detail", siteId] as const,
  facilityList: () => ["topology", "facilities", "list"] as const,
  facility: (facilityId: string) => ["topology", "facilities", "detail", facilityId] as const,
  controlZoneList: (facilityId: string) =>
    ["topology", "control-zones", "list", facilityId] as const,
  controlZone: (zoneId: string) => ["topology", "control-zones", "detail", zoneId] as const,
  controlZonePoints: (zoneId: string) => ["topology", "control-zones", "points", zoneId] as const,
  monitoring: () => ["monitoring"] as const,
  facilityConfiguration: (facilityId: string) =>
    ["monitoring", "facility-configuration", facilityId] as const,
  pointTelemetry: (pointId: string, limit: number) =>
    ["monitoring", "point-telemetry", pointId, limit] as const,
};

/**
 * A polling interval that stops once the answer cannot change by retrying.
 *
 * A `404` or a rejected identifier is the backend's answer, not a hiccup: left
 * on a plain interval it would become one wrong address producing two requests
 * a minute for as long as the tab is open. Every other failure keeps polling,
 * because an unreachable API is expected to come back.
 *
 * @param intervalMs The interval to use while the resource may still answer.
 * @returns The value TanStack Query's `refetchInterval` takes.
 */
export function pollUnlessResourceMissing(intervalMs: number) {
  return (query: { readonly state: { readonly error: unknown } }): number | false =>
    isResourceMissing(query.state.error) ? false : intervalMs;
}

/**
 * Poll the cloud API's health endpoint.
 *
 * A failure is deliberately not retried for long: the portal would rather say
 * "unavailable" quickly and keep rechecking on its own interval than sit in a
 * loading state behind exponential backoff.
 */
export function useApiHealthQuery() {
  return useQuery({
    queryKey: queryKeys.health(),
    queryFn: ({ signal }) => fetchHealth(signal),
    refetchInterval: HEALTH_POLL_MS,
    staleTime: HEALTH_POLL_MS,
  });
}

/**
 * Trim a route parameter into an identifier.
 *
 * @param raw The parameter as the router decoded it.
 * @returns The identifier, or `undefined` when there is nothing to look up.
 */
function identifier(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  return value === undefined || value === "" ? undefined : value;
}

/** Every site the cloud API returns, following pagination. */
export function useSitesQuery() {
  return useQuery({
    queryKey: queryKeys.siteList(),
    queryFn: ({ signal }) => fetchSites({ signal }),
    staleTime: TOPOLOGY_STALE_MS,
  });
}

/**
 * Every facility the cloud API returns, following pagination.
 *
 * The overview groups these by their own `site_id` rather than issuing one
 * filtered request per site: a customer with twenty sites would otherwise cost
 * twenty-one requests to draw one page. The per-site filter the contract offers
 * stays available for a screen that needs a single site.
 */
export function useFacilitiesQuery() {
  return useQuery({
    queryKey: queryKeys.facilityList(),
    queryFn: ({ signal }) => fetchFacilities({ signal }),
    staleTime: TOPOLOGY_STALE_MS,
  });
}

/** One site, resolved directly. Idle until an identifier exists. */
export function useSiteQuery(siteId: string | undefined) {
  const id = identifier(siteId);
  return useQuery({
    queryKey: queryKeys.site(id ?? ""),
    queryFn: ({ signal }) => fetchSite(id ?? "", { signal }),
    enabled: id !== undefined,
    staleTime: TOPOLOGY_STALE_MS,
  });
}

/**
 * One facility, resolved directly from its identifier.
 *
 * A deep link costs one request, not a listing plus a search: the contract
 * publishes `GET /api/v1/facilities/{facility_id}` precisely so a client does
 * not have to read the whole collection to open one resource.
 */
export function useFacilityQuery(facilityId: string | undefined) {
  const id = identifier(facilityId);
  return useQuery({
    queryKey: queryKeys.facility(id ?? ""),
    queryFn: ({ signal }) => fetchFacility(id ?? "", { signal }),
    enabled: id !== undefined,
    staleTime: TOPOLOGY_STALE_MS,
  });
}

/** One facility's control zones, filtered by the backend. */
export function useControlZonesQuery(facilityId: string | undefined) {
  const id = identifier(facilityId);
  return useQuery({
    queryKey: queryKeys.controlZoneList(id ?? ""),
    queryFn: ({ signal }) => fetchControlZones(id ?? "", { signal }),
    enabled: id !== undefined,
    staleTime: TOPOLOGY_STALE_MS,
  });
}

/** One control zone, resolved directly from its identifier. */
export function useControlZoneQuery(zoneId: string | undefined) {
  const id = identifier(zoneId);
  return useQuery({
    queryKey: queryKeys.controlZone(id ?? ""),
    queryFn: ({ signal }) => fetchControlZone(id ?? "", { signal }),
    enabled: id !== undefined,
    staleTime: TOPOLOGY_STALE_MS,
  });
}

/** One control zone's point composition, following pagination. */
export function useControlZonePointsQuery(zoneId: string | undefined) {
  const id = identifier(zoneId);
  return useQuery({
    queryKey: queryKeys.controlZonePoints(id ?? ""),
    queryFn: ({ signal }) => fetchControlZonePoints(id ?? "", { signal }),
    enabled: id !== undefined,
    staleTime: TOPOLOGY_STALE_MS,
  });
}

/**
 * One facility's configuration document, polled while the workspace is open.
 *
 * This is the monitoring section's only current-state request: one bounded poll
 * describes every measurement point of every zone in the facility, so a zone
 * with one point and a zone with twenty cost the same. It is keyed by facility
 * rather than by zone precisely so that moving between two zones of the same
 * facility reads the cache instead of asking again.
 *
 * @param facilityId The facility from the route, untrusted.
 * @param enabled Whether the workspace is in a state where monitoring may run —
 *   false for a zone that does not belong to this facility, or for one the
 *   cloud API does not have.
 */
export function useFacilityConfigurationQuery(facilityId: string | undefined, enabled = true) {
  const id = identifier(facilityId);
  return useQuery({
    queryKey: queryKeys.facilityConfiguration(id ?? ""),
    queryFn: ({ signal }) => fetchFacilityConfiguration(id ?? "", { signal }),
    enabled: enabled && id !== undefined,
    staleTime: MONITORING_STALE_MS,
    refetchInterval: pollUnlessResourceMissing(MONITORING_POLL_MS),
  });
}

/**
 * One bounded telemetry window for one point.
 *
 * The window size is part of the key, so changing it is a different answer
 * rather than an overwrite of the previous one, and the point identifier is
 * part of the key so a late response for a point the user has moved away from
 * cannot be rendered as the new point's history.
 *
 * @param pointId The point to read, already validated against the zone.
 * @param limit Samples to request.
 */
export function usePointTelemetryQuery(
  pointId: string | undefined,
  limit: number = TELEMETRY_HISTORY_LIMIT,
) {
  const id = identifier(pointId);
  return useQuery({
    queryKey: queryKeys.pointTelemetry(id ?? "", limit),
    queryFn: ({ signal }) => fetchPointTelemetry(id ?? "", { signal, limit }),
    enabled: id !== undefined,
    staleTime: TELEMETRY_STALE_MS,
    refetchInterval: pollUnlessResourceMissing(TELEMETRY_POLL_MS),
  });
}
