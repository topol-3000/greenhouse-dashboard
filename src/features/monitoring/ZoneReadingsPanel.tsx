/**
 * One control zone's readings, shown from outside that zone.
 *
 * The zone heading is not decoration. `role` — primary measurement, secondary
 * measurement — is a property of the zone's link to a point, so a reading only
 * means what it says underneath the zone it is being read as part of. Grouping
 * is what makes the same point legitimately appearing under two zones legible
 * instead of looking like a duplicate.
 *
 * Every card links into the zone that owns it, carrying the point, so this is a
 * way into the workspace rather than a copy of it. Nothing here is selectable
 * and nothing here charts: the history lives in the zone, and so does the
 * control.
 *
 * The zone heading is deliberately not a link. On the facility workspace the
 * zone list directly above already links to the same place, and a second link
 * with the same accessible name pointing at the same address is a thing a
 * screen reader has to read twice to discover it was one destination. The way
 * in is the card, whose name says which point it opens.
 */

import { CCol, CRow } from "@coreui/react";
import { useId } from "react";
import { Link } from "react-router";
import { StatePanel } from "../../components/StatePanel";
import { controlZonePath } from "../../routes/routes";
import { POINT_PARAM } from "./useZoneMonitoring";
import type { ZoneReadings } from "./facilityMeasurements";
import { MeasurementCard } from "./MeasurementCard";

interface ZoneReadingsPanelProps {
  /** The facility the zone belongs to, for the link into its workspace. */
  facilityId: string;
  zone: ZoneReadings;
}

export function ZoneReadingsPanel({ facilityId, zone }: ZoneReadingsPanelProps) {
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className="d-flex flex-column gap-3"
      data-testid="zone-readings"
      data-zone-id={zone.zoneId}
    >
      <div className="d-flex flex-wrap align-items-baseline gap-2">
        <h3 className="text-break mb-0" id={headingId}>
          {zone.zoneName}
        </h3>
        <code>{zone.zoneCode}</code>
      </div>

      {zone.measurements.length === 0 ? (
        <StatePanel
          title="No measurement points in this control zone"
          headingLevel={4}
          testId="zone-readings-empty"
        >
          <p>
            The cloud API assigns no active measurement point to {zone.zoneName}. Any control or
            status points it has are shown inside the zone; they are not measurements and carry no
            reading.
          </p>
        </StatePanel>
      ) : (
        <CRow className="g-3" data-testid="zone-measurement-cards">
          {zone.measurements.map((measurement) => (
            <CCol key={measurement.pointId} xs={12} md={6} xl={4} xxl={3}>
              <MeasurementCard
                measurement={measurement}
                action={
                  <Link
                    className="btn btn-outline-secondary btn-sm"
                    to={controlZonePath(facilityId, zone.zoneId, {
                      [POINT_PARAM]: measurement.pointId,
                    })}
                  >
                    Open history of {measurement.name}
                  </Link>
                }
              />
            </CCol>
          ))}
        </CRow>
      )}
    </section>
  );
}
