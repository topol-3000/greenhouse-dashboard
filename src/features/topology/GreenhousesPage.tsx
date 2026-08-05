/**
 * The Greenhouses overview: every site the cloud API returns, and the
 * facilities the API says belong to each one.
 *
 * It supports any number of sites and any number of facilities per site,
 * including none. Nothing here is invented: there is no sample site, no create
 * action, no operational status and no count that the API did not report. A
 * site with no facilities says so; a topology with no sites says so.
 *
 * A site is a card, and the cards are a responsive grid: one column on a phone,
 * two from a tablet, three on a wide desktop. A customer with a dozen sites
 * sees them as an overview rather than as a very long column.
 */

import {
  CCard,
  CCardBody,
  CCardSubtitle,
  CCardTitle,
  CCol,
  CListGroup,
  CListGroupItem,
  CRow,
} from "@coreui/react";
import { Link } from "react-router";
import type { FacilityRead } from "../../api/contract";
import { LoadingState, Note, StatePanel } from "../../components/StatePanel";
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
    <CListGroupItem className="d-flex flex-column gap-2">
      <Link className="fw-semibold text-break" to={facilityPath(facility.id)}>
        {facility.name}
      </Link>
      <MetaList
        items={[
          { label: "Facility code", value: <code>{facility.code}</code> },
          { label: "Facility type", value: formatContractValue(facility.facility_type) },
          { label: "Status", value: formatContractValue(facility.status) },
        ]}
      />
    </CListGroupItem>
  );
}

function SiteSection({ group }: { group: SiteGroup }) {
  const { site, facilities } = group;
  return (
    <CCard className="h-100" data-testid="site-card">
      <CCardBody className="d-flex flex-column gap-3">
        <div className="d-flex flex-column gap-2">
          <CCardTitle as="h2" className="text-break mb-0">
            {site.name}
          </CCardTitle>
          <MetaList
            items={[
              { label: "Site code", value: <code>{site.code}</code> },
              { label: "Time zone", value: site.timezone },
              { label: "Status", value: formatContractValue(site.status) },
            ]}
          />
        </div>

        <CCardSubtitle as="h3" className="text-uppercase small text-body-secondary mb-0">
          Facilities
        </CCardSubtitle>
        {facilities.length === 0 ? (
          <Note testId="site-without-facilities">
            The cloud API returns no facilities for this site.
          </Note>
        ) : (
          <>
            <p className="visually-hidden">
              {facilities.length === 1
                ? `1 facility belongs to the site ${site.name}.`
                : `${String(facilities.length)} facilities belong to the site ${site.name}.`}
            </p>
            <CListGroup>
              {facilities.map((facility) => (
                <FacilityLink key={facility.id} facility={facility} />
              ))}
            </CListGroup>
          </>
        )}
      </CCardBody>
    </CCard>
  );
}

function UnmatchedFacilities({ facilities }: { facilities: readonly FacilityRead[] }) {
  return (
    <CCard className="h-100" data-testid="unmatched-facilities">
      <CCardBody className="d-flex flex-column gap-3">
        <CCardTitle as="h2" className="mb-0">
          Facilities whose site was not returned
        </CCardTitle>
        <Note tone="warning">
          The cloud API returned these facilities, but not the sites they name. They are listed
          separately rather than shown under a site the portal cannot confirm.
        </Note>
        <CListGroup>
          {facilities.map((facility) => (
            <FacilityLink key={facility.id} facility={facility} />
          ))}
        </CListGroup>
      </CCardBody>
    </CCard>
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
      <div className="d-flex flex-column gap-4" data-testid="greenhouses-page">
        <LoadingState label="Loading your sites and facilities…" />
      </div>
    );
  }

  if (topology.error !== null && topology.error !== undefined) {
    return (
      <div className="d-flex flex-column gap-4" data-testid="greenhouses-page">
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
    <div className="d-flex flex-column gap-4" data-testid="greenhouses-page">
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
          <p className="prose text-body-secondary" data-testid="topology-summary">
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

          <CRow className="g-4">
            {topology.groups.map((group) => (
              <CCol key={group.site.id} xs={12} md={6} xxl={4}>
                <SiteSection group={group} />
              </CCol>
            ))}
            {topology.unmatchedFacilities.length > 0 ? (
              <CCol xs={12} md={6} xxl={4}>
                <UnmatchedFacilities facilities={topology.unmatchedFacilities} />
              </CCol>
            ) : null}
          </CRow>
        </>
      )}
    </div>
  );
}
