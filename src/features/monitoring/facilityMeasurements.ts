/**
 * A whole facility's measurement points, grouped by the zone that owns them.
 *
 * The configuration document already describes every zone and every point of a
 * facility in one response, so this costs no request the portal was not already
 * making: it is the same document the control zone workspace reads, asked a
 * wider question.
 *
 * What a measurement *is* stays decided in one place. This walks the zones and
 * defers to {@link readZoneMeasurements} for each, so a rule about point kind,
 * status or state cannot come to mean one thing inside a zone and another
 * above it.
 *
 * The grouping is not cosmetic. `role` — primary measurement, secondary
 * measurement — is a property of the zone's link to the point, not of the
 * point, so one point assigned to two zones is two entries with two different
 * roles. Flattening them into one list would have to pick a role and discard
 * the other; keeping the zone around says plainly which zone each reading is
 * being read as part of.
 *
 * A zone with no measurement points is kept, not dropped. "This zone has no
 * measurements" is an answer; leaving the zone out would make it look like the
 * facility does not have it.
 */

import type { FacilityConfigurationRead, StatusEnum, ZoneType } from "../../api/contract";
import type { ZoneMeasurement } from "./measurements";
import { readZoneMeasurements } from "./measurements";

/** One control zone of a facility, with the measurements it is assigned. */
export interface ZoneReadings {
  readonly zoneId: string;
  readonly zoneName: string;
  readonly zoneCode: string;
  readonly zoneType: ZoneType;
  readonly zoneStatus: StatusEnum;
  /** The zone's active measurement points, in the document's own order. */
  readonly measurements: readonly ZoneMeasurement[];
}

/**
 * Read every zone of a facility, with each zone's measurement points.
 *
 * @param configuration The facility's configuration document.
 * @returns One entry per control zone the document describes, in its order.
 */
export function readFacilityMeasurements(
  configuration: FacilityConfigurationRead,
): readonly ZoneReadings[] {
  return configuration.control_zones.map((zone) => ({
    zoneId: zone.id,
    zoneName: zone.name,
    zoneCode: zone.code,
    zoneType: zone.zone_type,
    zoneStatus: zone.status,
    measurements: readZoneMeasurements(configuration, zone.id).measurements,
  }));
}

/**
 * Whether any zone of a facility has a measurement point at all.
 *
 * A facility whose zones are all composition and control has nothing to show
 * in a readings section, and saying so once is plainer than repeating "no
 * measurements" under every zone heading.
 *
 * @param zones The facility's zones, as {@link readFacilityMeasurements} read them.
 * @returns Whether at least one zone has at least one measurement point.
 */
export function hasAnyMeasurement(zones: readonly ZoneReadings[]): boolean {
  return zones.some((zone) => zone.measurements.length > 0);
}
