/**
 * Server state for the portal shell.
 *
 * TanStack Query owns every request, so one bounded poll per resource is shared
 * by every component that asks for it: the shell's availability indicator and
 * the dashboard's availability panel read the same health query and make one
 * request between them. Query keys live here so later units invalidate and
 * cancel against the same names.
 */

import { useQuery } from "@tanstack/react-query";
import { fetchHealth } from "./health";

/** How often the portal rechecks cloud API availability, in milliseconds. */
export const HEALTH_POLL_MS = 30_000;

/** Query keys, kept in one place so cancellation and invalidation agree. */
export const queryKeys = {
  health: () => ["api-health"] as const,
};

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
