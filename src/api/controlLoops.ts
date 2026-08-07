/**
 * Control-loop requests: the automatic rules configured for one control zone.
 *
 * One operation, read-only: `GET /api/v1/control-loops?control_zone_id=`. The
 * portal creates, edits, enables, disables and deletes no loop, and it never
 * asks for a loop by identifier — a zone's whole list is one request, and
 * resolving a command's `control_loop_id` against it is a lookup rather than a
 * request per row. That is the same rule the portal already applies to point
 * labels.
 *
 * This is a separate module from `control.ts` on purpose. That module's subject
 * is the one write the portal makes — idempotency, confirmation, never
 * retrying — and it uses the count-free `CommandListRead` with no pagination
 * machinery at all. Control loops are read-only paginated configuration, and
 * folding them in would make one file answer two unrelated questions.
 *
 * Identifiers arriving from a route or a query string are untrusted text; they
 * are encoded, never interpolated raw.
 */

import { API_V1_PREFIX } from "./config";
import type { ControlLoopRead } from "./contract";
import { asRecord, requireContractEnum, requireNumber, requireString } from "./decode";
import { getJson } from "./http";
import type { Collection, PageWindow } from "./pagination";
import { collectPages, parsePage } from "./pagination";
import { windowQuery } from "./topology";

const CONTROL_LOOPS_PATH = `${API_V1_PREFIX}/control-loops`;

/** Cancellation, carried by every control-loop request. */
export interface ControlLoopRequestOptions {
  readonly signal?: AbortSignal | undefined;
}

/**
 * Decode one control loop.
 *
 * Both thresholds go through `requireNumber`, which rejects a non-finite value
 * and does not coerce a numeric string: `ControlLoopRead` types them as plain
 * numbers, and a threshold the portal could not read is a loop it must not
 * describe rather than one it describes with a guess.
 *
 * @param body One `ControlLoopRead` as the API sent it.
 * @returns The decoded control loop.
 */
export function parseControlLoop(body: unknown): ControlLoopRead {
  const context = "control loop";
  const record = asRecord(body, context);
  return {
    id: requireString(record, "id", context),
    control_zone_id: requireString(record, "control_zone_id", context),
    measurement_point_id: requireString(record, "measurement_point_id", context),
    control_point_id: requireString(record, "control_point_id", context),
    status_point_id: requireString(record, "status_point_id", context),
    policy_type: requireContractEnum(record, "policy_type", context),
    lower_threshold: requireNumber(record, "lower_threshold", context),
    upper_threshold: requireNumber(record, "upper_threshold", context),
    created_at: requireString(record, "created_at", context),
  };
}

/**
 * List the control loops the cloud API configures for one control zone.
 *
 * @param zoneId The control zone, untrusted.
 * @param options Cancellation.
 * @returns The loops, the backend's total, and whether the two agree.
 */
export async function fetchControlLoops(
  zoneId: string,
  options: ControlLoopRequestOptions = {},
): Promise<Collection<ControlLoopRead>> {
  return collectPages<ControlLoopRead>(async (window: PageWindow) => {
    const payload = await getJson(CONTROL_LOOPS_PATH, {
      signal: options.signal,
      query: { ...windowQuery(window), control_zone_id: zoneId },
    });
    return parsePage(payload.body, parseControlLoop, "control loop page");
  });
}
