/**
 * What manual control is allowed to offer, derived from the contract.
 *
 * `POST /api/v1/commands` states its own precondition, and every clause of it is
 * an explicit field of the configuration document. A point is offered an action
 * only when all of them hold:
 *
 * | Clause of the contract                      | Field checked                           |
 * | ------------------------------------------- | --------------------------------------- |
 * | "an active boolean control point"           | `point_kind`, `status`, `data_type`     |
 * | "assigned to the named zone in the          | `ConfigurationZonePoint.role` on the    |
 * | `control_output` role"                      | link between this zone and this point   |
 * | "and names a reported status point"         | `reported_point_id`                     |
 *
 * Nothing is inferred. A point called "North vent", a `metric_type` of
 * `vent_position` and a unit of `%` are all just text: a point that the API does
 * not publish as an active boolean `control` point in the `control_output` role
 * of *this* zone is not an actuator, whatever it is called. A control point that
 * fails a clause is not hidden — it is listed with the reason it cannot be
 * commanded — but it is given no action, because the contract cannot say what a
 * valid action for it would be.
 *
 * Reported state comes from the point `reported_point_id` names, read out of the
 * same document by that identifier. Points are never paired by a similar name, a
 * matching unit or a shared position in a list.
 */

import type {
  ConfigurationPoint,
  ConfigurationPointState,
  FacilityConfigurationRead,
  PointDataType,
  StatusEnum,
} from "../../api/contract";
import {
  ACTIVE_STATUS,
  BOOLEAN_DATA_TYPE,
  CONTROL_OUTPUT_ROLE,
  CONTROL_POINT_KIND,
} from "../../api/contract";
import { sameResourceId } from "../../api/topology";
import { hasReading } from "../monitoring/measurements";

/**
 * Why a control point of this zone carries no manual action.
 *
 * Each value names the clause of `POST /api/v1/commands` the point fails. They
 * are reported rather than filtered away silently, so a customer who expects a
 * control to be here learns what the cloud API is missing instead of wondering.
 */
export type ActuatorExclusion =
  "archived" | "not-boolean" | "no-reported-point" | "reported-point-absent";

/** The point that reports an actuator back, as the contract relates it. */
export interface ActuatorFeedback {
  /** The identifier `reported_point_id` published on the control point. */
  readonly pointId: string;
  /** The reported point's own record, when the document describes it. */
  readonly point: ConfigurationPoint | undefined;
  /** The reported point's last known state, when it is in the document. */
  readonly state: ConfigurationPointState | undefined;
  /** Whether {@link state} carries a value at all. `false` and `0` do. */
  readonly hasReading: boolean;
}

/** One control point of a control zone, and whether it can be commanded. */
export interface ZoneActuator {
  readonly pointId: string;
  readonly code: string;
  readonly name: string;
  /** The quantity the backend says this point drives, verbatim. */
  readonly metricType: string;
  readonly dataType: PointDataType;
  readonly status: StatusEnum;
  /** The point that reports this one back, or `undefined` when none is named. */
  readonly feedback: ActuatorFeedback | undefined;
  /**
   * Whether the contract proves a manual command for this point is valid.
   *
   * `true` only when every clause of the creation operation's precondition
   * holds. It is the one thing that decides whether an action is rendered.
   */
  readonly isCommandable: boolean;
  /** Why it is not commandable, when it is not. */
  readonly exclusion: ActuatorExclusion | undefined;
}

/** The manual-control inventory of one control zone. */
export interface ZoneActuatorInventory {
  /** Whether the configuration document contains this zone at all. */
  readonly zoneFound: boolean;
  /** Every control point assigned to this zone as a `control_output`. */
  readonly actuators: readonly ZoneActuator[];
}

/** Whether a point is a control point the customer might drive. */
export function isControlPoint(point: ConfigurationPoint): boolean {
  return point.point_kind === CONTROL_POINT_KIND;
}

