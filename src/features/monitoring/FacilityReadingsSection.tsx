/**
 * What one facility is reading right now, for a screen above the control zone.
 *
 * The configuration document already describes every zone and every point of a
 * facility in one response, and the portal was already reading it to render a
 * single zone. This asks that same document the wider question, so a customer
 * sees the state of their greenhouse before choosing which part of it to open —
 * rather than having to open each zone in turn to find out.
 *
 * Every failure is scoped to this section. A facility whose configuration
 * cannot be read leaves the facility's identity, its zone list, the navigation
 * and the shell exactly where they were: a customer who cannot read a
 * temperature can still move around their greenhouses.
 *
 * It shows no total, no average, no minimum or maximum and no count of how many
 * points are in any particular state. Every number on screen is one the backend
 * published for one point; a figure assembled here out of several of them would
 * be this portal's claim rather than the greenhouse's.
 */

import { SectionCard } from "../../components/SectionCard";
import { LoadingState, StatePanel } from "../../components/StatePanel";
import {
  BackgroundRefreshNotice,
  RefreshFailurePanel,
  RequestErrorPanel,
} from "../../components/TopologyStates";
import type { FacilityReadings } from "./useFacilityReadings";
import { ZoneReadingsPanel } from "./ZoneReadingsPanel";

interface FacilityReadingsSectionProps {
  facilityId: string;
  facilityName: string;
  readings: FacilityReadings;
  /** The card's heading. The landing page names the facility; the workspace does not. */
  title?: string;
  testId?: string;
}

export function FacilityReadingsSection({
  facilityId,
  facilityName,
  readings,
  title = "Current readings",
  testId = "facility-readings",
}: FacilityReadingsSectionProps) {
  return (
    <SectionCard title={title} testId={testId}>
      {readings.isLoading ? <LoadingState label={`Loading readings for ${facilityName}…`} /> : null}

      {readings.error !== null && readings.error !== undefined ? (
        <RequestErrorPanel
          title={`Readings for ${facilityName} could not be loaded`}
          error={readings.error}
          onRetry={readings.refresh}
          retrying={readings.isRefreshing}
        />
      ) : null}

      {readings.refreshError !== null && readings.refreshError !== undefined ? (
        <RefreshFailurePanel
          error={readings.refreshError}
          onRetry={readings.refresh}
          retrying={readings.isRefreshing}
        />
      ) : null}

      {/* The poll is not something the customer asked for, so it is not
          announced: it would interrupt a screen reader every thirty seconds. */}
      {readings.isRefreshing ? <BackgroundRefreshNotice announce={false} /> : null}

      {readings.hasConfiguration && !readings.hasMeasurements ? (
        <StatePanel
          title="No measurement points in this facility"
          headingLevel={3}
          testId="facility-readings-empty"
        >
          <p>
            The cloud API assigns no active measurement point to any control zone of {facilityName}.
            Nothing is invented to fill the gap — when a point starts reporting, its reading appears
            here.
          </p>
        </StatePanel>
      ) : null}

      {readings.hasConfiguration && readings.hasMeasurements ? (
        <div className="d-flex flex-column gap-4">
          {readings.zones.map((zone) => (
            <ZoneReadingsPanel key={zone.zoneId} facilityId={facilityId} zone={zone} />
          ))}
        </div>
      ) : null}
    </SectionCard>
  );
}
