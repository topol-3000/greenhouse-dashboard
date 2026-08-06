/**
 * Reading a whole facility's measurements, tested apart from the screens that
 * render them.
 *
 * The decisions worth pinning here are the ones that only appear above the
 * level of a single zone: that every zone of the document survives, that a
 * point assigned to two zones is two readings rather than one, and that the
 * question "is this a measurement?" is still answered in exactly one place.
 */

import { describe, expect, it } from "vitest";
import type { FacilityConfigurationRead } from "../../api/contract";
import {
  climateZone,
  irrigationZone,
  northConfiguration,
  POINT_IDS,
  seedlingConfiguration,
} from "../../test/fixtures";
import { hasAnyMeasurement, readFacilityMeasurements } from "./facilityMeasurements";
import { readZoneMeasurements } from "./measurements";

/**
 * The same configuration with the air temperature point also assigned to the
 * irrigation zone, in a different role. The contract allows this: `role` lives
 * on the zone's link to the point, not on the point.
 */
function withSharedPoint(): FacilityConfigurationRead {
  return {
    ...northConfiguration,
    control_zones: northConfiguration.control_zones.map((zone) =>
      zone.id === irrigationZone.id
        ? {
            ...zone,
            points: [
              {
                point_id: POINT_IDS.airTemp,
                code: "north-air-temp",
                role: "secondary_measurement",
              },
            ],
          }
        : zone,
    ),
  };
}

describe("reading a facility's measurements", () => {
  it("keeps every control zone the document describes, in its order", () => {
    const zones = readFacilityMeasurements(northConfiguration);

    expect(zones.map((zone) => zone.zoneId)).toEqual([climateZone.id, irrigationZone.id]);
    expect(zones.map((zone) => zone.zoneName)).toEqual([climateZone.name, irrigationZone.name]);
  });

  it("keeps a zone that has no measurement points rather than dropping it", () => {
    // "This zone has no measurements" is an answer. Leaving the zone out would
    // make the facility look like it does not have it.
    const zones = readFacilityMeasurements(northConfiguration);
    const irrigation = zones.find((zone) => zone.zoneId === irrigationZone.id);

    expect(irrigation).toBeDefined();
    expect(irrigation?.measurements).toHaveLength(0);
  });

  it("answers what a measurement is exactly as the zone workspace does", () => {
    const zones = readFacilityMeasurements(northConfiguration);
    const climate = zones.find((zone) => zone.zoneId === climateZone.id);

    expect(climate?.measurements).toEqual(
      readZoneMeasurements(northConfiguration, climateZone.id).measurements,
    );
  });

  it("carries no control or status point into a facility's readings", () => {
    const everyPointId = readFacilityMeasurements(northConfiguration).flatMap((zone) =>
      zone.measurements.map((measurement) => measurement.pointId),
    );

    expect(everyPointId).not.toContain(POINT_IDS.vent);
    expect(everyPointId).not.toContain(POINT_IDS.humiditySensorStatus);
  });

  it("reads a point assigned to two zones once per zone, with each zone's role", () => {
    // Flattening these into one list would have to pick one role and discard
    // the other. The zone each reading is read under is part of the reading.
    const zones = readFacilityMeasurements(withSharedPoint());
    const climate = zones.find((zone) => zone.zoneId === climateZone.id);
    const irrigation = zones.find((zone) => zone.zoneId === irrigationZone.id);

    const inClimate = climate?.measurements.find((m) => m.pointId === POINT_IDS.airTemp);
    const inIrrigation = irrigation?.measurements.find((m) => m.pointId === POINT_IDS.airTemp);

    expect(inClimate?.role).toBe("primary_measurement");
    expect(inIrrigation?.role).toBe("secondary_measurement");
    expect(inClimate?.state).toEqual(inIrrigation?.state);
  });

  it("says whether a facility has any measurement at all", () => {
    expect(hasAnyMeasurement(readFacilityMeasurements(northConfiguration))).toBe(true);
    // The Seedling Room's one zone is assigned no points.
    expect(hasAnyMeasurement(readFacilityMeasurements(seedlingConfiguration))).toBe(false);
  });
});
