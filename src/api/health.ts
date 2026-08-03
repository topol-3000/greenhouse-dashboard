/**
 * The cloud API's published health contract.
 *
 * `GET /health` is unversioned and is the only endpoint this unit consumes. It
 * answers `200` when the service and its database are up and `503` with the
 * same document when they are not, so a `503` is read rather than thrown away.
 */

import { HEALTH_PATH } from "./config";
import { ParseError } from "./errors";
import { getJson } from "./http";

/** The two values the backend publishes for `status` and `database`. */
export type HealthState = "ok" | "unavailable";

/** The backend's `HealthResponse`, consumed exactly as published. */
export interface HealthDto {
  readonly status: HealthState;
  readonly service: string;
  readonly database: HealthState;
}

function isHealthState(value: unknown): value is HealthState {
  return value === "ok" || value === "unavailable";
}

/**
 * Decode a health document.
 *
 * Unknown additive fields are ignored rather than rejected, so a backend that
 * publishes more later does not break this portal.
 *
 * @param body The decoded response body.
 * @returns The health document.
 * @throws {ParseError} When a required field is missing or has an unknown value.
 */
export function parseHealth(body: unknown): HealthDto {
  if (typeof body !== "object" || body === null) {
    throw new ParseError("The health response was not an object.");
  }
  const record = body as Record<string, unknown>;
  if (!isHealthState(record["status"])) {
    throw new ParseError("The health response has no readable status.");
  }
  if (!isHealthState(record["database"])) {
    throw new ParseError("The health response has no readable database status.");
  }
  return {
    status: record["status"],
    service: typeof record["service"] === "string" ? record["service"] : "greenhouse",
    database: record["database"],
  };
}

/**
 * Read the cloud API's health.
 *
 * @param signal Abort signal from the query.
 * @returns The health document, whether the backend reported `200` or `503`.
 */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthDto> {
  const payload = await getJson(HEALTH_PATH, { signal, acceptStatuses: [503] });
  return parseHealth(payload.body);
}
