/**
 * Polling behaviour.
 *
 * Three properties matter and each is asserted directly: the intervals are the
 * documented ones, a slow response does not accumulate overlapping requests,
 * and changing the selection aborts the request that is no longer wanted.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONFIGURATION_POLL_MS,
  FACILITIES_POLL_MS,
  TELEMETRY_POLL_MS,
  useFacilitiesQuery,
  useFacilityConfigurationQuery,
} from "./queries";
import {
  facilityConfiguration,
  facilityPage,
  FACILITY_ID,
  OTHER_FACILITY_ID,
} from "../test/fixtures";
import { emptyFacilityConfiguration } from "../test/fixtures";
import { urlOf } from "../test/harness";

const FACILITIES_URL = "/api/v1/facilities?status=active&limit=200";

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

/** A client that keeps the production polling defaults but never retries. */
function pollingClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("poll intervals", () => {
  it("uses the documented bounded intervals", () => {
    expect(FACILITIES_POLL_MS).toBe(30_000);
    expect(CONFIGURATION_POLL_MS).toBe(5_000);
    expect(TELEMETRY_POLL_MS).toBe(10_000);
  });
});

describe("no overlapping requests", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  it("does not start a second request while one is still in flight", async () => {
    // A response that never settles: every interval that fires while it is
    // outstanding must join it rather than open another request.
    const stub = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", stub);

    renderHook(() => useFacilitiesQuery(), { wrapper: wrapper(pollingClient()) });

    await waitFor(() => {
      expect(stub).toHaveBeenCalledTimes(1);
    });

    await vi.advanceTimersByTimeAsync(FACILITIES_POLL_MS * 4);

    expect(stub).toHaveBeenCalledTimes(1);
  });

  it("polls again once the previous request has settled", async () => {
    const stub = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolve(new Response(JSON.stringify(facilityPage), { status: 200 }));
        }),
    );
    vi.stubGlobal("fetch", stub);

    const { result } = renderHook(() => useFacilitiesQuery(), {
      wrapper: wrapper(pollingClient()),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(stub).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(FACILITIES_POLL_MS + 100);

    await waitFor(() => {
      expect(stub).toHaveBeenCalledTimes(2);
    });
  });
});

describe("obsolete requests", () => {
  it("makes no request until a facility is selected", async () => {
    const stub = vi.fn(() => Promise.resolve(new Response("{}", { status: 200 })));
    vi.stubGlobal("fetch", stub);

    renderHook(() => useFacilityConfigurationQuery(null), { wrapper: wrapper(pollingClient()) });

    await Promise.resolve();
    expect(stub).not.toHaveBeenCalled();
  });

  it("aborts the previous facility's request when the selection changes", async () => {
    const signals: AbortSignal[] = [];
    const stub = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.signal) {
        signals.push(init.signal);
      }
      // Never settles, so the abort is what ends it.
      return new Promise<Response>(() => {});
    });
    vi.stubGlobal("fetch", stub);

    const client = pollingClient();
    const { rerender } = renderHook(({ id }: { id: string }) => useFacilityConfigurationQuery(id), {
      wrapper: wrapper(client),
      initialProps: { id: FACILITY_ID },
    });

    await waitFor(() => {
      expect(signals).toHaveLength(1);
    });

    rerender({ id: OTHER_FACILITY_ID });

    await waitFor(() => {
      expect(signals).toHaveLength(2);
    });
    await waitFor(() => {
      expect(signals[0]!.aborted).toBe(true);
    });
    expect(signals[1]!.aborted).toBe(false);
  });

  it("requests each facility's configuration on its own URL", async () => {
    const stub = vi.fn((url: RequestInfo | URL) => {
      const body = urlOf(url).includes(FACILITY_ID)
        ? facilityConfiguration
        : emptyFacilityConfiguration;
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    });
    vi.stubGlobal("fetch", stub);

    const client = pollingClient();
    const { rerender, result } = renderHook(
      ({ id }: { id: string }) => useFacilityConfigurationQuery(id),
      { wrapper: wrapper(client), initialProps: { id: FACILITY_ID } },
    );

    await waitFor(() => {
      expect(result.current.data?.facility.name).toBe("Basil Growbox");
    });

    rerender({ id: OTHER_FACILITY_ID });

    await waitFor(() => {
      expect(result.current.data?.facility.name).toBe("Mint Growbox");
    });
    expect(stub.mock.calls.map((call) => urlOf(call[0]))).toEqual([
      `/api/v1/facilities/${FACILITY_ID}/configuration`,
      `/api/v1/facilities/${OTHER_FACILITY_ID}/configuration`,
    ]);
  });

  it("never requests anything outside /api/v1", async () => {
    const stub = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(new Response(JSON.stringify(facilityPage), { status: 200 })),
    );
    vi.stubGlobal("fetch", stub);

    const { result } = renderHook(() => useFacilitiesQuery(), {
      wrapper: wrapper(pollingClient()),
    });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(stub.mock.calls.every((call) => urlOf(call[0]).startsWith("/api/v1"))).toBe(true);
  });
});

describe("URL shape", () => {
  it("keeps the facilities URL stable across polls", async () => {
    const stub = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(new Response(JSON.stringify(facilityPage), { status: 200 })),
    );
    vi.stubGlobal("fetch", stub);

    const { result } = renderHook(() => useFacilitiesQuery(), {
      wrapper: wrapper(pollingClient()),
    });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(urlOf(stub.mock.calls[0]![0])).toBe(FACILITIES_URL);
  });
});
