/**
 * What the landing page reads, and how much of it.
 *
 * The contract publishes no operation that describes more than one facility, so
 * current state for N facilities is N polled requests and there is no way round
 * it. The landing page therefore reads a bounded slice — see
 * {@link DASHBOARD_FACILITY_LIMIT} — and says so on screen rather than quietly
 * showing a customer part of their estate as though it were all of it.
 *
 * The slice is the first facilities in the order the cloud API returned them.
 * It is not the "most important" or the "least healthy" ones: the contract
 * publishes no such ranking, and inventing one would be this portal deciding
 * which greenhouse matters.
 *
 * Every facility keeps its own loading and error state. One facility the cloud
 * API cannot describe leaves the others' readings exactly where they were.
 */

import type { FacilityRead } from "../../api/contract";
import { DASHBOARD_FACILITY_LIMIT, useFacilityConfigurationsQuery } from "../../api/queries";
import type { FacilityReadings } from "../monitoring/useFacilityReadings";
import { toFacilityReadings } from "../monitoring/useFacilityReadings";
import { useTopologyOverview } from "../topology/useTopology";

/** One facility of the landing page, with what it is reading. */
export interface DashboardFacility {
  readonly facility: FacilityRead;
  readonly readings: FacilityReadings;
}

/** What the landing page shows of the customer's facilities. */
export interface DashboardReadings {
  /** The facilities being read, already bounded. */
  readonly facilities: readonly DashboardFacility[];
  /** How many facilities the cloud API reports, by its own count. */
  readonly total: number;
  /** Whether more facilities exist than are being read. */
  readonly isBounded: boolean;
  /** The bound itself, so the screen and the limit cannot drift apart. */
  readonly limit: number;
  /** Whether the facility list has been read at all. */
  readonly hasTopology: boolean;
}

/**
 * Read current state for a bounded slice of the customer's facilities.
 *
 * @returns The landing page's readings view model.
 */
export function useDashboardReadings(): DashboardReadings {
  const topology = useTopologyOverview();

  const all = topology.facilities?.items ?? [];
  const shown = all.slice(0, DASHBOARD_FACILITY_LIMIT);
  const configurations = useFacilityConfigurationsQuery(shown.map((facility) => facility.id));

  const facilities = shown.map((facility, index) => {
    const query = configurations[index];
    return {
      facility,
      readings: toFacilityReadings({
        data: query?.data,
        error: query?.error,
        // A facility whose query has not been created yet is still arriving,
        // which is a loading state rather than an empty one.
        isPending: query?.isPending ?? true,
        isFetching: query?.isFetching ?? false,
        isError: query?.isError ?? false,
        refetch: () => query?.refetch(),
      }),
    };
  });

  // The backend's own count of matching rows, never the length of what arrived.
  const total = topology.facilities?.total ?? 0;

  return {
    facilities,
    total,
    isBounded: total > shown.length,
    limit: DASHBOARD_FACILITY_LIMIT,
    hasTopology: topology.facilities !== undefined,
  };
}
