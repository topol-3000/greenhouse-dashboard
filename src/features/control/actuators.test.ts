/**
 * Which points may be commanded, and which may not.
 *
 * Every case here is one clause of the precondition `POST /api/v1/commands`
 * publishes. A portal that checks four of the five fails in this file rather
 * than in a customer's greenhouse, and a portal that classifies by a point's
 * name fails on the fixtures deliberately named to catch it.
 */

import { describe, expect, it } from "vitest";
import type { ConfigurationPoint, FacilityConfigurationRead } from "../../api/contract";
import {
  climateZone,
  irrigationZone,
  northConfiguration,
  northConfigurationPoints,
  POINT_IDS,
} from "../../test/fixtures";
import { describeExclusion, readZoneActuators } from "./actuators";

/** The same document with one point replaced, so one clause changes at a time. */
function withPoint(replacement: ConfigurationPoint): FacilityConfigurationRead {
  return {
    ...northConfiguration,
    points: northConfigurationPoints.map((point) =>
      point.id === replacement.id ? replacement : point,
    ),
  };
}

/** The fixture's own record for one point. */
function pointFixture(pointId: string): ConfigurationPoint {
  const point = northConfigurationPoints.find((candidate) => candidate.id === pointId);
  if (point === undefined) {
    throw new Error(`No configuration point fixture for ${pointId}`);
  }
  return point;
}

const inventory = () => readZoneActuators(northConfiguration, climateZone.id);

describe("the controllable inventory", () => {
  it("offers every control output the contract fully supports, and no other", () => {
    const commandable = inventory()
      .actuators.filter((actuator) => actuator.isCommandable)
      .map((actuator) => actuator.pointId);

    // Two of them, so no portal can pass by picking the first control point it
    // finds, and the order is the document's rather than a chosen one.
    expect(commandable).toEqual([POINT_IDS.vent, POINT_IDS.lamp]);
  });

  it("never treats a measurement or a status point as a command target", () => {
    const listed = inventory().actuators.map((actuator) => actuator.pointId);

    expect(listed).not.toContain(POINT_IDS.airTemp);
    expect(listed).not.toContain(POINT_IDS.leafWetness);
    expect(listed).not.toContain(POINT_IDS.humiditySensorStatus);
    expect(listed).not.toContain(POINT_IDS.ventStatus);
    // Named "North lamp power switch", and a `status` point.
    expect(listed).not.toContain(POINT_IDS.lampStatus);
  });

  it("classifies by point_kind, never by what a point is called", () => {
    const commandable = inventory().actuators.filter((actuator) => actuator.isCommandable);

    // "North air temperature vent" reads like a measurement and is a control
    // point; "North lamp power switch" reads like an actuator and is a status
    // point. Only `point_kind` decides, and it decides both ways.
    expect(commandable.map((actuator) => actuator.pointId)).toContain(POINT_IDS.vent);
    expect(commandable.map((actuator) => actuator.name)).not.toContain("North lamp power switch");
  });

  it("leaves out a control point this zone does not assign as a control output", () => {
    const listed = inventory().actuators.map((actuator) => actuator.pointId);

    // An active boolean control point with feedback configured — assigned here
    // as a `safety_interlock`. The role belongs to the link, not to the point.
    expect(listed).not.toContain(POINT_IDS.interlock);
  });

  it("offers no action for an archived control point", () => {
    const pump = inventory().actuators.find(
      (actuator) => actuator.pointId === POINT_IDS.archivedPump,
    );

    expect(pump?.isCommandable).toBe(false);
    expect(pump?.exclusion).toBe("archived");
  });

  it("offers no action for a control point that is not boolean", () => {
    const dimmer = inventory().actuators.find((actuator) => actuator.pointId === POINT_IDS.dimmer);

    // A `float` control point with a `%` unit. The command schema accepts a
    // strict `bool` and publishes no bounds, step or range for anything else,
    // so there is no action to offer and none is invented.
    expect(dimmer?.isCommandable).toBe(false);
    expect(dimmer?.exclusion).toBe("not-boolean");
  });

  it("offers no action for a control point with no point reporting it back", () => {
    const heater = inventory().actuators.find((actuator) => actuator.pointId === POINT_IDS.heater);

    expect(heater?.isCommandable).toBe(false);
    expect(heater?.exclusion).toBe("no-reported-point");
    expect(heater?.feedback).toBeUndefined();
  });

  it("offers no action when the reported point is not in the document", () => {
    const configuration: FacilityConfigurationRead = {
      ...northConfiguration,
      points: northConfigurationPoints.filter((point) => point.id !== POINT_IDS.ventStatus),
    };

    const vent = readZoneActuators(configuration, climateZone.id).actuators.find(
      (actuator) => actuator.pointId === POINT_IDS.vent,
    );

    expect(vent?.isCommandable).toBe(false);
    expect(vent?.exclusion).toBe("reported-point-absent");
  });

  it("has words for every reason it withholds an action", () => {
    for (const exclusion of [
      "archived",
      "not-boolean",
      "no-reported-point",
      "reported-point-absent",
    ] as const) {
      expect(describeExclusion(exclusion).length).toBeGreaterThan(0);
    }
  });
});

