/**
 * One facility's read-only workspace.
 *
 * It says what the facility is, which site owns it, and which control zones the
 * cloud API places inside it — in words, so the Site → Facility → ControlZone
 * relationship is readable rather than implied by indentation.
 *
 * On a wide screen the two answers sit beside each other: what this facility is
 * on the left, and what is inside it on the right, so a customer reads the
 * workspace across the page instead of scrolling a single column past a short
 * metadata block.
 *
 * Underneath them is what the facility is reading now, zone by zone. It costs
 * no request this page was not already able to make: the configuration document
 * describes every zone and every point of the facility at once, and it is the
 * same cache entry the control zone workspace reads. A reading shown here links
 * into the zone that owns it, so this is a way in rather than a copy.
 *
 * What is still not here: no actuator state, no control, no command, no
 * automation and no alert. Nothing on this page is assembled out of several
 * readings either — no total, no average, no "N of M zones" — because a figure
 * like that would be the portal's claim rather than the greenhouse's.
 */

import { CCol, CListGroup, CListGroupItem, CRow } from "@coreui/react";
import { Link, useParams } from "react-router";
import type { ControlZoneRead } from "../../api/contract";
import { SectionCard } from "../../components/SectionCard";
import { LoadingState, StatePanel } from "../../components/StatePanel";
import {
  BackgroundRefreshNotice,
  IncompleteCollectionNotice,
  RefreshFailurePanel,
  RequestErrorPanel,
  ResourceNotFoundPanel,
} from "../../components/TopologyStates";
import { controlZonePath, GREENHOUSES_PATH } from "../../routes/routes";
import { formatContractValue } from "../../shared/format";
import { FacilityReadingsSection } from "../monitoring/FacilityReadingsSection";
import { useFacilityReadings } from "../monitoring/useFacilityReadings";
import { FacilitySwitcher } from "./FacilitySwitcher";
import { MetaList } from "./MetaList";
import { useFacilityWorkspace, useTopologyOverview } from "./useTopology";

function ZoneLink({ facilityId, zone }: { facilityId: string; zone: ControlZoneRead }) {
  return (
    <CListGroupItem className="d-flex flex-column gap-2">
      <Link className="fw-semibold text-break" to={controlZonePath(facilityId, zone.id)}>
        {zone.name}
      </Link>
      <MetaList
        items={[
          { label: "Zone code", value: <code>{zone.code}</code> },
          { label: "Zone type", value: formatContractValue(zone.zone_type) },
          { label: "Status", value: formatContractValue(zone.status) },
        ]}
      />
    </CListGroupItem>
  );
}

export function FacilityPage() {
  const params = useParams();
  const facilityId = params["facilityId"] ?? "";
  const workspace = useFacilityWorkspace(facilityId);
  const topology = useTopologyOverview();
  // Not read for an address the cloud API has already said it does not have:
  // the answer would be the same 404 twice.
  const readings = useFacilityReadings(facilityId, !workspace.isMissing);

  if (workspace.isMissing) {
    return (
      <div className="d-flex flex-column gap-4" data-testid="facility-page">
        <ResourceNotFoundPanel resource="facility" identifier={facilityId} />
      </div>
    );
  }

  if (workspace.isLoading) {
    return (
      <div className="d-flex flex-column gap-4" data-testid="facility-page">
        <LoadingState label="Loading this facility…" />
      </div>
    );
  }

  if (workspace.error !== null && workspace.error !== undefined) {
    return (
      <div className="d-flex flex-column gap-4" data-testid="facility-page">
        <RequestErrorPanel
          title="This facility could not be loaded"
          error={workspace.error}
          onRetry={workspace.refresh}
          retrying={workspace.isRefreshing}
          headingLevel={2}
        />
        <FacilitySwitcher currentFacilityId={facilityId} topology={topology} />
      </div>
    );
  }

  const facility = workspace.facility;
  if (facility === undefined) {
    return (
      <div className="d-flex flex-column gap-4" data-testid="facility-page">
        <ResourceNotFoundPanel resource="facility" identifier={facilityId} />
      </div>
    );
  }

  const zones = workspace.zones?.items ?? [];
  const siteName = workspace.site?.name;

  return (
    <div className="d-flex flex-column gap-4" data-testid="facility-page">
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
          <SectionCard title="Facility details" fillHeight>
            <p className="prose text-body-secondary" data-testid="facility-relationship">
              {siteName === undefined
                ? `${facility.name} is a facility of a site the portal is still resolving.`
                : `${facility.name} is a facility of the site ${siteName}.`}
            </p>
            <MetaList
              testId="facility-meta"
              items={[
                { label: "Facility name", value: facility.name },
                { label: "Facility code", value: <code>{facility.code}</code> },
                { label: "Facility type", value: formatContractValue(facility.facility_type) },
                { label: "Status", value: formatContractValue(facility.status) },
                {
                  label: "Site",
                  value:
                    workspace.site === undefined ? (
                      "Not available"
                    ) : (
                      <>
                        {workspace.site.name} (<code>{workspace.site.code}</code>)
                      </>
                    ),
                },
                { label: "Site time zone", value: workspace.site?.timezone ?? "Not available" },
              ]}
            />
            <FacilitySwitcher currentFacilityId={facilityId} topology={topology} />
          </SectionCard>
        </CCol>

        <CCol xs={12} xl={7} xxl={8}>
          <SectionCard title="Control zones" fillHeight>
            {zones.length === 0 ? (
              <StatePanel
                title="This facility has no control zones"
                headingLevel={3}
                testId="facility-zones-empty"
              >
                <p>
                  The cloud API returns no control zones for {facility.name}. Control zones are
                  created in the AI Greenhouse platform; when this facility has one, it appears
                  here.
                </p>
                <p>
                  <Link to={GREENHOUSES_PATH}>Back to Greenhouses</Link>
                </p>
              </StatePanel>
            ) : (
              <>
                <p className="prose text-body-secondary">
                  The cloud API places{" "}
                  {zones.length === 1 ? "1 control zone" : `${String(zones.length)} control zones`}{" "}
                  in {facility.name}.
                </p>
                {workspace.zones?.complete === false ? (
                  <IncompleteCollectionNotice
                    shown={zones.length}
                    total={workspace.zones.total}
                    noun="control zones"
                  />
                ) : null}
                <CListGroup>
                  {zones.map((zone) => (
                    <ZoneLink key={zone.id} facilityId={facilityId} zone={zone} />
                  ))}
                </CListGroup>
              </>
            )}
          </SectionCard>
        </CCol>
      </CRow>

      <FacilityReadingsSection
        facilityId={facilityId}
        facilityName={facility.name}
        readings={readings}
      />
    </div>
  );
}
