/**
 * The Customer Portal dashboard.
 *
 * One feature and one route of the portal, not the application itself. In this
 * unit it is the landing page: it states what the portal is for, reports
 * whether the cloud API can be reached, and says plainly that no greenhouse
 * resources have been loaded yet.
 *
 * It renders no facility, no reading, no command and no statistic. Every number
 * on a later version of this page will have come from the API; until then there
 * is nothing here that a backend did not say.
 */

import { useApiAvailability } from "../../api/availability";
import { StatePanel } from "../../components/StatePanel";
import { ApiAvailabilityPanel } from "./ApiAvailabilityPanel";

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
        <StatePanel title="Nothing has been loaded yet" headingLevel={3}>
          <p>
            This release is the portal foundation, so it reads no greenhouse resources. Your sites,
            facilities and control zones will appear here once the portal loads them from the cloud
            API.
          </p>
          <p>
            Nothing on this page is sample data. When a value is not available, the portal says so
            instead of showing a placeholder number.
          </p>
        </StatePanel>
      </section>
    </div>
  );
}
