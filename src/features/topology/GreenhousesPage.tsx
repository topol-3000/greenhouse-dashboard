/**
 * The Greenhouses overview: every site the cloud API returns, and the
 * facilities the API says belong to each one.
 *
 * It supports any number of sites and any number of facilities per site,
 * including none. Nothing here is invented: there is no sample site, no create
 * action, no operational status and no count that the API did not report. A
 * site with no facilities says so; a topology with no sites says so.
 */

import { Link } from "react-router";
import type { FacilityRead } from "../../api/contract";
import { LoadingState, StatePanel } from "../../components/StatePanel";
import {
  BackgroundRefreshNotice,
  IncompleteCollectionNotice,
  RefreshFailurePanel,
  RequestErrorPanel,
} from "../../components/TopologyStates";
import { facilityPath } from "../../routes/routes";
import { formatContractValue } from "../../shared/format";
import { MetaList } from "./MetaList";
import type { SiteGroup } from "./useTopology";
import { useTopologyOverview } from "./useTopology";

function FacilityLink({ facility }: { facility: FacilityRead }) {
  return (
    <li className="resource-list__item">
      <Link className="resource-list__link" to={facilityPath(facility.id)}>
        {facility.name}
      </Link>
      <MetaList
        items={[
          { label: "Facility code", value: <code>{facility.code}</code> },
          { label: "Facility type", value: formatContractValue(facility.facility_type) },
          { label: "Status", value: formatContractValue(facility.status) },
        ]}
      />
    </li>
  );
}

function SiteSection({ group }: { group: SiteGroup }) {
  const { site, facilities } = group;
  return (
    <article className="card" data-testid="site-card">
      <h2 className="card__title">{site.name}</h2>
      <MetaList
        items={[
          { label: "Site code", value: <code>{site.code}</code> },
          { label: "Time zone", value: site.timezone },
          { label: "Status", value: formatContractValue(site.status) },
        ]}
      />

      <h3 className="card__subtitle">Facilities</h3>
      {facilities.length === 0 ? (
        <p className="inline-note" data-testid="site-without-facilities">
          The cloud API returns no facilities for this site.
        </p>
      ) : (
        <>
          <p className="visually-hidden">
            {facilities.length === 1
              ? `1 facility belongs to the site ${site.name}.`
              : `${String(facilities.length)} facilities belong to the site ${site.name}.`}
          </p>
          <ul className="resource-list">
            {facilities.map((facility) => (
              <FacilityLink key={facility.id} facility={facility} />
            ))}
          </ul>
        </>
      )}
    </article>
  );
}

function UnmatchedFacilities({ facilities }: { facilities: readonly FacilityRead[] }) {
  return (
    <article className="card" data-testid="unmatched-facilities">
      <h2 className="card__title">Facilities whose site was not returned</h2>
      <p className="inline-note inline-note--warning">
        The cloud API returned these facilities, but not the sites they name. They are listed
        separately rather than shown under a site the portal cannot confirm.
      </p>
      <ul className="resource-list">
        {facilities.map((facility) => (
          <FacilityLink key={facility.id} facility={facility} />
        ))}
      </ul>
    </article>
  );
}

/** How many facilities were listed under sites, for the incompleteness notice. */
function facilitiesShown(groups: readonly SiteGroup[], unmatched: readonly FacilityRead[]): number {
  return groups.reduce((sum, group) => sum + group.facilities.length, 0) + unmatched.length;
}

function summarise(sites: readonly SiteGroup[], siteTotal: number, facilityTotal: number): string {
  const siteWord = siteTotal === 1 ? "site" : "sites";
  const facilityWord = facilityTotal === 1 ? "facility" : "facilities";
  return `The cloud API reports ${String(siteTotal)} ${siteWord} and ${String(facilityTotal)} ${facilityWord}. ${
    sites.length === 0 ? "" : "Open a facility to see its control zones."
  }`.trim();
}

export function GreenhousesPage() {
  const topology = useTopologyOverview();

  if (topology.isLoading) {
    return (
      <div className="stack" data-testid="greenhouses-page">
        <LoadingState label="Loading your sites and facilities…" />
      </div>
    );
  }

  if (topology.error !== null && topology.error !== undefined) {
    return (
      <div className="stack" data-testid="greenhouses-page">
        <RequestErrorPanel
          title="Your greenhouses could not be loaded"
          error={topology.error}
          onRetry={topology.refresh}
          retrying={topology.isRefreshing}
          headingLevel={2}
        />
      </div>
    );
  }

  const siteTotal = topology.sites?.total ?? 0;
  const facilityTotal = topology.facilities?.total ?? 0;
  const shownFacilities = facilitiesShown(topology.groups, topology.unmatchedFacilities);
  const isEmpty = topology.groups.length === 0 && topology.unmatchedFacilities.length === 0;

  return (
    <div className="stack" data-testid="greenhouses-page">
      {topology.refreshError !== null && topology.refreshError !== undefined ? (
        <RefreshFailurePanel
          error={topology.refreshError}
          onRetry={topology.refresh}
          retrying={topology.isRefreshing}
        />
      ) : null}
      {topology.isRefreshing ? <BackgroundRefreshNotice /> : null}

      {isEmpty ? (
        <StatePanel
          title="No greenhouse topology is available through the API"
          headingLevel={2}
          testId="topology-empty"
        >
          <p>
            The cloud API returned no sites and no facilities for this portal. Nothing is shown here
            because there is nothing to show — the portal does not invent a greenhouse to fill the
            page.
          </p>
          <p>
            Greenhouse topology is created in the AI Greenhouse platform, not in this portal. Once
            sites and facilities exist, they appear here.
          </p>
        </StatePanel>
      ) : (
        <>
          <p className="prose" data-testid="topology-summary">
            {summarise(topology.groups, siteTotal, facilityTotal)}
          </p>
          {topology.sites?.complete === false ? (
            <IncompleteCollectionNotice
              shown={topology.groups.length}
              total={siteTotal}
              noun="sites"
            />
          ) : null}
          {topology.facilities?.complete === false ? (
            <IncompleteCollectionNotice
              shown={shownFacilities}
              total={facilityTotal}
              noun="facilities"
            />
          ) : null}

          <div className="cards">
            {topology.groups.map((group) => (
              <SiteSection key={group.site.id} group={group} />
            ))}
            {topology.unmatchedFacilities.length > 0 ? (
              <UnmatchedFacilities facilities={topology.unmatchedFacilities} />
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
