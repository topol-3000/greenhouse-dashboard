/**
 * Failure types the API boundary raises.
 *
 * Every failure reaching the UI is one of these, so a screen can decide between
 * "the backend said no" and "the backend said something we cannot read" without
 * inspecting raw exceptions.
 */

/** The backend answered with a non-2xx status. */
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

/** The response was 2xx but did not match the documented contract. */
export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
}

/**
 * Turn any thrown value into a short sentence for the user.
 *
 * @param error The caught value.
 * @returns A message safe to render.
 */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) {
      return "The backend does not have that resource (404).";
    }
    return `The backend answered ${String(error.status)}${error.code ? ` (${error.code})` : ""}.`;
  }
  if (error instanceof NetworkError) {
    return "The dashboard could not reach the greenhouse API.";
  }
  if (error instanceof ParseError) {
    return `The greenhouse API returned an unexpected response. ${error.message}`;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Something went wrong while loading data.";
}
