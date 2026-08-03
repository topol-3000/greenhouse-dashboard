import { QueryClient } from "@tanstack/react-query";
import { ApiConfigError } from "../api/errors";
import { isResourceMissing } from "../api/topology";

/**
 * Whether a failed request is worth attempting again.
 *
 * A missing resource and an invalid base URL are answers, not accidents:
 * repeating either produces the same result and turns one wrong address into a
 * burst of requests. Everything else — a network failure, a `5xx` — gets one
 * more attempt.
 *
 * @param failureCount Attempts already made for this query.
 * @param error The failure from the last attempt.
 * @returns Whether to retry.
 */
export function shouldRetryRequest(failureCount: number, error: unknown): boolean {
  if (isResourceMissing(error) || error instanceof ApiConfigError) {
    return false;
  }
  return failureCount < 1;
}

/**
 * Build the shared query client.
 *
 * One retry keeps a failing request from hiding behind minutes of exponential
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
        retry: shouldRetryRequest,
        retryDelay: 1_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchIntervalInBackground: false,
      },
    },
  });
}
