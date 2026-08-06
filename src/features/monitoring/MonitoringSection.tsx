/**
 * The monitoring section of a control zone workspace.
 *
 * It is a section of that page, not a page of its own: the zone's identity,
 * breadcrumbs, topology metadata and facility switcher stay exactly where the
 * workspace put them, and monitoring is added underneath. That is also why every
 * failure here is scoped to this section — a monitoring request that fails
 * leaves the workspace, the navigation and the shell usable, because a customer
 * who cannot read a temperature can still move around their greenhouses.
 *
 * The measurement cards use the full width of the workspace, three or four
 * across on a desktop, because a zone with a dozen points is read as a board
 * rather than as a column that has to be scrolled to be compared.
 *
 * What it will not show, whatever the API returns: a control or status point's
 * state, a desired state, a command, an alert, a threshold or an automation
 * decision. The inventory is built from `point_kind: "measurement"` alone, and
 * the state of anything else never reaches this component.
 */

import { CButton, CCol, CRow } from "@coreui/react";
import { SectionCard } from "../../components/SectionCard";
import { LoadingState, StatePanel } from "../../components/StatePanel";
import {
  BackgroundRefreshNotice,
  RefreshFailurePanel,
  RequestErrorPanel,
} from "../../components/TopologyStates";
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
    <SectionCard title="Monitoring" testId="monitoring">
      <p className="prose text-body-secondary">
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
          A poll running in the background is shown but deliberately not
          announced. A `role="status"` here would interrupt a screen reader every
          thirty seconds to report a request nobody asked for; the first load,
          which the customer is waiting on, is announced.
        */}
      {monitoring.isRefreshing ? (
        <BackgroundRefreshNotice
          announce={false}
          testId="monitoring-refreshing"
          label="Refreshing measurements from the cloud API…"
        />
      ) : null}

      <section aria-labelledby="measurements-heading" className="d-flex flex-column gap-3">
        <h3 id="measurements-heading">Measurement points</h3>

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
          <CRow className="g-3" data-testid="measurement-cards">
            {monitoring.measurements.map((measurement) => {
              // Inside the zone that owns the point, the card's action selects
              // that point's history below. Every other place the card appears
              // is outside this zone and offers a way into it instead.
              const selected = monitoring.selectedPoint?.pointId === measurement.pointId;
              return (
                <CCol key={measurement.pointId} xs={12} md={6} xl={4} xxl={3}>
                  <MeasurementCard
                    measurement={measurement}
                    action={
                      <CButton
                        type="button"
                        color="secondary"
                        variant="outline"
                        size="sm"
                        aria-pressed={selected}
                        onClick={() => {
                          monitoring.selectPoint(selected ? null : measurement.pointId);
                        }}
                        data-testid="select-point"
                      >
                        {selected
                          ? `Showing history of ${measurement.name}`
                          : `Show history of ${measurement.name}`}
                      </CButton>
                    }
                  />
                </CCol>
              );
            })}
          </CRow>
        )}
      </section>

      {hasMeasurements || monitoring.hasUnknownSelection ? (
        <section aria-labelledby="history-heading" className="d-flex flex-column gap-3">
          <h3 id="history-heading">Telemetry history</h3>
          <TelemetryHistoryPanel
            selectedPoint={monitoring.selectedPoint}
            hasUnknownSelection={monitoring.hasUnknownSelection}
            telemetry={monitoring.telemetry}
          />
        </section>
      ) : null}
    </SectionCard>
  );
}
