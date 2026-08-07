/**
 * One control zone's automatic rules, joined to the points they name.
 *
 * Two reads, and only one of them is new: the loop list for this zone, and the
 * facility configuration document the workspace is already polling for its
 * readings and its actuators. Naming the three points a loop refers to is
 * therefore a lookup in a document already in the cache, not a request per
 * point.
 *
 * The loop list is configuration, so it is read once and not polled. A rule
 * changes when someone provisions it, not every thirty seconds.
 */

import { useMemo } from "react";
import { useControlLoopsQuery, useFacilityConfigurationQuery } from "../../api/queries";
import type { LoadState } from "../topology/useTopology";
import { toLoadState } from "../topology/useTopology";
import type { ZoneControlLoop } from "./controlLoops";
import { readZoneControlLoops } from "./controlLoops";

/** What a zone's automatic rules look like to the section showing them. */
export interface ZoneControlLoops extends LoadState {
  readonly loops: readonly ZoneControlLoop[];
  /** Whether a loop list has been read at all. */
  readonly hasLoops: boolean;
  /** Whether the portal read fewer loops than the backend's own total. */
  readonly isIncomplete: boolean;
  /** The backend's own count of the zone's loops. */
  readonly total: number;
  readonly refresh: () => void;
}

/**
 * Read the automatic control rules configured for one control zone.
 *
 * @param facilityId The facility the zone belongs to, untrusted.
 * @param zoneId The control zone, untrusted.
 * @param enabled Whether the workspace is in a state where loops may be read.
 * @returns The automatic-control view model.
 */
export function useZoneControlLoops(
  facilityId: string | undefined,
  zoneId: string | undefined,
  enabled: boolean,
): ZoneControlLoops {
  const query = useControlLoopsQuery(zoneId, enabled);
  // The same key the monitoring and manual-control sections read, so this adds
  // no request and shares their poll.
  const configuration = useFacilityConfigurationQuery(facilityId, enabled);

  const loops = useMemo(
    () => readZoneControlLoops(query.data?.items ?? [], configuration.data),
    [query.data, configuration.data],
  );

  return {
    ...toLoadState(query),
    loops,
    hasLoops: query.data !== undefined,
    isIncomplete: query.data?.complete === false,
    total: query.data?.total ?? 0,
    refresh: () => {
      void query.refetch();
    },
  };
}
