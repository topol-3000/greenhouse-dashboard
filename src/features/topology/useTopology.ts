/**
 * View models for the topology screens.
 *
 * The pages below this file are presentational: they render what these hooks
 * describe and issue no request of their own. Every hook composes the shared
 * queries in `src/api/queries.ts`, so the Greenhouses overview, the Dashboard,
 * the facility switcher and a facility workspace read one copy of the topology
 * between them rather than four.
 *
 * Each hook separates four things the screens must not blur together: the first
 * load, a refresh running over data already on screen, a failure with nothing
 * to fall back on, and a failure with a usable previous answer behind it.
 */

import { useMemo } from "react";
import type {
  ControlZoneRead,
  FacilityRead,
  SiteRead,
  ZonePointAssignmentRead,
} from "../../api/contract";
import type { Collection } from "../../api/pagination";
import {
  useControlZonePointsQuery,
  useControlZoneQuery,
  useControlZonesQuery,
  useFacilitiesQuery,
  useFacilityQuery,
  useSiteQuery,
  useSitesQuery,
} from "../../api/queries";
import { isResourceMissing, sameResourceId } from "../../api/topology";

/** The part of a query result a screen needs to choose a state. */
export interface LoadState {
  /** Nothing has been read yet and a request is in flight. */
  readonly isLoading: boolean;
  /** A refresh is running over an answer that is already on screen. */
  readonly isRefreshing: boolean;
  /** The read failed and there is nothing to show instead. */
  readonly error: unknown;
  /** A refresh failed, but the previous answer is still usable. */
  readonly refreshError: unknown;
}

/** The subset of a TanStack query result {@link toLoadState} reads. */
interface QuerySnapshot {
  readonly isPending: boolean;
  readonly isFetching: boolean;
  readonly isError: boolean;
  readonly error: unknown;
  readonly data: unknown;
}

/**
 * Describe one query as a load state.
 *
 * The distinction that matters is whether there is data behind the failure. A
 * failed first load is an error state; a failed refresh over cached data is a
 * warning next to data that stays exactly where it was.
 *
 * @param query The query result.
 * @returns The state its screen should render.
 */
export function toLoadState(query: QuerySnapshot): LoadState {
  const hasData = query.data !== undefined;
  return {
    isLoading: query.isPending && !hasData,
    isRefreshing: query.isFetching && hasData,
    error: query.isError && !hasData ? query.error : null,
    refreshError: query.isError && hasData ? query.error : null,
  };
}

/**
 * Merge several load states into one.
 *
 * @param states The states to combine.
 * @returns A state that is loading if any is, and failing if any is.
 */
export function mergeLoadStates(...states: readonly LoadState[]): LoadState {
  return {
    isLoading: states.some((state) => state.isLoading),
    isRefreshing: states.some((state) => state.isRefreshing),
    error: states.find((state) => state.error !== null && state.error !== undefined)?.error ?? null,
    refreshError:
      states.find((state) => state.refreshError !== null && state.refreshError !== undefined)
        ?.refreshError ?? null,
  };
}

/** One site with the facilities the API says belong to it. */
export interface SiteGroup {
  readonly site: SiteRead;
  readonly facilities: readonly FacilityRead[];
}

/** The whole topology the portal has read, grouped for display. */
export interface TopologyOverview extends LoadState {
  readonly groups: readonly SiteGroup[];
  /** Facilities whose `site_id` names a site the portal did not receive. */
  readonly unmatchedFacilities: readonly FacilityRead[];
  readonly sites: Collection<SiteRead> | undefined;
  readonly facilities: Collection<FacilityRead> | undefined;
  /** Whether any data has been read at all. */
  readonly hasData: boolean;
  readonly refresh: () => void;
}

/**
 * Read every site and facility, grouped by the API's own `site_id`.
 *
 * Two requests describe any number of sites: the facilities are listed once and
 * grouped here, rather than one filtered request per site. Grouping uses the
 * `site_id` the contract publishes on each facility — never a name, a code or a
 * position in a list.
 */
export function useTopologyOverview(): TopologyOverview {
  const sites = useSitesQuery();
  const facilities = useFacilitiesQuery();

  const grouped = useMemo(() => {
    const siteItems = sites.data?.items ?? [];
    const facilityItems = facilities.data?.items ?? [];

    const bySite = new Map<string, FacilityRead[]>();
    for (const facility of facilityItems) {
      const key = facility.site_id.toLowerCase();
      const bucket = bySite.get(key);
      if (bucket === undefined) {
        bySite.set(key, [facility]);
      } else {
        bucket.push(facility);
      }
    }

    const groups = siteItems.map<SiteGroup>((site) => ({
      site,
      facilities: bySite.get(site.id.toLowerCase()) ?? [],
    }));

    const known = new Set(siteItems.map((site) => site.id.toLowerCase()));
    const unmatchedFacilities = facilityItems.filter(
      (facility) => !known.has(facility.site_id.toLowerCase()),
    );

    return { groups, unmatchedFacilities };
  }, [sites.data, facilities.data]);

  const state = mergeLoadStates(toLoadState(sites), toLoadState(facilities));

  return {
    ...state,
    groups: grouped.groups,
    unmatchedFacilities: grouped.unmatchedFacilities,
    sites: sites.data,
    facilities: facilities.data,
    hasData: sites.data !== undefined || facilities.data !== undefined,
    refresh: () => {
      void sites.refetch();
      void facilities.refetch();
    },
  };
}

