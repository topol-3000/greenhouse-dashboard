/**
 * What the portal is allowed to say about an automatic control rule.
 *
 * `ControlLoopRead` publishes an identifier, three point identifiers, a policy
 * and two numbers. It publishes no name, no unit and no statement of direction,
 * and that shapes every rule here:
 *
 * - a loop is *described*, never *named*. The description is built from the
 *   resolved names of the points the loop itself names, and the identifier stays
 *   on screen, so nothing reads as though the backend supplied a label;
 * - the thresholds stay bare numbers. The measurement point's unit is shown
 *   beside the point, not attached to a threshold: nothing in the contract says
 *   the two are expressed in the same unit, and borrowing it would be the portal
 *   asserting a relationship the API never stated;
 * - nothing is evaluated. No current reading is compared to a threshold, no rule
 *   is called active, firing or satisfied, and no direction is implied — the
 *   contract carries no enabled flag and no evaluation state at all.
 *
 * The points are resolved out of the facility configuration document the zone
 * workspace has already read, so naming them costs no request.
 */

import type {
  ConfigurationPoint,
  ControlLoopRead,
  FacilityConfigurationRead,
} from "../../api/contract";
import type { PointLabel } from "../activity/activityCommands";
import { indexPoints, readPointLabel } from "../activity/activityCommands";

/** One control loop, with the points it names resolved for display. */
export interface ZoneControlLoop {
  readonly loop: ControlLoopRead;
  /** The point the rule watches. */
  readonly measurement: PointLabel;
  /** The point the rule drives. */
  readonly control: PointLabel;
  /** The point that reports the result back. */
  readonly status: PointLabel;
  /**
   * The unit the measurement point publishes, or `null`.
   *
   * Belongs to the point, and is rendered beside it. It is deliberately not
   * carried onto the thresholds — see the module docblock.
   */
  readonly measurementUnit: string | null;
}

/**
 * Resolve a zone's control loops against a facility configuration document.
 *
 * @param loops The loops the cloud API returned for the zone.
 * @param configuration The facility's configuration document, if it loaded.
 * @returns The loops with their points resolved, in the API's own order.
 */
export function readZoneControlLoops(
  loops: readonly ControlLoopRead[],
  configuration: FacilityConfigurationRead | undefined,
): readonly ZoneControlLoop[] {
  const points = indexPoints(configuration);
  return loops.map((loop) => {
    const measurement = readPointLabel(points, loop.measurement_point_id);
    return {
      loop,
      measurement,
      control: readPointLabel(points, loop.control_point_id),
      status: readPointLabel(points, loop.status_point_id),
      measurementUnit: unitOf(measurement.point),
    };
  });
}

/** The unit a resolved point publishes, or `null` when it publishes none. */
function unitOf(point: ConfigurationPoint | undefined): string | null {
  return point?.unit ?? null;
}

/**
 * Describe one control loop in words, without claiming it has a name.
 *
 * The phrasing is deliberately a sentence about what the rule connects rather
 * than a title, because a title would read as something the backend published.
 *
 * @param loop The resolved loop.
 * @returns The description.
 */
export function describeControlLoop(loop: ZoneControlLoop): string {
  const driven = loop.control.name ?? "a control point this configuration does not describe";
  const from = loop.measurement.name ?? "a measurement point this configuration does not describe";
  return `Drives ${driven} from ${from}`;
}

/**
 * Find the loop a command names, if the zone's list contains it.
 *
 * A command may name a loop the zone's list does not contain — the list is
 * scoped to one zone, and a loop can be deleted after it issued a command. That
 * is reported as unresolved rather than papered over.
 *
 * @param loops The zone's resolved loops.
 * @param controlLoopId The identifier a command published, if it published one.
 * @returns The loop, or `undefined`.
 */
export function findControlLoop(
  loops: readonly ZoneControlLoop[],
  controlLoopId: string | null,
): ZoneControlLoop | undefined {
  if (controlLoopId === null) {
    return undefined;
  }
  const wanted = controlLoopId.trim().toLowerCase();
  return loops.find((candidate) => candidate.loop.id.toLowerCase() === wanted);
}
