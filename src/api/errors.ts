/**
 * Failure types the API boundary raises.
 *
 * Every failure reaching the portal is one of these, so a screen can tell
 * "the cloud API said no" from "the cloud API could not be reached" from "this
 * deployment is misconfigured" without inspecting raw exceptions.
 */

/** The backend answered with an unexpected status. */
export class ApiError extends Error {
  readonly status: number;
  /** Machine-readable `error.code` from the backend envelope, when present. */
  readonly code: string | undefined;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** The request never completed: offline, DNS failure, proxy refused. */
export class NetworkError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "NetworkError";
  }
}

/** The response arrived but did not match the documented contract. */
export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
}

/** The portal's own API configuration cannot be used to build a request. */
export class ApiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiConfigError";
  }
}

/**
 * Turn any thrown value into a short sentence for the user.
 *
 * @param error The caught value.
 * @returns A message safe to render.
 */
export function describeError(error: unknown): string {
  if (error instanceof ApiConfigError) {
    return `This portal is misconfigured. ${error.message}`;
  }
  if (error instanceof ApiError) {
    if (error.status === 404) {
      return "The cloud API does not have that resource (404).";
    }
    return `The cloud API answered ${String(error.status)}${error.code ? ` (${error.code})` : ""}.`;
  }
  if (error instanceof NetworkError) {
    return "The portal could not reach the cloud API.";
  }
  if (error instanceof ParseError) {
    return `The cloud API returned an unexpected response. ${error.message}`;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Something went wrong while contacting the cloud API.";
}
