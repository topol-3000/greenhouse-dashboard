/**
 * Turning commands into rows, using configuration data and nothing else.
 *
 * `CommandRead` carries identifiers where a customer needs names:
 * `target_point_id` and `reported_point_id` are UUIDs. The facility
 * configuration document is what resolves them — one request describing every
 * point of the facility, already loaded and cached by the zone workspace — so a
 * hundred commands cost no request at all beyond the list itself. There is no
 * per-row lookup here and there must never be one.
 *
 * Two rules shape what is below.
 *
 * A label the portal cannot resolve is never a reason to hide a command. A point
 * that has been archived is left out of the configuration document, and its
 * commands are still real history: the row shows the identifier the API
 * published and says the name is unavailable, rather than disappearing.
 *
 * Reported state is the `reported_point_id` point's own state, read out of the
 * same document by that identifier. It is not the command's `desired_value`, it
 * is not evidence that a command succeeded, and it is not the control point's
 * own state projection. `false` and `0` are readings; `null` is not.
 */

import type {
  CommandRead,
  ConfigurationPoint,
  FacilityConfigurationRead,
} from "../../api/contract";
import type { ActuatorFeedback } from "../control/actuators";
import { hasReading } from "../monitoring/measurements";

/** A point named by a command, resolved against the configuration document. */
export interface PointLabel {
  /** The identifier the command published. Always known. */
  readonly pointId: string;
  /** The point's record, when the configuration document describes it. */
  readonly point: ConfigurationPoint | undefined;
  /** The name to show, or `undefined` when the document does not describe it. */
  readonly name: string | undefined;
  /** The code to show, or `undefined` for the same reason. */
  readonly code: string | undefined;
  /** Whether the document resolved this point at all. */
  readonly isResolved: boolean;
}

/** One command, with the labels its identifiers resolve to. */
export interface ActivityCommand {
  readonly command: CommandRead;
  /** The actuator the command was addressed to. */
  readonly target: PointLabel;
  /** The point that reports that actuator back. */
  readonly reported: PointLabel;
}

/**
 * Index a configuration document's points by identifier.
 *
 * Lower-cased on both sides because one identifier normally comes from the
 * address bar. Nothing else about the value is assumed.
 *
 * @param configuration The facility's configuration document, if it loaded.
 * @returns The points, by identifier.
 */
export function indexPoints(
  configuration: FacilityConfigurationRead | undefined,
): ReadonlyMap<string, ConfigurationPoint> {
  if (configuration === undefined) {
    return new Map();
  }
  return new Map(configuration.points.map((point) => [point.id.toLowerCase(), point]));
}

/**
 * Resolve one point identifier into a label.
 *
 * @param points The configuration document's points, by identifier.
 * @param pointId The identifier a command published.
 * @returns The label, resolved or not.
 */
export function readPointLabel(
  points: ReadonlyMap<string, ConfigurationPoint>,
  pointId: string,
): PointLabel {
  const point = points.get(pointId.toLowerCase());
  return {
    pointId,
    point,
    name: point?.name,
    code: point?.code,
    isResolved: point !== undefined,
  };
}

/**
 * Build the rows for one window of commands.
 *
 * The order is the backend's own — `created_at DESC, id DESC`, enforced by the
 * query — and is deliberately not touched. Re-sorting a window the contract
 * already ordered could only produce an order that disagrees with it.
 *
 * @param items The commands the list operation returned, in its order.
 * @param configuration The facility's configuration document, if it loaded.
 * @returns One row per command, in the order they arrived.
 */
export function toActivityCommands(
  items: readonly CommandRead[],
  configuration: FacilityConfigurationRead | undefined,
): readonly ActivityCommand[] {
  const points = indexPoints(configuration);
  return items.map((command) => ({
    command,
    target: readPointLabel(points, command.target_point_id),
    reported: readPointLabel(points, command.reported_point_id),
  }));
}

/**
 * The reported point's own last known state, for one opened command.
 *
 * Shaped as Unit 4's {@link ActuatorFeedback} so that the reported state renders
 * through the same component in both places: one point's state has one
 * representation in this portal, and two components could disagree.
 *
 * This is read for the opened command only. A reported-state block per row would
 * be one lookup per row for a value nobody is reading, and — more importantly —
 * would sit a current reading next to a command from last week as though the two
 * were related.
 *
 * @param configuration The facility's configuration document, if it loaded.
 * @param reportedPointId The identifier the command published.
 * @returns The feedback to render, or `undefined` when no document is loaded.
 */
export function readReportedFeedback(
  configuration: FacilityConfigurationRead | undefined,
  reportedPointId: string,
): ActuatorFeedback | undefined {
  if (configuration === undefined) {
    return undefined;
  }
  const point = indexPoints(configuration).get(reportedPointId.toLowerCase());
  return {
    pointId: reportedPointId,
    point,
    state: point?.state,
    hasReading: point === undefined ? false : hasReading(point.state),
  };
}
