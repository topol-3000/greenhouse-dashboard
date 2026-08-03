/**
 * The portal's single HTTP boundary.
 *
 * Every request the application makes goes through here, so URL construction,
 * error normalisation, cancellation and the future authentication hook exist
 * once rather than per feature. Presentational components never call `fetch`;
 * they receive already-normalised state from the query layer above this file.
 */

import { apiBaseUrl } from "./config";
import { ApiConfigError, ApiError, NetworkError } from "./errors";

/** A decoded JSON response, with the status the caller may still need. */
export interface JsonPayload {
  readonly status: number;
  readonly body: unknown;
}

export interface GetJsonOptions {
  /**
   * Abort signal from the caller, so a superseded or unmounted request is
   * cancelled rather than left to resolve into a stale render.
   */
  readonly signal?: AbortSignal | undefined;
  /** Query parameters, encoded here rather than by each caller. */
  readonly query?: Readonly<Record<string, string | number>> | undefined;
  /**
   * Statuses that carry a meaningful body and must be returned rather than
   * thrown. `/health` answers `503` with a full health document, and that is
   * information the portal shows rather than an error it hides.
   */
  readonly acceptStatuses?: readonly number[] | undefined;
}

/**
 * Build an absolute-or-relative API URL from the configured base URL.
 *
 * @param path An absolute path on the backend, starting with `/`.
 * @param query Optional query parameters.
 * @returns The URL to request.
 * @throws {ApiConfigError} When this build's base URL is invalid.
 */
export function apiUrl(
  path: string,
  query: Readonly<Record<string, string | number>> = {},
): string {
  if (!apiBaseUrl.valid) {
    throw new ApiConfigError(apiBaseUrl.reason);
  }
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    search.set(key, String(value));
  }
  const suffix = search.toString();
  const url = `${apiBaseUrl.baseUrl}${path}`;
  return suffix.length > 0 ? `${url}?${suffix}` : url;
}

/**
 * Headers every request carries.
 *
 * Authentication is not implemented in this unit. When it is, the token is
 * attached here — once, for every request — rather than being threaded through
 * feature code. The portal holds no token, no fake user and no local login
 * today, so this returns only the content negotiation header.
 */
function requestHeaders(): HeadersInit {
  return { Accept: "application/json" };
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
 * @param path An absolute path on the backend, starting with `/`.
 * @param options Cancellation, query parameters and non-2xx statuses to accept.
 * @returns The status and the decoded body, still untyped.
 * @throws {ApiConfigError} When this build's base URL is invalid.
 * @throws {ApiError} When the backend answers an unaccepted status.
 * @throws {NetworkError} When the request never completed or was not JSON.
 */
export async function getJson(path: string, options: GetJsonOptions = {}): Promise<JsonPayload> {
  const url = apiUrl(path, options.query ?? {});

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: requestHeaders(),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") {
      throw cause;
    }
    throw new NetworkError(`Request to ${url} failed.`, { cause });
  }

  const accepted = response.ok || (options.acceptStatuses ?? []).includes(response.status);

  let body: unknown;
  let decoded = true;
  try {
    body = await response.json();
  } catch {
    decoded = false;
  }

  if (!accepted) {
    throw new ApiError(`GET ${url} failed.`, response.status, readErrorCode(body));
  }
  if (!decoded) {
    throw new NetworkError(`Response from ${url} was not valid JSON.`);
  }

  return { status: response.status, body };
}
