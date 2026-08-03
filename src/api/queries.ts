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

import { useQuery } from "@tanstack/react-query";
import { fetchFacilities, fetchFacilityConfiguration, fetchPointTelemetry } from "./client";

/** Poll interval for the facility list, in milliseconds. */
export const FACILITIES_POLL_MS = 30_000;

/** Poll interval for the selected facility's configuration and current state. */
export const CONFIGURATION_POLL_MS = 5_000;

/** Poll interval for the selected point's telemetry history. */
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

/** The selected numeric point's last {@link HISTORY_SAMPLE_LIMIT} samples. */
export function usePointTelemetryQuery(pointId: string | null) {
  return useQuery({
    queryKey: queryKeys.telemetry(pointId ?? ""),
    queryFn: ({ signal }) => fetchPointTelemetry(pointId!, signal),
    enabled: pointId !== null,
    refetchInterval: TELEMETRY_POLL_MS,
    staleTime: TELEMETRY_POLL_MS,
  });
}
