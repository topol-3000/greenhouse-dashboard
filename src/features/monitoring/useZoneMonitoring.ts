/**
 * The view model for a control zone's monitoring section.
 *
 * It is the only place monitoring requests are started, and the components
 * below it stay presentational. Two independent reads make it up — the
 * facility's configuration document, which carries the zone's measurement
 * points and their last known state, and one bounded telemetry window for the
 * point the customer selected — and their states are kept apart on purpose:
 *
 * - a history failure leaves the current values on screen;
 * - a failed refresh of either leaves the last good answer on screen;
 * - neither is gated on `/health`, and neither is gated on the other.
 *
 * The selected point lives in the URL as `?point=`, so a link to one point's
 * history is a link someone can send. It is validated against the zone's own
 * loaded measurements before a request is made: an identifier that names no
 * measurement of this zone selects nothing and, deliberately, does not
 * invalidate the facility or control zone the address names.
 */

import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";
import type { TelemetryWindow } from "../../api/monitoring";
import { TELEMETRY_HISTORY_LIMIT } from "../../api/queries";
import { useFacilityConfigurationQuery, usePointTelemetryQuery } from "../../api/queries";
import { isResourceMissing, sameResourceId } from "../../api/topology";
import type { LoadState } from "../topology/useTopology";
import { toLoadState } from "../topology/useTopology";
import type { TelemetrySeries, ZoneMeasurement } from "./measurements";
import { readZoneMeasurements, toTelemetrySeries } from "./measurements";

/** The query parameter carrying the selected measurement point. */
export const POINT_PARAM = "point";

/** The telemetry half of the monitoring view model. */
export interface TelemetryView extends LoadState {
  /** The window the API returned, or `undefined` before the first answer. */
  readonly window: TelemetryWindow | undefined;
  /** The ordered, classified series built from {@link window}. */
  readonly series: TelemetrySeries | undefined;
  /** The number of samples the window was requested with. */
  readonly requestedLimit: number;
  /** Whether the response filled the window, so more samples may exist. */
  readonly windowIsFull: boolean;
  readonly refresh: () => void;
}

/** Everything the monitoring section renders. */
export interface ZoneMonitoring extends LoadState {
  /** The zone's active measurement points, with their last known state. */
  readonly measurements: readonly ZoneMeasurement[];
  /** Whether a configuration document has been read at all. */
  readonly hasInventory: boolean;
  /** Whether the configuration document contained this zone. */
  readonly zoneFound: boolean;
  /** The cloud API has no facility with the identifier in the address. */
  readonly isFacilityMissing: boolean;
  readonly refresh: () => void;
  /** The selected point, once it is one of {@link measurements}. */
  readonly selectedPoint: ZoneMeasurement | undefined;
  /** A `?point=` value that names no measurement of this loaded zone. */
  readonly hasUnknownSelection: boolean;
  readonly selectPoint: (pointId: string | null) => void;
  readonly telemetry: TelemetryView;
}

/**
 * Read one control zone's monitoring state.
 *
 * @param facilityId The facility identifier from the route, untrusted.
 * @param zoneId The zone identifier from the route, untrusted.
 * @param enabled Whether the workspace is in a state where monitoring may run.
 *   It is false for a zone the API does not have, and for a zone the contract
 *   places in a different facility — the portal does not read monitoring data
 *   for a relationship the API did not state.
 * @returns The monitoring view model.
 */
export function useZoneMonitoring(
  facilityId: string | undefined,
  zoneId: string | undefined,
  enabled: boolean,
): ZoneMonitoring {
  const [searchParams, setSearchParams] = useSearchParams();
  const configuration = useFacilityConfigurationQuery(facilityId, enabled);

  const inventory = useMemo(() => {
    if (configuration.data === undefined || zoneId === undefined) {
      return { zoneFound: false, measurements: [] as readonly ZoneMeasurement[] };
    }
    return readZoneMeasurements(configuration.data, zoneId);
  }, [configuration.data, zoneId]);

  const requested = searchParams.get(POINT_PARAM)?.trim() ?? "";
  const selectedPoint = inventory.measurements.find((measurement) =>
    sameResourceId(measurement.pointId, requested),
  );

  const telemetryQuery = usePointTelemetryQuery(selectedPoint?.pointId, TELEMETRY_HISTORY_LIMIT);

  const series = useMemo(
    () =>
      telemetryQuery.data === undefined ? undefined : toTelemetrySeries(telemetryQuery.data.items),
    [telemetryQuery.data],
  );

  const selectPoint = useCallback(
    (pointId: string | null) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (pointId === null) {
            next.delete(POINT_PARAM);
          } else {
            next.set(POINT_PARAM, pointId);
          }
          return next;
        },
        // Replace rather than push: selecting a point is a change of view
        // inside one workspace, and Back should leave the workspace rather than
        // walk backwards through every point the customer looked at.
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const configurationState = toLoadState(configuration);
  const isFacilityMissing = isResourceMissing(configuration.error);
  const telemetryState = toLoadState(telemetryQuery);

  const requestedLimit = telemetryQuery.data?.requestedLimit ?? TELEMETRY_HISTORY_LIMIT;

  return {
    // A missing facility is an answer about the address, not a failed read, so
    // it is reported on its own rather than as a monitoring error as well.
    isLoading: isFacilityMissing ? false : configurationState.isLoading,
    isRefreshing: isFacilityMissing ? false : configurationState.isRefreshing,
    error: isFacilityMissing ? null : configurationState.error,
    refreshError: isFacilityMissing ? null : configurationState.refreshError,
    measurements: inventory.measurements,
    hasInventory: configuration.data !== undefined,
    zoneFound: inventory.zoneFound,
    isFacilityMissing,
    refresh: () => {
      void configuration.refetch();
    },
    selectedPoint,
    hasUnknownSelection:
      requested !== "" && selectedPoint === undefined && configuration.data !== undefined,
    selectPoint,
    telemetry: {
      ...telemetryState,
      window: telemetryQuery.data,
      series,
      requestedLimit,
      windowIsFull: (telemetryQuery.data?.items.length ?? 0) >= requestedLimit,
      refresh: () => {
        void telemetryQuery.refetch();
      },
    },
  };
}
