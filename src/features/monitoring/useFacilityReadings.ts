/**
 * One facility's current readings, for a screen that is not inside a zone.
 *
 * This is {@link useZoneMonitoring} with the two zone-shaped things removed: no
 * point selection, because there is no history panel to select for, and no
 * telemetry window, because nothing here draws one. What remains is the same
 * configuration document, read under the same key, on the same bounded poll —
 * so a customer who opens a facility and then walks into one of its zones has
 * already paid for everything the zone workspace needs.
 *
 * A facility the cloud API does not have is reported as its own state rather
 * than as a failed read, exactly as the zone workspace reports it: the address
 * is wrong, and that is a different thing from monitoring being broken.
 */

import type { FacilityConfigurationRead } from "../../api/contract";
import { useFacilityConfigurationQuery } from "../../api/queries";
import { isResourceMissing } from "../../api/topology";
import type { LoadState } from "../topology/useTopology";
import { toLoadState } from "../topology/useTopology";
import type { ZoneReadings } from "./facilityMeasurements";
import { hasAnyMeasurement, readFacilityMeasurements } from "./facilityMeasurements";

/** What a facility's readings look like to the screen showing them. */
export interface FacilityReadings extends LoadState {
  /** Every control zone of the facility, with the measurements it is assigned. */
  readonly zones: readonly ZoneReadings[];
  /** Whether a configuration document has been read at all. */
  readonly hasConfiguration: boolean;
  /** Whether any zone of the facility has a measurement point. */
  readonly hasMeasurements: boolean;
  /** Whether the cloud API says this facility does not exist. */
  readonly isFacilityMissing: boolean;
  readonly refresh: () => void;
}

/** The part of a configuration query {@link toFacilityReadings} reads. */
export interface ConfigurationQuerySnapshot {
  readonly data: FacilityConfigurationRead | undefined;
  readonly error: unknown;
  readonly isPending: boolean;
  readonly isFetching: boolean;
  readonly isError: boolean;
  readonly refetch: () => unknown;
}

/**
 * Describe one configuration query as a facility's readings.
 *
 * Kept apart from the hook because the landing page reads several facilities at
 * once and cannot call a hook per facility. Both routes therefore produce the
 * same view model from the same query, and a rule about what a missing facility
 * means cannot come to differ between them.
 *
 * @param query The facility's configuration query.
 * @returns The readings view model.
 */
export function toFacilityReadings(query: ConfigurationQuerySnapshot): FacilityReadings {
  const zones = query.data === undefined ? [] : readFacilityMeasurements(query.data);
  const state = toLoadState(query);
  const isFacilityMissing = isResourceMissing(query.error);

  return {
    // A missing facility is an answer about the address, not a failed read, so
    // it is reported on its own rather than as a readings error as well.
    isLoading: isFacilityMissing ? false : state.isLoading,
    isRefreshing: isFacilityMissing ? false : state.isRefreshing,
    error: isFacilityMissing ? null : state.error,
    refreshError: isFacilityMissing ? null : state.refreshError,
    zones,
    hasConfiguration: query.data !== undefined,
    hasMeasurements: hasAnyMeasurement(zones),
    isFacilityMissing,
    refresh: () => {
      void query.refetch();
    },
  };
}

/**
 * Read one facility's zones and their current readings.
 *
 * @param facilityId The facility to describe, untrusted.
 * @param enabled Whether the screen is in a state where readings may be read.
 * @returns The readings view model.
 */
export function useFacilityReadings(
  facilityId: string | undefined,
  enabled = true,
): FacilityReadings {
  return toFacilityReadings(useFacilityConfigurationQuery(facilityId, enabled));
}
