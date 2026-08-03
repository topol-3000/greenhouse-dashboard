/**
 * The monitoring section of a control zone workspace.
 *
 * It is a section of that page, not a page of its own: the zone's identity,
 * breadcrumbs, topology metadata and facility switcher stay exactly where Unit
 * 2 put them, and monitoring is added underneath. That is also why every
 * failure here is scoped to this section — a monitoring request that fails
 * leaves the workspace, the navigation and the shell usable, because a customer
 * who cannot read a temperature can still move around their greenhouses.
 *
 * What it will not show, whatever the API returns: a control or status point's
 * state, a desired state, a command, an alert, a threshold or an automation
 * decision. The inventory is built from `point_kind: "measurement"` alone, and
 * the state of anything else never reaches this component.
 */

import { LoadingState, StatePanel } from "../../components/StatePanel";
import { RefreshFailurePanel, RequestErrorPanel } from "../../components/TopologyStates";
import { MeasurementCard } from "./MeasurementCard";
import { TelemetryHistoryPanel } from "./TelemetryHistoryPanel";
import type { ZoneMonitoring } from "./useZoneMonitoring";

interface MonitoringSectionProps {
  zoneName: string;
  monitoring: ZoneMonitoring;
}

export function MonitoringSection({ zoneName, monitoring }: MonitoringSectionProps) {
  const hasMeasurements = monitoring.measurements.length > 0;

  return (
    <section className="section" aria-labelledby="monitoring-heading" data-testid="monitoring">
      <h2 id="monitoring-heading" className="section__heading">
        Monitoring
      </h2>
      <p className="prose">
        The measurement points the cloud API assigns to {zoneName}, and the last state it holds for
        each. Everything below is read from the API — there is no control here, and no value the
        backend did not publish.
      </p>

      {monitoring.refreshError !== null && monitoring.refreshError !== undefined ? (
        <RefreshFailurePanel
          error={monitoring.refreshError}
          onRetry={monitoring.refresh}
          retrying={monitoring.isRefreshing}
        />
      ) : null}

      {/*
        A poll running in the background is shown but deliberately not announced.
        A `role="status"` here would interrupt a screen reader every thirty
        seconds to report a request nobody asked for; the first load, which the
        customer is waiting on, is announced.
      */}
      {monitoring.isRefreshing ? (
        <p className="inline-note" data-testid="monitoring-refreshing">
          Refreshing measurements from the cloud API…
        </p>
      ) : null}

      <section aria-labelledby="measurements-heading" className="subsection">
        <h3 id="measurements-heading" className="subsection__heading">
          Measurement points
        </h3>

        {monitoring.isFacilityMissing ? (
          <StatePanel
            title="Measurements are not available for this facility"
            tone="warning"
            headingLevel={4}
            testId="monitoring-facility-absent"
          >
            <p>
              The cloud API has no configuration for the facility this address names, so it
              publishes no measurement points to show.
            </p>
          </StatePanel>
        ) : monitoring.isLoading ? (
          <LoadingState label={`Loading measurements for ${zoneName}…`} />
        ) : monitoring.error !== null && monitoring.error !== undefined ? (
          <RequestErrorPanel
            title="Measurements could not be loaded"
            error={monitoring.error}
            onRetry={monitoring.refresh}
            retrying={monitoring.isRefreshing}
          />
        ) : !monitoring.hasInventory ? (
          <StatePanel
            title="Measurements are not available"
            headingLevel={4}
            testId="monitoring-unavailable"
          >
            <p>The cloud API has not returned this facility&rsquo;s configuration.</p>
          </StatePanel>
        ) : !monitoring.zoneFound ? (
          <StatePanel
            title="This control zone is not in the facility’s configuration"
            tone="warning"
            headingLevel={4}
            testId="monitoring-zone-absent"
          >
            <p>
              The cloud API describes this facility without {zoneName}. The configuration document
              leaves archived zones out, so a zone that has been archived is read here as absent
              rather than as empty.
            </p>
          </StatePanel>
        ) : !hasMeasurements ? (
          <StatePanel
            title="No measurement points are assigned to this control zone"
            headingLevel={4}
            testId="monitoring-empty"
          >
            <p>
              The cloud API lists no active point of kind <code>measurement</code> for {zoneName}.
              Any control or status points it does have are shown in the zone&rsquo;s composition
              above; they are not measurements and carry no reading here.
            </p>
          </StatePanel>
        ) : (
          <div className="cards" data-testid="measurement-cards">
            {monitoring.measurements.map((measurement) => (
              <MeasurementCard
                key={measurement.pointId}
                measurement={measurement}
                selected={monitoring.selectedPoint?.pointId === measurement.pointId}
                onSelect={() => {
                  monitoring.selectPoint(
                    monitoring.selectedPoint?.pointId === measurement.pointId
                      ? null
                      : measurement.pointId,
                  );
                }}
              />
            ))}
          </div>
        )}
      </section>

      {hasMeasurements || monitoring.hasUnknownSelection ? (
        <section aria-labelledby="history-heading" className="subsection">
          <h3 id="history-heading" className="subsection__heading">
            Telemetry history
          </h3>
          <TelemetryHistoryPanel
            selectedPoint={monitoring.selectedPoint}
            hasUnknownSelection={monitoring.hasUnknownSelection}
            telemetry={monitoring.telemetry}
          />
        </section>
      ) : null}
    </section>
  );
}
