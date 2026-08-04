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
 * topology, and each carries its own loading and error state. Manual control is
 * independent of both: a command may be submitted while `/health` is failing,
 * and a failed command never discards loaded monitoring data.
 */

import { useMutation, useQuery } from "@tanstack/react-query";
import type { CommandRead, ManualCommandOutcome } from "./contract";
import type { CommandListFilters, ManualCommandAcceptance, ManualCommandRequest } from "./control";
import {
  createManualCommand,
  fetchCommand,
  fetchCommands,
  isTerminalCommandState,
} from "./control";
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

/**
 * How often a non-terminal command is re-read, in milliseconds.
 *
 * Faster than monitoring because the customer is waiting on this one answer,
 * and it is one request for one command rather than a document describing a
 * facility. It stops the moment the command reaches a terminal state.
 */
export const COMMAND_POLL_MS = 5_000;

/** How long a command answer is treated as fresh, in milliseconds. */
export const COMMAND_STALE_MS = 2_000;

/**
 * Commands requested per Activity window.
 *
 * The operation caps `limit` at 1000 and defaults to 100. The portal asks for
 * that documented default: large enough to be a useful history of one zone,
 * small enough to render on a phone, and — because the backend orders by
 * `created_at DESC, id DESC` before applying the limit — genuinely the most
 * recent commands rather than an arbitrary subset.
 *
 * There is no page after it. `CommandListRead` publishes no total and no cursor,
 * so the screen says the window is bounded instead of offering a page the
 * contract could not honour.
 */
export const ACTIVITY_COMMAND_LIMIT = 100;

/**
 * How long one Activity window is treated as fresh, in milliseconds.
 *
 * Activity is history rather than live state, and it is not polled: the one
 * thing a customer watches change is the command they opened, and that is
 * followed by its own bounded lifecycle query. Moving between filters and back
 * therefore reads the cache, and a customer who wants a newer window asks for
 * one.
 */
export const ACTIVITY_STALE_MS = 30_000;

/**
 * How long the portal keeps checking a command that has not settled.
 *
 * The contract defines no timeout for delivery: a command stays `pending` until
 * the Edge answers, and it may never answer. Polling forever is therefore not
 * "waiting for the truth", it is a request every five seconds for as long as the
 * tab is open. After this window the portal stops asking and says exactly that —
 * the status is unconfirmed, not failed — and the customer can resume checking.
 */
export const COMMAND_OBSERVATION_WINDOW_MS = 120_000;

/**
 * Whether a command is still worth asking about.
 *
 * One function, used both by the polling interval and by the screen, so that
 * "the portal stopped checking" can never disagree with whether it did.
 *
 * @param command The last command representation received, if any.
 * @param observationStartedAt When this command started being observed, in
 *   epoch milliseconds.
 * @param now The current instant, in epoch milliseconds.
 * @returns Whether polling should continue.
 */
export function shouldKeepObservingCommand(
  command: CommandRead | undefined,
  observationStartedAt: number,
  now: number,
): boolean {
  if (command !== undefined && isTerminalCommandState(command.state)) {
    return false;
  }
  return now - observationStartedAt < COMMAND_OBSERVATION_WINDOW_MS;
}

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
  control: () => ["control"] as const,
  command: (commandId: string) => ["control", "commands", "detail", commandId] as const,
  commandList: (filters: CommandListFilters) =>
    [
      "control",
      "commands",
      "list",
      filters.controlZoneId,
      filters.targetPointId ?? null,
      filters.source ?? null,
      filters.limit,
    ] as const,
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

/** What one accepted manual command request produced. */
export interface ManualCommandResult {
  readonly command: CommandRead;
  /** `created` for a first submission, `existing` for an idempotent replay. */
  readonly outcome: ManualCommandOutcome;
  /** The HTTP status the backend answered with: `201` or `200`. */
  readonly status: number;
}

/**
 * Submit one manual command.
 *
 * Nothing is retried and nothing is optimistic. A `POST` that failed in
 * transport may have been applied, so repeating it is the customer's decision
 * made against the contract's replay rules — not something this layer does on
 * their behalf. No cache is written ahead of the answer either: the actuator's
 * reported state is what the backend published, and it does not change because
 * a request was sent.
 */
export function useManualCommandMutation() {
  return useMutation<ManualCommandAcceptance, unknown, ManualCommandRequest>({
    mutationKey: [...queryKeys.control(), "create-command"],
    mutationFn: (request) => createManualCommand(request),
    retry: false,
  });
}

/**
 * Follow one command's lifecycle, for a bounded time.
 *
 * The key is the command's own identifier, so a late answer for a command the
 * customer has moved away from can never be rendered as the current one.
 *
 * Polling is bounded twice over: it stops the moment the command reaches a
 * terminal state, and it stops when {@link COMMAND_OBSERVATION_WINDOW_MS} has
 * passed without one. A `404` or a `422` stops it as well, because both are the
 * backend's answer rather than a hiccup, and repeating them would turn one wrong
 * identifier into a request every five seconds. Retries are off entirely: the
 * interval already is the retry, and a retry on top of it would double the
 * traffic for every transient failure.
 *
 * @param commandId The command to follow, or `undefined` for none.
 * @param observationStartedAt When observation began, in epoch milliseconds, for
 *   a caller that stamps its own window. `undefined` means the caller owns the
 *   window entirely and signals its end through {@link stopped} — the interval
 *   then asks only whether the command has reached a terminal state. Either way
 *   the window is bounded; this is which side of the boundary holds the clock.
 * @param stopped Whether the caller has already decided the window is over, so
 *   the last scheduled interval cannot slip one more request past it.
 */
export function useCommandQuery(
  commandId: string | undefined,
  observationStartedAt: number | undefined,
  stopped: boolean,
) {
  const id = identifier(commandId);
  return useQuery({
    queryKey: queryKeys.command(id ?? ""),
    queryFn: ({ signal }) => fetchCommand(id ?? "", { signal }),
    enabled: id !== undefined,
    staleTime: COMMAND_STALE_MS,
    retry: false,
    refetchInterval: (query) => {
      if (stopped || isResourceMissing(query.state.error)) {
        return false;
      }
      const now = Date.now();
      return shouldKeepObservingCommand(query.state.data, observationStartedAt ?? now, now)
        ? COMMAND_POLL_MS
        : false;
    },
  });
}

/**
 * Read one bounded window of a control zone's commands.
 *
 * Deliberately not polled. The window is history, and the one command whose
 * state a customer is waiting on is the one they opened — which
 * {@link useCommandQuery} follows on its own bounded interval. A feed refreshing
 * itself every few seconds would cost a request per interval per open tab and
 * would move rows under the reader while they were reading them.
 *
 * The filters are the query key, so narrowing to one actuator and widening again
 * reads the cache rather than asking twice, and a late answer for filters the
 * customer has moved away from can never be rendered as the current window.
 *
 * @param filters The zone, and any narrowing the customer asked for.
 * @param enabled Whether the selection is resolved enough to ask. It is false
 *   until a zone is known, and while a `?point=` filter is still unverified.
 */
export function useCommandListQuery(filters: CommandListFilters, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.commandList(filters),
    queryFn: ({ signal }) => fetchCommands(filters, { signal }),
    enabled: enabled && identifier(filters.controlZoneId) !== undefined,
    staleTime: ACTIVITY_STALE_MS,
  });
}
