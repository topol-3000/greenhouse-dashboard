/**
 * Server state and polling.
 *
 * Each resource owns its own bounded interval. TanStack Query runs one fetch
 * per query key at a time, so an interval that fires while a request is still
 * in flight joins the running fetch instead of starting a second one — there is
 * no global timer and no request storm. Every query consumes the `signal` it is
 * given, so changing facility or point aborts the superseded request rather
 * than letting it resolve into a stale render.
 */

import { useQueries, useQuery } from "@tanstack/react-query";
import { fetchFacilities, fetchFacilityConfiguration, fetchPointTelemetry } from "./client";

/** Poll interval for the facility list, in milliseconds. */
export const FACILITIES_POLL_MS = 30_000;

/** Poll interval for the selected facility's configuration and current state. */
export const CONFIGURATION_POLL_MS = 5_000;

/** Poll interval for each charted point's telemetry history. */
export const TELEMETRY_POLL_MS = 10_000;

/** Query keys, kept in one place so cancellation and invalidation agree. */
export const queryKeys = {
  facilities: () => ["facilities"] as const,
  configuration: (facilityId: string) => ["facility-configuration", facilityId] as const,
  telemetry: (pointId: string) => ["point-telemetry", pointId] as const,
};

/** The facility list the owner chooses from. */
export function useFacilitiesQuery() {
  return useQuery({
    queryKey: queryKeys.facilities(),
    queryFn: ({ signal }) => fetchFacilities(signal),
    refetchInterval: FACILITIES_POLL_MS,
    staleTime: FACILITIES_POLL_MS,
  });
}

/**
 * The selected facility's configuration and current point state.
 *
 * Disabled until a facility is chosen, so no request is made for an empty
 * selection.
 */
export function useFacilityConfigurationQuery(facilityId: string | null) {
  return useQuery({
    queryKey: queryKeys.configuration(facilityId ?? ""),
    queryFn: ({ signal }) => fetchFacilityConfiguration(facilityId!, signal),
    enabled: facilityId !== null,
    refetchInterval: CONFIGURATION_POLL_MS,
    staleTime: CONFIGURATION_POLL_MS,
  });
}

/**
 * Every charted point's last {@link HISTORY_SAMPLE_LIMIT} samples, in the order
 * the point ids were given.
 *
 * The screen charts all numeric points at once, and a hook cannot be called in
 * a loop, so the histories are requested through `useQueries`. Each entry keeps
 * the per-point query key, so the cache, the deduplication and the abort on
 * `signal` behave exactly as they did for a single point — there are simply N
 * independent intervals instead of one, and a point whose history fails leaves
 * the other charts alone.
 */
export function usePointTelemetryQueries(pointIds: string[]) {
  return useQueries({
    queries: pointIds.map((pointId) => ({
      queryKey: queryKeys.telemetry(pointId),
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchPointTelemetry(pointId, signal),
      refetchInterval: TELEMETRY_POLL_MS,
      staleTime: TELEMETRY_POLL_MS,
    })),
  });
}