describe("the reported state relationship", () => {
  it("pairs a control point only through reported_point_id", () => {
    const vent = inventory().actuators.find((actuator) => actuator.pointId === POINT_IDS.vent);

    expect(vent?.feedback?.pointId).toBe(POINT_IDS.ventStatus);
    expect(vent?.feedback?.point?.name).toBe("North vent status");
  });

  it("does not pair by a similar name, a shared metric or a list position", () => {
    // The dimmer shares `vent_position` with the vent and sits next to it in the
    // document. Repointing the vent's feedback at an unrelated point must move
    // the reported state with the identifier, not with the resemblance.
    const configuration = withPoint({
      ...pointFixture(POINT_IDS.vent),
      reported_point_id: POINT_IDS.interlockStatus,
    });

    const vent = readZoneActuators(configuration, climateZone.id).actuators.find(
      (actuator) => actuator.pointId === POINT_IDS.vent,
    );

    expect(vent?.feedback?.pointId).toBe(POINT_IDS.interlockStatus);
    expect(vent?.feedback?.point?.name).toBe("North frost interlock status");
  });

  it("treats a reported false as a reading and a null as no reading", () => {
    const actuators = inventory().actuators;
    const vent = actuators.find((actuator) => actuator.pointId === POINT_IDS.vent);
    const lamp = actuators.find((actuator) => actuator.pointId === POINT_IDS.lamp);

    expect(vent?.feedback?.state?.value).toBe(false);
    expect(vent?.feedback?.hasReading).toBe(true);

    expect(lamp?.feedback?.state?.value).toBeNull();
    expect(lamp?.feedback?.hasReading).toBe(false);
  });

  it("never presents the control point's own projection as reported state", () => {
    const vent = inventory().actuators.find((actuator) => actuator.pointId === POINT_IDS.vent);

    // The control point's own state is `true` in the fixture and the reported
    // point's is `false`. The reported state is the reported point's.
    expect(pointFixture(POINT_IDS.vent).state.value).toBe(true);
    expect(vent?.feedback?.state?.value).toBe(false);
  });
});

describe("zones without controls", () => {
  it("reports an empty inventory for a zone that assigns no control output", () => {
    const result = readZoneActuators(northConfiguration, irrigationZone.id);

    expect(result.zoneFound).toBe(true);
    expect(result.actuators).toEqual([]);
  });

  it("reports a zone the document does not describe as absent, not empty", () => {
    const result = readZoneActuators(northConfiguration, "9b3e1f5c-8d30-4b49-9d8f-7b4d3e1f9999");

    expect(result.zoneFound).toBe(false);
    expect(result.actuators).toEqual([]);
  });
});
