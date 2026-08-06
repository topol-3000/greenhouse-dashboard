/**
 * One control zone's workspace, inside the facility that owns it.
 *
 * The page exists at `/facilities/:facilityId/zones/:zoneId`, but the URL is not
 * evidence of anything. The zone's own `facility_id` is what decides whether it
 * belongs here: a zone that names a different facility is refused rather than
 * drawn under the wrong parent, and the site comes from the facility because
 * `ControlZoneRead` publishes none.
 *
 * The page carries three lists of points, and they mean different things.
 *
 * The composition table is the zone's point *inventory*, built only from fields
 * `ZonePointAssignmentRead` states — `point_name`, `point_code`, `point_kind`,
 * `role`, `data_type`, `unit`. It describes what the zone is made of, including
 * its control and status points, and it carries no reading, because that schema
 * contains none.
 *
 * The monitoring section is the zone's *measurements*: the points the API
 * publishes as `point_kind: "measurement"`, with the last state it holds for
 * each and the telemetry history of the one that is selected.
 *
 * The manual-control section is the zone's *control outputs*: the points the API
 * publishes as active boolean `control` points assigned here in the
 * `control_output` role, which name the point that reports them back. Those five
 * explicit fields are the entire test. A measurement point is never an actuator,
 * a status point is never a command target, and a control point that fails any
 * clause is listed with the reason rather than given a button.
 *
 * No point is classified by its name in any of the three. There is no automation,
 * no schedule, no alert and no command history on this page.
 *
 * The layout follows what a customer came for. On a wide screen the zone's
 * identity and its composition stack in a narrow left column, and monitoring —
 * the readings — sits beside them rather than below, so the first thing on the
 * page is the thing most visits are about. Manual control takes the whole width
 * underneath, because its cards want the room.
 *
 * The composition table is behind a disclosure. It lists every point of the
 * zone including the ones monitoring and manual control render as cards
 * directly below, so leaving it open pushed the readings and the controls off
 * the screen to show the same points a third time. A notice that the list is
 * incomplete stays outside the disclosure: a warning must not be something the
 * customer has to open to find.
 */

import {
  CCol,
  CRow,
  CTable,
  CTableBody,
  CTableCaption,
  CTableDataCell,
  CTableHead,
  CTableHeaderCell,
  CTableRow,
} from "@coreui/react";
import { useParams } from "react-router";
import { ManualControlSection } from "../control/ManualControlSection";
import { useZoneManualControl } from "../control/useZoneManualControl";
import { MonitoringSection } from "../monitoring/MonitoringSection";
import { useZoneMonitoring } from "../monitoring/useZoneMonitoring";
import { SectionCard } from "../../components/SectionCard";
import { LoadingState, StatePanel } from "../../components/StatePanel";
import {
  BackgroundRefreshNotice,
  IncompleteCollectionNotice,
  RefreshFailurePanel,
  RelationshipMismatchPanel,
  RequestErrorPanel,
  ResourceNotFoundPanel,
} from "../../components/TopologyStates";
import { facilityPath } from "../../routes/routes";
import { formatContractValue } from "../../shared/format";
import { FacilitySwitcher } from "./FacilitySwitcher";
import { MetaList } from "./MetaList";
import { ZoneSwitcher } from "./ZoneSwitcher";
import { useControlZoneWorkspace, useTopologyOverview } from "./useTopology";

