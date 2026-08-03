/**
 * The typed read client for the `greenhouse` public API.
 *
 * Every URL is relative and rooted at `/api/v1`, so the browser only ever makes
 * same-origin requests and the backend host stays in the Nginx runtime
 * configuration. There is no backend host, port or scheme anywhere in this
 * bundle, and no write, command or lifecycle call.
 */

import { ApiError, NetworkError } from "./errors";
import { parseFacilityConfiguration, parseFacilityPage, parseTelemetryHistory } from "./parse";
import type { FacilityConfigurationDto, FacilityDto, PageDto, TelemetryHistoryDto } from "./types";

/** Same-origin root of the versioned API. */
export const API_ROOT = "/api/v1";

/** Samples the history chart asks for, and the backend's own page default. */
export const HISTORY_SAMPLE_LIMIT = 100;

/** Facilities requested per page; the backend caps `limit` at 200. */
export const FACILITY_PAGE_LIMIT = 200;

/** Build a same-origin API URL with an encoded query string. */
function buildUrl(path: string, query: Record<string, string | number> = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    search.set(key, String(value));
  }
  const suffix = search.toString();
  return suffix.length > 0 ? `${API_ROOT}${path}?${suffix}` : `${API_ROOT}${path}`;
}

/** Pull `error.code` out of the backend's error envelope, if it is there. */
function readErrorCode(body: unknown): string | undefined {
  if (typeof body === "object" && body !== null && "error" in body) {
    const envelope = body.error;
    if (typeof envelope === "object" && envelope !== null && "code" in envelope) {
      const code = envelope.code;
      if (typeof code === "string") {
        return code;
      }
    }
  }
  return undefined;
}

/**
 * Issue one GET and decode its JSON body.
 *
 * @param url The same-origin URL to read.
 * @param signal Abort signal supplied by the query, so a superseded request is
 *   cancelled rather than left to resolve into a stale render.
 * @returns The decoded body, still untyped.
 * @throws {ApiError} When the backend answers a non-2xx status.
 * @throws {NetworkError} When the request never completed.
 */
async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      ...(signal ? { signal } : {}),
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") {
      throw cause;
    }
    throw new NetworkError(`Request to ${url} failed.`, { cause });
  }

  if (!response.ok) {
    let code: string | undefined;
    try {
      code = readErrorCode(await response.json());
    } catch {
      // A non-JSON error body is not additional information worth surfacing.
    }
    throw new ApiError(`GET ${url} failed.`, response.status, code);
  }

  try {
    return (await response.json()) as unknown;
  } catch (cause) {
    throw new NetworkError(`Response from ${url} was not valid JSON.`, { cause });
  }
}

/**
 * List facilities the owner can monitor.
 *
 * Only `active` facilities are requested: an archived facility is not something
 * the owner monitors, and the filter is applied by the backend rather than
 * re-implemented here.
 *
 * @param signal Abort signal from the query.
 * @returns The facility page.
 */
export async function fetchFacilities(signal?: AbortSignal): Promise<PageDto<FacilityDto>> {
  const url = buildUrl("/facilities", { status: "active", limit: FACILITY_PAGE_LIMIT });
  return parseFacilityPage(await getJson(url, signal));
}

/**
 * Read one facility's configuration and the current state of its points.
 *
 * Archived zones and points are left out by the backend's default, which is
 * what "active measurement points" means for this screen.
 *
 * @param facilityId The selected facility.
 * @param signal Abort signal from the query.
 * @returns The configuration document.
 */
export async function fetchFacilityConfiguration(
  facilityId: string,
  signal?: AbortSignal,
): Promise<FacilityConfigurationDto> {
  const url = buildUrl(`/facilities/${encodeURIComponent(facilityId)}/configuration`);
  return parseFacilityConfiguration(await getJson(url, signal));
}

/**
 * Read the most recent telemetry samples of one point.
 *
 * The backend answers newest-first (`observed_at DESC, id DESC`). The order is
 * preserved here and reversed by the chart, so the transport layer stays a
 * faithful copy of what the API said.
 *
 * @param pointId The selected numeric point.
 * @param signal Abort signal from the query.
 * @returns The bounded history, newest first.
 */
export async function fetchPointTelemetry(
  pointId: string,
  signal?: AbortSignal,
): Promise<TelemetryHistoryDto> {
  const url = buildUrl(`/points/${encodeURIComponent(pointId)}/telemetry`, {
    limit: HISTORY_SAMPLE_LIMIT,
  });
  return parseTelemetryHistory(await getJson(url, signal));
}

export { buildUrl as buildApiUrl };
