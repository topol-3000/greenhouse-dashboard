/**
 * One facility's read-only workspace.
 *
 * It says what the facility is, which site owns it, and which control zones the
 * cloud API places inside it — in words, so the Site → Facility → ControlZone
 * relationship is readable rather than implied by indentation.
 *
 * It is topology only. There is no reading, no actuator state, no control, no
 * command and no automation on this page, and no placeholder pretending one is
 * coming.
 */

import { Link, useParams } from "react-router";
import type { ControlZoneRead } from "../../api/contract";
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
import { FacilitySwitcher } from "./FacilitySwitcher";
import { MetaList } from "./MetaList";
import { useFacilityWorkspace, useTopologyOverview } from "./useTopology";

function ZoneLink({ facilityId, zone }: { facilityId: string; zone: ControlZoneRead }) {
  return (
    <li className="resource-list__item">
      <Link className="resource-list__link" to={controlZonePath(facilityId, zone.id)}>
        {zone.name}
      </Link>
      <MetaList
        items={[
          { label: "Zone code", value: <code>{zone.code}</code> },
          { label: "Zone type", value: formatContractValue(zone.zone_type) },
          { label: "Status", value: formatContractValue(zone.status) },
        ]}
      />
    </li>
  );
}

export function FacilityPage() {
  const params = useParams();
  const facilityId = params["facilityId"] ?? "";
  const workspace = useFacilityWorkspace(facilityId);
  const topology = useTopologyOverview();

  if (workspace.isMissing) {
    return (
      <div className="stack" data-testid="facility-page">
        <ResourceNotFoundPanel resource="facility" identifier={facilityId} />
      </div>
    );
  }

  if (workspace.isLoading) {
    return (
      <div className="stack" data-testid="facility-page">
        <LoadingState label="Loading this facility…" />
      </div>
    );
  }

  if (workspace.error !== null && workspace.error !== undefined) {
    return (
      <div className="stack" data-testid="facility-page">
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
      <div className="stack" data-testid="facility-page">
        <ResourceNotFoundPanel resource="facility" identifier={facilityId} />
      </div>
    );
  }

  const zones = workspace.zones?.items ?? [];
  const siteName = workspace.site?.name;

  return (
    <div className="stack" data-testid="facility-page">
      {workspace.refreshError !== null && workspace.refreshError !== undefined ? (
        <RefreshFailurePanel
          error={workspace.refreshError}
          onRetry={workspace.refresh}
          retrying={workspace.isRefreshing}
        />
      ) : null}
      {workspace.isRefreshing ? <BackgroundRefreshNotice /> : null}

      <section className="section" aria-labelledby="facility-details-heading">
        <h2 id="facility-details-heading" className="section__heading">
          Facility details
        </h2>
        <p className="prose" data-testid="facility-relationship">
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
      </section>

      <section className="section" aria-labelledby="facility-zones-heading">
        <h2 id="facility-zones-heading" className="section__heading">
          Control zones
        </h2>
        {zones.length === 0 ? (
          <StatePanel
            title="This facility has no control zones"
            headingLevel={3}
            testId="facility-zones-empty"
          >
            <p>
              The cloud API returns no control zones for {facility.name}. Control zones are created
              in the AI Greenhouse platform; when this facility has one, it appears here.
            </p>
            <p>
              <Link to={GREENHOUSES_PATH}>Back to Greenhouses</Link>
            </p>
          </StatePanel>
        ) : (
          <>
            <p className="prose">
              The cloud API places{" "}
              {zones.length === 1 ? "1 control zone" : `${String(zones.length)} control zones`} in{" "}
              {facility.name}.
            </p>
            {workspace.zones?.complete === false ? (
              <IncompleteCollectionNotice
                shown={zones.length}
                total={workspace.zones.total}
                noun="control zones"
              />
            ) : null}
            <ul className="resource-list">
              {zones.map((zone) => (
                <ZoneLink key={zone.id} facilityId={facilityId} zone={zone} />
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