export function ControlZonePage() {
  const params = useParams();
  const facilityId = params["facilityId"] ?? "";
  const zoneId = params["zoneId"] ?? "";
  const workspace = useControlZoneWorkspace(facilityId, zoneId);
  const topology = useTopologyOverview();

  // Monitoring is read for the facility in the address, in parallel with the
  // zone lookup rather than behind it, and it is switched off the moment the
  // contract says this zone is not part of this facility — the portal does not
  // read a zone's measurements into a page it will refuse to draw.
  const workspaceIsUsable = !workspace.isZoneMissing && workspace.relationship !== "mismatch";
  const monitoring = useZoneMonitoring(facilityId, zoneId, workspaceIsUsable);

  // Manual control reads the same configuration document monitoring reads —
  // the same query key, so the two share one poll — and is switched off under
  // exactly the same conditions. The portal offers no action on a zone the
  // contract does not place in the facility the address names.
  const control = useZoneManualControl(facilityId, zoneId, workspaceIsUsable);

  if (workspace.isZoneMissing) {
    return (
      <div className="d-flex flex-column gap-4" data-testid="control-zone-page">
        <ResourceNotFoundPanel resource="control zone" identifier={zoneId} />
      </div>
    );
  }

  if (workspace.isFacilityMissing) {
    return (
      <div className="d-flex flex-column gap-4" data-testid="control-zone-page">
        <ResourceNotFoundPanel resource="facility" identifier={facilityId} />
      </div>
    );
  }

  if (workspace.relationship === "mismatch") {
    const zone = workspace.zone;
    return (
      <div className="d-flex flex-column gap-4" data-testid="control-zone-page">
        <RelationshipMismatchPanel
          zoneName={zone?.name ?? "This control zone"}
          {...(zone === undefined ? {} : { correctPath: facilityPath(zone.facility_id) })}
        />
      </div>
    );
  }

  if (workspace.isLoading) {
    return (
      <div className="d-flex flex-column gap-4" data-testid="control-zone-page">
        <LoadingState label="Loading this control zone…" />
      </div>
    );
  }

  if (workspace.error !== null && workspace.error !== undefined) {
    return (
      <div className="d-flex flex-column gap-4" data-testid="control-zone-page">
        <RequestErrorPanel
          title="This control zone could not be loaded"
          error={workspace.error}
          onRetry={workspace.refresh}
          retrying={workspace.isRefreshing}
          headingLevel={2}
        />
      </div>
    );
  }

  const zone = workspace.zone;
  if (zone === undefined) {
    return (
      <div className="d-flex flex-column gap-4" data-testid="control-zone-page">
        <ResourceNotFoundPanel resource="control zone" identifier={zoneId} />
      </div>
    );
  }

  const facility = workspace.facility;
  const site = workspace.site;
  const points = workspace.points?.items ?? [];

  return (
    <div className="d-flex flex-column gap-4" data-testid="control-zone-page">
      {workspace.refreshError !== null && workspace.refreshError !== undefined ? (
        <RefreshFailurePanel
          error={workspace.refreshError}
          onRetry={workspace.refresh}
          retrying={workspace.isRefreshing}
        />
      ) : null}
      {workspace.isRefreshing ? <BackgroundRefreshNotice /> : null}

      <CRow className="g-4">
        <CCol xs={12} xl={5} xxl={4}>
          <div className="d-flex flex-column gap-4">
            <SectionCard title="Control zone details">
              <p className="prose text-body-secondary" data-testid="zone-relationship">
                {facility === undefined
                  ? `${zone.name} is a control zone of the facility named in this address.`
                  : site === undefined
                    ? `${zone.name} is a control zone of the facility ${facility.name}.`
                    : `${zone.name} is a control zone of the facility ${facility.name}, which belongs to the site ${site.name}.`}
              </p>
              <MetaList
                testId="zone-meta"
                items={[
                  { label: "Control zone name", value: zone.name },
                  { label: "Zone code", value: <code>{zone.code}</code> },
                  { label: "Zone type", value: formatContractValue(zone.zone_type) },
                  { label: "Status", value: formatContractValue(zone.status) },
                  { label: "Facility", value: facility?.name ?? "Not available" },
                  { label: "Site", value: site?.name ?? "Not available" },
                ]}
              />
              <ZoneSwitcher
                facilityId={facilityId}
                currentZoneId={zoneId}
                zones={workspace.siblingZones}
                loading={workspace.siblingZonesLoading}
                failed={workspace.siblingZonesFailed}
              />
              <FacilitySwitcher currentFacilityId={facilityId} topology={topology} />
            </SectionCard>

            <SectionCard title="Points assigned to this control zone">
              {points.length === 0 ? (
                <StatePanel
                  title="No points are assigned to this control zone"
                  headingLevel={3}
                  testId="zone-points-empty"
                >
                  <p>The cloud API returns no point assignments for {zone.name}.</p>
                </StatePanel>
              ) : (
                <>
                  <p className="prose text-body-secondary">
                    This is the zone&rsquo;s composition only — no measured value or device state is
                    shown. What the measurement points read is below; what the control points can be
                    asked to do is below that.
                  </p>
                  {/* Outside the disclosure: a warning that the list is partial
                      must not be something the customer has to open to find. */}
                  {workspace.points?.complete === false ? (
                    <IncompleteCollectionNotice
                      shown={points.length}
                      total={workspace.points.total}
                      noun="point assignments"
                    />
                  ) : null}
                  <details data-testid="zone-points-disclosure">
                    <summary className="py-2 fw-semibold small">
                      Show the {points.length} point{points.length === 1 ? "" : "s"} assigned to
                      this control zone
                    </summary>
                    {/* A wide table scrolls inside its own box, never the page. */}
                    <CTable
                      responsive
                      small
                      align="top"
                      className="mt-2 mb-0"
                      data-testid="zone-points"
                    >
                      <CTableCaption className="visually-hidden">
                        Points assigned to the control zone {zone.name}
                      </CTableCaption>
                      <CTableHead>
                        <CTableRow>
                          <CTableHeaderCell scope="col">Point name</CTableHeaderCell>
                          <CTableHeaderCell scope="col">Point code</CTableHeaderCell>
                          <CTableHeaderCell scope="col">Point kind</CTableHeaderCell>
                          <CTableHeaderCell scope="col">Role in zone</CTableHeaderCell>
                          <CTableHeaderCell scope="col">Data type</CTableHeaderCell>
                          <CTableHeaderCell scope="col">Unit</CTableHeaderCell>
                        </CTableRow>
                      </CTableHead>
                      <CTableBody>
                        {points.map((assignment) => (
                          <CTableRow key={assignment.id}>
                            <CTableHeaderCell scope="row" className="fw-normal">
                              {assignment.point_name}
                            </CTableHeaderCell>
                            <CTableDataCell>
                              <code>{assignment.point_code}</code>
                            </CTableDataCell>
                            <CTableDataCell>
                              {formatContractValue(assignment.point_kind)}
                            </CTableDataCell>
                            <CTableDataCell>{formatContractValue(assignment.role)}</CTableDataCell>
                            <CTableDataCell>
                              {formatContractValue(assignment.data_type)}
                            </CTableDataCell>
                            <CTableDataCell>{assignment.unit ?? "Not set"}</CTableDataCell>
                          </CTableRow>
                        ))}
                      </CTableBody>
                    </CTable>
                  </details>
                </>
              )}
            </SectionCard>
          </div>
        </CCol>

        <CCol xs={12} xl={7} xxl={8}>
          <MonitoringSection zoneName={zone.name} monitoring={monitoring} />
        </CCol>
      </CRow>

      <ManualControlSection
        zoneName={zone.name}
        facilityName={facility?.name}
        siteName={site?.name}
        facilityId={facilityId}
        control={control}
      />
    </div>
  );
}
