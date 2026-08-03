import { QueryClient } from "@tanstack/react-query";

/**
 * Build the shared query client.
 *
 * `retry: 1` keeps a failing refresh from hiding behind minutes of exponential
 * backoff: the screen would rather mark the snapshot stale quickly and offer
 * Retry than pretend it is still loading. Focus and reconnect refetching are
 * off so that polling is exactly the three documented intervals and nothing
 * else — which is also what makes the polling behaviour testable.
 *
 * @returns A query client configured for bounded read-only polling.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        retryDelay: 1_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchIntervalInBackground: false,
      },
    },
  });
}
