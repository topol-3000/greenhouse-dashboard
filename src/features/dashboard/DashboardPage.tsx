/**
 * The Customer Portal dashboard.
 *
 * One feature and one route of the portal, not the application itself. It
 * states what the portal is for, reports whether the cloud API can be reached,
 * gives the customer the cloud API's own count of their sites and facilities,
 * and then answers the question a landing page exists to answer: what are the
 * greenhouses reading right now.
 *
 * The two answers at the top — is the cloud API reachable, and what does it say
 * you have — are peers, so on a wide screen they sit side by side rather than
 * one above the other with the second below the fold. The readings follow,
 * facility by facility, each one a way into that facility rather than a copy of
 * it.
 *
 * The reading list is bounded, because the contract has no operation that
 * describes more than one facility and this page will not open an unbounded
 * number of polls on a customer's behalf. When it is showing fewer facilities
 * than the cloud API reports, it says so, and Greenhouses still reaches all of
 * them.
 *
 * Every figure on this page came from the API, for one point or as one of the
 * backend's own totals. There is no actuator state, no command, no alert and no
 * operational health here, and nothing is added up across facilities: a
 * portal-computed average or a "3 of 8 zones" would be this portal's claim
 * rather than the greenhouse's.
 */

import { CCol, CRow } from "@coreui/react";
import { useApiAvailability } from "../../api/availability";
import { SectionCard } from "../../components/SectionCard";
import { Note } from "../../components/StatePanel";
import { FacilityReadingsSection } from "../monitoring/FacilityReadingsSection";
import { ApiAvailabilityPanel } from "./ApiAvailabilityPanel";
import { TopologySummaryPanel } from "./TopologySummaryPanel";
import { useDashboardReadings } from "./useDashboardReadings";

export function DashboardPage() {
  const { availability, recheck } = useApiAvailability();
  const readings = useDashboardReadings();

  return (
    <div className="d-flex flex-column gap-4" data-testid="dashboard-page">
      <SectionCard title="Monitor and operate your greenhouse facilities">
        <p className="prose text-body-secondary">
          This portal is where you follow the state of your greenhouse facilities and operate them
          by hand. It talks to the AI Greenhouse cloud API and shows only what that API reports.
        </p>
      </SectionCard>

      <CRow className="g-4">
        <CCol xs={12} xl={6}>
          <SectionCard title="Cloud API" fillHeight>
            <ApiAvailabilityPanel availability={availability} onRecheck={recheck} />
          </SectionCard>
        </CCol>

        <CCol xs={12} xl={6}>
          <SectionCard title="Greenhouse resources" fillHeight>
            <TopologySummaryPanel />
          </SectionCard>
        </CCol>
      </CRow>

      {readings.isBounded ? (
        <Note tone="warning" testId="dashboard-readings-bound">
          Readings are shown for the first {String(readings.facilities.length)} of the{" "}
          {String(readings.total)} facilities the cloud API reports. Open Greenhouses to reach any
          of them.
        </Note>
      ) : null}

      {readings.facilities.map(({ facility, readings: facilityReadings }) => (
        <FacilityReadingsSection
          key={facility.id}
          facilityId={facility.id}
          facilityName={facility.name}
          readings={facilityReadings}
          title={facility.name}
          testId="dashboard-facility-readings"
        />
      ))}
    </div>
  );
}
