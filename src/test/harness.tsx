/**
 * Rendering harness for component tests.
 *
 * `fetch` is replaced by a routing table keyed on the exact URL the client is
 * expected to build. A request to an unrouted URL rejects loudly, so a client
 * that changes its path or query silently is a failing test rather than a
 * silent 404 in production.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { vi } from "vitest";

/**
 * The URL a `fetch` call was made with.
 *
 * `RequestInfo` allows a `Request` object, which does not stringify usefully,
 * so the three shapes are unwrapped explicitly instead of coerced.
 */
export function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** One canned response. */
export interface RouteReply {
  status?: number;
  body?: unknown;
  /** Reject the request outright, standing in for an unreachable backend. */
  networkError?: boolean;
}

/** A routing table, or a function of the call count for per-attempt answers. */
export type Router = Record<string, RouteReply | ((attempt: number) => RouteReply)>;

export interface FetchMock {
  /** Every URL requested, in order. */
  calls: string[];
  /** Requests seen per URL. */
  countFor: (url: string) => number;
  /** Replace the routing table mid-test, to simulate a backend going down. */
  setRoutes: (routes: Router) => void;
}

/**
 * Install a `fetch` stub over a routing table.
 *
 * @param initial The routes to start with.
 * @returns A handle for inspecting and rewriting the table.
 */
export function installFetchMock(initial: Router): FetchMock {
  let routes = initial;
  const calls: string[] = [];
  const perUrl = new Map<string, number>();

  const stub = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = urlOf(input);
    calls.push(url);
    const attempt = (perUrl.get(url) ?? 0) + 1;
    perUrl.set(url, attempt);

    if (init?.signal?.aborted) {
      return Promise.reject(new DOMException("Aborted", "AbortError"));
    }

    const route = routes[url];
    if (route === undefined) {
      return Promise.reject(new Error(`Unrouted request: ${url}`));
    }
    const reply = typeof route === "function" ? route(attempt) : route;
    if (reply.networkError) {
      return Promise.reject(new TypeError("Failed to fetch"));
    }
    const status = reply.status ?? 200;
    return Promise.resolve(
      new Response(JSON.stringify(reply.body ?? {}), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  vi.stubGlobal("fetch", stub);

  return {
    calls,
    countFor: (url) => perUrl.get(url) ?? 0,
    setRoutes: (next) => {
      routes = next;
    },
  };
}

/** A query client with retries and polling off, so tests assert one fetch. */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchInterval: false,
        gcTime: Infinity,
      },
    },
  });
}

/** Render a component inside a fresh query client. */
export function renderWithQuery(ui: ReactElement, client = createTestQueryClient()) {
  return {
    client,
    ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>),
  };
}
