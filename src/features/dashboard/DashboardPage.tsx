/**
 * The Customer Portal dashboard.
 *
 * One feature and one route of the portal, not the application itself. It
 * states what the portal is for, reports whether the cloud API can be reached,
 * and gives the customer the cloud API's own count of their sites and
 * facilities with the way into Greenhouses.
 *
 * The two answers it has — is the cloud API reachable, and what does it say you
 * have — are peers, so on a wide screen they sit side by side rather than one
 * above the other with the second below the fold.
 *
 * Every figure on this page came from the API. There is no reading, no
 * actuator state, no command, no alert and no operational health here, because
 * this release contains none of them.
 */

import { CCol, CRow } from "@coreui/react";
import { useApiAvailability } from "../../api/availability";
import { SectionCard } from "../../components/SectionCard";
import { ApiAvailabilityPanel } from "./ApiAvailabilityPanel";
import { TopologySummaryPanel } from "./TopologySummaryPanel";

export function DashboardPage() {
  const { availability, recheck } = useApiAvailability();

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
    </div>
  );
}
