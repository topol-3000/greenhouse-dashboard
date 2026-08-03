/**
 * The Customer Portal dashboard.
 *
 * One feature and one route of the portal, not the application itself. It
 * states what the portal is for, reports whether the cloud API can be reached,
 * and gives the customer the cloud API's own count of their sites and
 * facilities with the way into Greenhouses.
 *
 * Every figure on this page came from the API. There is no reading, no
 * actuator state, no command, no alert and no operational health here, because
 * this release contains none of them.
 */

import { useApiAvailability } from "../../api/availability";
import { ApiAvailabilityPanel } from "./ApiAvailabilityPanel";
import { TopologySummaryPanel } from "./TopologySummaryPanel";

export function DashboardPage() {
  const { availability, recheck } = useApiAvailability();

  return (
    <div className="stack" data-testid="dashboard-page">
      <section className="section" aria-labelledby="purpose-heading">
        <h2 id="purpose-heading" className="section__heading">
          Monitor and operate your greenhouse facilities
        </h2>
        <p className="prose">
          This portal is where you follow the state of your greenhouse facilities and operate them
          by hand. It talks to the AI Greenhouse cloud API and shows only what that API reports.
        </p>
      </section>

      <section className="section" aria-labelledby="api-heading">
        <h2 id="api-heading" className="section__heading">
          Cloud API
        </h2>
        <ApiAvailabilityPanel availability={availability} onRecheck={recheck} />
      </section>

      <section className="section" aria-labelledby="resources-heading">
        <h2 id="resources-heading" className="section__heading">
          Greenhouse resources
        </h2>
        <TopologySummaryPanel />
      </section>
    </div>
  );
}
