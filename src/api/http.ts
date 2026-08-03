/**
 * The portal's single HTTP boundary.
 *
 * Every request the application makes goes through here, so URL construction,
 * error normalisation, cancellation and the future authentication hook exist
 * once rather than per feature. Presentational components never call `fetch`;
 * they receive already-normalised state from the query layer above this file.
 *
 * The portal reads with {@link getJson} and writes with {@link postJson}, and
 * the two are deliberately not the same function. A failed read may be repeated;
 * a failed write may not, because a request that never returned is not a request
 * that never happened. {@link postJson} therefore never retries on its own, and
 * it reports a transport failure as {@link NetworkError} so the caller can say
 * "this may have been accepted" rather than "this failed".
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
 *
 * @param extra Operation-specific headers the contract requires, such as the
 *   `Idempotency-Key` of a manual command.
 */
function requestHeaders(extra: Readonly<Record<string, string>> = {}): Record<string, string> {
  return { Accept: "application/json", ...extra };
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

export interface PostJsonOptions {
  /** The request body, serialised as JSON. */
  readonly body: unknown;
  /**
   * Headers the operation's contract requires beyond content negotiation, such
   * as the `Idempotency-Key` a manual command is created with.
   */
  readonly headers?: Readonly<Record<string, string>> | undefined;
  /**
   * Statuses that are a successful outcome rather than a failure.
   * `POST /api/v1/commands` answers `201` for a creation and `200` for an
   * idempotent replay, and both are answers the caller must be able to read.
   */
  readonly acceptStatuses?: readonly number[] | undefined;
  readonly signal?: AbortSignal | undefined;
}

/**
 * Issue one POST and decode its JSON body.
 *
 * Nothing here retries. A write whose response was lost may have been applied,
 * so deciding what to do next belongs to the caller that knows the operation's
 * idempotency rules — not to a transport that would silently send it twice.
 *
 * @param path An absolute path on the backend, starting with `/`.
 * @param options The body, contract-required headers, accepted statuses and
 *   cancellation.
 * @returns The status and the decoded body, still untyped.
 * @throws {ApiConfigError} When this build's base URL is invalid.
 * @throws {ApiError} When the backend answers an unaccepted status.
 * @throws {NetworkError} When the request never completed or was not JSON. The
 *   request may still have reached the backend.
 */
export async function postJson(path: string, options: PostJsonOptions): Promise<JsonPayload> {
  const url = apiUrl(path);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: requestHeaders({ "Content-Type": "application/json", ...(options.headers ?? {}) }),
      body: JSON.stringify(options.body),
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
    throw new ApiError(`POST ${url} failed.`, response.status, readErrorCode(body));
  }
  if (!decoded) {
    throw new NetworkError(`Response from ${url} was not valid JSON.`);
  }

  return { status: response.status, body };
}
