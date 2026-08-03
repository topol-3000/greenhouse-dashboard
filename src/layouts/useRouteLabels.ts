/**
 * Resolved resource names for the shell's heading, title and breadcrumbs.
 *
 * A nested route is understandable before its data arrives — the route table's
 * generic titles ("Facility", "Control zone") are shown while the request is in
 * flight — and gains the real name the moment the query answers. Nothing here
 * changes the route table, so a name resolving cannot alter what is matched or
 * cause a navigation.
 *
 * The queries used are the same ones the pages use, keyed identically, so the
 * shell and the page share one request rather than making two.
 *
 * A control zone that the contract does not place inside the facility in the
 * address is deliberately left unnamed: the page refuses to draw it under that
 * facility, and a breadcrumb trail must not claim otherwise.
 */

import { useMemo } from "react";
import { useControlZoneQuery, useFacilityQuery } from "../api/queries";
import { sameResourceId } from "../api/topology";
import type { RouteLabels } from "../routes/routes";
import { CONTROL_ZONE_PATH, FACILITY_PATH, matchPortalLocation } from "../routes/routes";

/**
 * Resolve the display names the current address needs.
 *
 * @param pathname The current location's pathname.
 * @returns Labels keyed by route path pattern, for the route table to apply.
 */
export function useRouteLabels(pathname: string): RouteLabels {
  const matched = matchPortalLocation(pathname);
  const facilityId = matched?.params["facilityId"];
  const zoneId = matched?.params["zoneId"];

  const facility = useFacilityQuery(facilityId);
  const zone = useControlZoneQuery(zoneId);

  const facilityName = facility.data?.name;
  const zoneName = zone.data?.name;
  const zoneBelongs = sameResourceId(zone.data?.facility_id, facilityId);

  return useMemo<RouteLabels>(() => {
    const labels: Record<string, string> = {};
    if (facilityName !== undefined) {
      labels[FACILITY_PATH] = facilityName;
    }
    if (zoneName !== undefined && zoneBelongs) {
      labels[CONTROL_ZONE_PATH] = zoneName;
    }
    return labels;
  }, [facilityName, zoneName, zoneBelongs]);
}