/** Everything the Facility workspace renders. */
export interface FacilityWorkspace extends LoadState {
  readonly facility: FacilityRead | undefined;
  readonly site: SiteRead | undefined;
  readonly zones: Collection<ControlZoneRead> | undefined;
  /** The cloud API has no facility with this identifier. */
  readonly isMissing: boolean;
  readonly refresh: () => void;
}

/**
 * Read one facility, its site and its control zones.
 *
 * The facility is resolved with the contract's direct lookup rather than by
 * listing facilities and searching, so a deep link costs one request. The site
 * follows from the facility's `site_id`, which is a dependent request the
 * contract makes unavoidable: `FacilityRead` carries the identifier, not the
 * site's name. The zones are filtered by the backend through `facility_id`.
 *
 * @param facilityId The identifier from the route, untrusted.
 * @returns The workspace's data and state.
 */
export function useFacilityWorkspace(facilityId: string | undefined): FacilityWorkspace {
  const facility = useFacilityQuery(facilityId);
  const site = useSiteQuery(facility.data?.site_id);
  const zones = useControlZonesQuery(facilityId);

  const isMissing = isResourceMissing(facility.error);
  const facilityState = toLoadState(facility);

  // A missing facility is the page's own answer, not a failed read: the zone
  // and site queries are meaningless without it, so nothing else is reported.
  const state = isMissing
    ? { isLoading: false, isRefreshing: false, error: null, refreshError: null }
    : mergeLoadStates(facilityState, toLoadState(zones), toLoadState(site));

  return {
    ...state,
    facility: facility.data,
    site: site.data,
    zones: zones.data,
    isMissing,
    refresh: () => {
      void facility.refetch();
      void zones.refetch();
      void site.refetch();
    },
  };
}

/** Whether a control zone belongs to the facility the address names. */
export type ZoneRelationship = "unknown" | "belongs" | "mismatch";

/** Everything the ControlZone workspace renders. */
export interface ControlZoneWorkspace extends LoadState {
  readonly zone: ControlZoneRead | undefined;
  readonly facility: FacilityRead | undefined;
  readonly site: SiteRead | undefined;
  readonly points: Collection<ZonePointAssignmentRead> | undefined;
  /** The cloud API has no control zone with this identifier. */
  readonly isZoneMissing: boolean;
  /** The cloud API has no facility with the identifier in the address. */
  readonly isFacilityMissing: boolean;
  readonly relationship: ZoneRelationship;
  readonly refresh: () => void;
}

/**
 * Read one control zone in the context of the facility the address names.
 *
 * The zone and the facility are resolved in parallel — both are direct lookups,
 * so neither waits for the other — and the site follows from the facility. The
 * relationship is then checked against `ControlZoneRead.facility_id`, the only
 * statement of parentage the contract makes for a zone. A zone that exists but
 * names a different facility is a mismatch, never a page drawn under the wrong
 * parent because the URL said so.
 *
 * @param facilityId The facility identifier from the route, untrusted.
 * @param zoneId The zone identifier from the route, untrusted.
 * @returns The workspace's data and state.
 */
export function useControlZoneWorkspace(
  facilityId: string | undefined,
  zoneId: string | undefined,
): ControlZoneWorkspace {
  const zone = useControlZoneQuery(zoneId);
  const facility = useFacilityQuery(facilityId);
  const site = useSiteQuery(facility.data?.site_id);
  const points = useControlZonePointsQuery(zoneId);

  const isZoneMissing = isResourceMissing(zone.error);
  const isFacilityMissing = isResourceMissing(facility.error);

  let relationship: ZoneRelationship = "unknown";
  if (zone.data !== undefined) {
    relationship = sameResourceId(zone.data.facility_id, facilityId) ? "belongs" : "mismatch";
  }

  const resolved = isZoneMissing || isFacilityMissing || relationship === "mismatch";
  const state = resolved
    ? { isLoading: false, isRefreshing: false, error: null, refreshError: null }
    : mergeLoadStates(
        toLoadState(zone),
        toLoadState(facility),
        toLoadState(site),
        toLoadState(points),
      );

  return {
    ...state,
    zone: zone.data,
    facility: facility.data,
    site: site.data,
    points: points.data,
    isZoneMissing,
    isFacilityMissing,
    relationship,
    refresh: () => {
      void zone.refetch();
      void facility.refetch();
      void points.refetch();
      void site.refetch();
    },
  };
}
