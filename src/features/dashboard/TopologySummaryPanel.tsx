/**
 * The dashboard's acknowledgement that the portal now reads real topology.
 *
 * The only figures shown are `Page.total` from the collection endpoints — the
 * backend's own count of matching rows, not something this portal added up from
 * whatever pages it happened to receive. That is why a count can be shown here
 * at all, and why it is labelled as the cloud API's count.
 *
 * It shows no telemetry, no reading, no actuator state, no command, no alert
 * and no operational health, because none of that exists in this release.
 */

import { Link } from "react-router";
import { LoadingState, StatePanel } from "../../components/StatePanel";
import { RefreshFailurePanel, RequestErrorPanel } from "../../components/TopologyStates";
import { MetaList } from "../topology/MetaList";
import { useTopologyOverview } from "../topology/useTopology";
import { GREENHOUSES_PATH } from "../../routes/routes";

export function TopologySummaryPanel() {
  const topology = useTopologyOverview();

  if (topology.isLoading) {
    return <LoadingState label="Loading sites and facilities…" />;
  }

  if (topology.error !== null && topology.error !== undefined) {
    return (
      <RequestErrorPanel
        title="Your greenhouses could not be loaded"
        error={topology.error}
        onRetry={topology.refresh}
        retrying={topology.isRefreshing}
      />
    );
  }

  const siteTotal = topology.sites?.total ?? 0;
  const facilityTotal = topology.facilities?.total ?? 0;

  if (siteTotal === 0 && facilityTotal === 0) {
    return (
      <StatePanel title="No greenhouses yet" headingLevel={3} testId="dashboard-topology-empty">
        <p>
          The cloud API reports no sites and no facilities for this portal. Nothing is invented to
          fill the gap — when topology exists, it appears in Greenhouses.
        </p>
        <p>
          <Link to={GREENHOUSES_PATH}>Open Greenhouses</Link>
        </p>
      </StatePanel>
    );
  }

  return (
    <>
      {topology.refreshError !== null && topology.refreshError !== undefined ? (
        <RefreshFailurePanel
          error={topology.refreshError}
          onRetry={topology.refresh}
          retrying={topology.isRefreshing}
        />
      ) : null}
      <div className="d-flex flex-column gap-3" data-testid="dashboard-topology">
        <MetaList
          items={[
            { label: "Sites reported by the cloud API", value: String(siteTotal) },
            { label: "Facilities reported by the cloud API", value: String(facilityTotal) },
          ]}
        />
        <p className="prose text-body-secondary">
          <Link to={GREENHOUSES_PATH}>Open Greenhouses</Link> to see each site, its facilities and
          their control zones.
        </p>
      </div>
    </>
  );
}
