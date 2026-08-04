/**
 * Rendering harness for component tests.
 *
 * `fetch` is replaced by a routing table keyed on the exact URL the API
 * boundary is expected to build. A request to an unrouted URL rejects loudly,
 * so a client that silently changes its path or query is a failing test rather
 * than a silent 404 in production.
 *
 * The portal is mounted through the same providers the browser entry point
 * uses, with a memory router in place of the browser router, so a test exercises
 * the real shell rather than a stand-in for it.
 */

import { QueryClient } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router";
import { vi } from "vitest";
import { App } from "../app/App";
import { AppProviders } from "../app/AppProviders";
import { backendRoutes, HEALTH_URL, HEALTHY_BODY } from "./fixtures";

export { HEALTH_URL, HEALTHY_BODY };

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
  /** Never settle, so the caller's loading state can be observed. */
  pending?: boolean;
}

/** A routing table, or a function of the call count for per-attempt answers. */
export type Router = Record<string, RouteReply | ((attempt: number) => RouteReply)>;

/**
 * One request the portal made, as the boundary actually built it.
 *
 * The method, the headers and the body are recorded as well as the URL, because
 * a write is only correct if all four are: a manual command that reached the
 * right path with the wrong body, or without the `Idempotency-Key` the contract
 * requires, is a failure a URL-only assertion would miss.
 */
export interface RecordedRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  /** The request body, parsed as JSON when there was one. */
  readonly body: unknown;
}

export interface FetchMock {
  /** Every URL requested, in order. */
  calls: string[];
  /** Every request in full, in order. */
  requests: RecordedRequest[];
  /** Requests seen per URL. */
  countFor: (url: string) => number;
  /** Every recorded request to one URL, in order. */
  requestsFor: (url: string) => RecordedRequest[];
  /** Replace the routing table mid-test, to simulate a backend going down. */
  setRoutes: (routes: Router) => void;
}

/** Read the headers of a `fetch` call, whatever shape they were given in. */
function headersOf(init: RequestInit | undefined): Record<string, string> {
  const source = init?.headers;
  const headers: Record<string, string> = {};
  if (source === undefined) {
    return headers;
  }
  new Headers(source).forEach((value, key) => {
    headers[key] = value;
  });
  return headers;
}

/** Parse a recorded request body, leaving anything unparseable as it arrived. */
function bodyOf(init: RequestInit | undefined): unknown {
  const body = init?.body;
  if (typeof body !== "string") {
    return undefined;
  }
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
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
  const requests: RecordedRequest[] = [];
  const perUrl = new Map<string, number>();

  const stub = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = urlOf(input);
    calls.push(url);
    requests.push({
      url,
      method: init?.method ?? "GET",
      headers: headersOf(init),
      body: bodyOf(init),
    });
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
    if (reply.pending) {
      return new Promise<Response>(() => {
        // Deliberately never settles.
      });
    }
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
    requests,
    countFor: (url) => perUrl.get(url) ?? 0,
    requestsFor: (url) => requests.filter((request) => request.url === url),
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

/**
 * Back and Forward, for a router with no DOM history behind it.
 *
 * A memory router keeps its own history, so `window.history` says nothing about
 * it. A test that needs to prove Back restores a previous state therefore has
 * to go through the router, and this is the smallest way to do that: two
 * buttons, rendered beside the portal rather than inside it, and only when a
 * test asks for them.
 */
function HistoryControls() {
  const navigate = useNavigate();
  return (
    <div data-testid="history-controls">
      <button
        type="button"
        data-testid="history-back"
        onClick={() => {
          void navigate(-1);
        }}
      >
        Back
      </button>
      <button
        type="button"
        data-testid="history-forward"
        onClick={() => {
          void navigate(1);
        }}
      >
        Forward
      </button>
    </div>
  );
}

export interface RenderPortalOptions {
  /** The address the portal starts at. */
  path?: string;
  /**
   * Routing table for `fetch`. Defaults to a healthy backend serving the
   * default topology fixture, so a test that is not about the backend does not
   * have to describe one.
   */
  routes?: Router;
  /**
   * Render Back and Forward controls beside the portal.
   *
   * Off by default, so no test that is not about history sees a control the
   * real application does not have.
   */
  history?: boolean;
}

/** Render the whole portal at an address, over a stubbed backend. */
export function renderPortal(options: RenderPortalOptions = {}) {
  const api = installFetchMock(options.routes ?? backendRoutes());
  const client = createTestQueryClient();
  return {
    api,
    client,
    ...render(
      <AppProviders client={client}>
        <MemoryRouter initialEntries={[options.path ?? "/"]}>
          <App />
          {options.history === true ? <HistoryControls /> : null}
        </MemoryRouter>
      </AppProviders>,
    ),
  };
}