/**
 * Read one zone's controllable points out of a facility configuration document.
 *
 * The join is done on identifiers the document publishes — `point_id` on the
 * zone's link, `id` on the point, `reported_point_id` on the control point — and
 * never on a code, a name or a position.
 *
 * @param configuration The facility's configuration document.
 * @param zoneId The zone to describe, as the route supplied it.
 * @returns The zone's control points, in the document's own order.
 */
export function readZoneActuators(
  configuration: FacilityConfigurationRead,
  zoneId: string,
): ZoneActuatorInventory {
  const zone = configuration.control_zones.find((candidate) =>
    sameResourceId(candidate.id, zoneId),
  );
  if (zone === undefined) {
    return { zoneFound: false, actuators: [] };
  }

  const byId = new Map(configuration.points.map((point) => [point.id.toLowerCase(), point]));

  const actuators: ZoneActuator[] = [];
  for (const link of zone.points) {
    // The role is a property of the link, not of the point: the same point can
    // be a `control_output` of one zone and a `safety_interlock` of another, and
    // only the first is a manual target of the zone in the address.
    if (link.role !== CONTROL_OUTPUT_ROLE) {
      continue;
    }
    const point = byId.get(link.point_id.toLowerCase());
    if (point === undefined || !isControlPoint(point)) {
      continue;
    }

    const reportedPointId = point.reported_point_id;
    const reportedPoint =
      reportedPointId === null ? undefined : byId.get(reportedPointId.toLowerCase());

    const feedback: ActuatorFeedback | undefined =
      reportedPointId === null
        ? undefined
        : {
            pointId: reportedPointId,
            point: reportedPoint,
            state: reportedPoint?.state,
            hasReading: reportedPoint === undefined ? false : hasReading(reportedPoint.state),
          };

    const exclusion = excludeActuator(point, reportedPoint);

    actuators.push({
      pointId: point.id,
      code: point.code,
      name: point.name,
      metricType: point.metric_type,
      dataType: point.data_type,
      status: point.status,
      feedback,
      isCommandable: exclusion === undefined,
      exclusion,
    });
  }

  return { zoneFound: true, actuators };
}

/**
 * Decide which clause of the creation precondition a control point fails.
 *
 * @param point The control point, already known to be one.
 * @param reportedPoint The point `reported_point_id` names, when the document
 *   describes it.
 * @returns The failing clause, or `undefined` when every clause holds.
 */
function excludeActuator(
  point: ConfigurationPoint,
  reportedPoint: ConfigurationPoint | undefined,
): ActuatorExclusion | undefined {
  if (point.status !== ACTIVE_STATUS) {
    return "archived";
  }
  if (point.data_type !== BOOLEAN_DATA_TYPE) {
    return "not-boolean";
  }
  if (point.reported_point_id === null) {
    return "no-reported-point";
  }
  // The document leaves archived points out, so a reported point it does not
  // describe is one whose state the portal cannot show. The command boundary
  // would still accept the request, but the confirmation could not state the
  // current reported state and the result could not be read back, so the portal
  // says so rather than commanding into a state it cannot observe.
  if (reportedPoint === undefined) {
    return "reported-point-absent";
  }
  return undefined;
}

/**
 * A short sentence for a control point that carries no action.
 *
 * @param exclusion The clause the point fails.
 * @returns Words for the customer, naming the contract's own reason.
 */
export function describeExclusion(exclusion: ActuatorExclusion): string {
  switch (exclusion) {
    case "archived":
      return "The cloud API lists this control point as archived, so it is not available for use.";
    case "not-boolean":
      return "The cloud API publishes no on/off values for this control point, and the manual command operation accepts nothing else.";
    case "no-reported-point":
      return "The cloud API names no point that reports this control point back, which a manual command requires.";
    case "reported-point-absent":
      return "The cloud API names a point that reports this control point back, but does not describe it in this facility’s configuration.";
  }
}
