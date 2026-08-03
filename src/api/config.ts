/**
 * The portal's single configurable backend base URL.
 *
 * One value describes where the cloud API lives, and every request path is
 * derived from it: `/health` and the versioned `/api/v1` surface are siblings
 * in the backend, so they must not be configured independently.
 *
 * The default is the empty string, meaning "same origin". That keeps the
 * deployment model this repository already documents — a reverse proxy in front
 * of the static bundle owns the backend host at runtime, and no host is baked
 * into application JavaScript. A deployment that cannot proxy can still point
 * the portal at an absolute origin at build time.
 */

/** Build-time environment variable holding the base URL. */
export const API_BASE_URL_VARIABLE = "VITE_API_BASE_URL";

/** Path prefix of the backend's versioned domain API. */
export const API_V1_PREFIX = "/api/v1";

/** The backend's unversioned health endpoint. */
export const HEALTH_PATH = "/health";

/** A validated base URL, or the reason the configured value was rejected. */
export type ApiBaseUrlResolution =
  | { readonly valid: true; readonly baseUrl: string }
  | { readonly valid: false; readonly reason: string };

/** Trailing slashes are noise: every path this module is given starts with one. */
function withoutTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

/**
 * Validate a configured base URL.
 *
 * Accepted forms:
 *
 * - the empty string — same origin, the default;
 * - an absolute path such as `/greenhouse-api`, for a proxy mounted on a
 *   sub-path of the origin serving the portal;
 * - an absolute `http:`/`https:` URL such as `https://api.example.com`, for a
 *   deployment that reaches the backend cross-origin.
 *
 * A query string or fragment is always rejected: the portal appends its own
 * paths and query parameters, so either would silently corrupt every request.
 *
 * @param raw The configured value, or `undefined` when it is not set.
 * @returns The normalised base URL, or the reason it cannot be used.
 */
export function resolveApiBaseUrl(raw: string | undefined): ApiBaseUrlResolution {
  const value = (raw ?? "").trim();
  if (value === "") {
    return { valid: true, baseUrl: "" };
  }

  if (value.includes("?") || value.includes("#")) {
    return {
      valid: false,
      reason: `${API_BASE_URL_VARIABLE} must not contain a query string or fragment.`,
    };
  }

  if (value.startsWith("//")) {
    return {
      valid: false,
      reason: `${API_BASE_URL_VARIABLE} must not be protocol-relative; give a scheme or an absolute path.`,
    };
  }

  if (value.startsWith("/")) {
    return { valid: true, baseUrl: withoutTrailingSlash(value) };
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return {
      valid: false,
      reason: `${API_BASE_URL_VARIABLE} must be empty, an absolute path, or an absolute http(s) URL. Received "${value}".`,
    };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      valid: false,
      reason: `${API_BASE_URL_VARIABLE} must use http or https. Received "${parsed.protocol}".`,
    };
  }

  return { valid: true, baseUrl: withoutTrailingSlash(`${parsed.origin}${parsed.pathname}`) };
}

/** The resolution of this build's configuration, computed once. */
export const apiBaseUrl: ApiBaseUrlResolution = resolveApiBaseUrl(
  import.meta.env[API_BASE_URL_VARIABLE] as string | undefined,
);
