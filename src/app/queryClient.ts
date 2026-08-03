import { QueryClient } from "@tanstack/react-query";

/**
 * Build the shared query client.
 *
 * `retry: 1` keeps a failing request from hiding behind minutes of exponential
 * backoff: the portal would rather say "unavailable" quickly and keep
 * rechecking on its own bounded interval. Focus and reconnect refetching are
 * off so that polling is exactly the intervals each query declares and nothing
 * else — which is also what makes the behaviour testable.
 *
 * @returns A query client configured for bounded polling.
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
