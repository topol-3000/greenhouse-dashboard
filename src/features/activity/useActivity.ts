/**
 * The view model for the Activity page.
 *
 * It is the only place Activity issues a request, and the components below it
 * stay presentational. Four reads make it up, and three of them are already
 * cached by the rest of the portal:
 *
 * - the sites and facilities the Greenhouses overview and the Dashboard read;
 * - the selected facility's control zones, keyed exactly as the facility
 *   workspace keys them;
 * - the selected facility's configuration document, keyed exactly as monitoring
 *   and manual control key it — which is what resolves point names and the
 *   reported point's state without one request per row;
 * - the selected zone's control loops, keyed exactly as the ControlZone
 *   workspace keys them, so an automatic command's cause has a name rather than
 *   a bare identifier — read once for the zone, never once per command;
 * - and Activity's own bounded window of commands.
 *
 * A command opened for details adds one more: `GET /api/v1/commands/{id}`, the
 * authoritative read, followed for a bounded time by
 * {@link useCommandObservation}.
 *
 * The selection lives entirely in the URL, and every part of it is verified
 * against loaded data before it is believed. A facility the selected site does
 * not contain, a zone the selected facility does not contain, an actuator the
 * selected zone does not assign, a source the contract does not publish and a
 * command whose `control_zone_id` is not the selected zone are each reported as
 * unrecognised and select nothing. None of them invalidates the rest of the
 * address, and none of them is silently rewritten into something that resolves.
 */

import { useCallback, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import type { CommandSource, ControlZoneRead, FacilityRead, SiteRead } from "../../api/contract";
import type { Collection } from "../../api/pagination";
import {
  ACTIVITY_COMMAND_LIMIT,
  queryKeys,
  useCommandListQuery,
  useControlZonesQuery,
  useControlLoopsQuery,
  useFacilityConfigurationQuery,
} from "../../api/queries";
import { isResourceMissing, sameResourceId } from "../../api/topology";
import type { ActuatorFeedback, ZoneActuator } from "../control/actuators";
import { readZoneActuators } from "../control/actuators";
import type { ZoneControlLoop } from "../control/controlLoops";
import { findControlLoop, readZoneControlLoops } from "../control/controlLoops";
import type { LoadState } from "../topology/useTopology";
import { toLoadState, useTopologyOverview } from "../topology/useTopology";
import type { TopologyOverview } from "../topology/useTopology";
import type { ActivityCommand } from "./activityCommands";
import {
  readPointLabel,
  readReportedFeedback,
  toActivityCommands,
  indexPoints,
} from "./activityCommands";
import type { ActivityPatch } from "./activitySelection";
import {
  applyActivityPatch,
  hasUnknownSource,
  parseSourceParam,
  readActivityParams,
  selectCommandPatch,
  selectFacilityPatch,
  selectPointPatch,
  selectSitePatch,
  selectSourcePatch,
  selectZonePatch,
} from "./activitySelection";
import type { CommandObservation } from "./useCommandObservation";
import { useCommandObservation } from "./useCommandObservation";

/** What the address selected, once the loaded data proved it. */
export interface ActivitySelection {
  readonly site: SiteRead | undefined;
  readonly facility: FacilityRead | undefined;
  readonly zone: ControlZoneRead | undefined;
  /** The target actuator the list is filtered by, when one was chosen. */
  readonly actuator: ZoneActuator | undefined;
  readonly source: CommandSource | undefined;
  /** The command whose details the address asks for, before verification. */
  readonly commandId: string | undefined;
}

/** Parameters that were present in the address and could not be believed. */
export interface UnrecognisedSelection {
  readonly site: boolean;
  readonly facility: boolean;
  readonly zone: boolean;
  readonly point: boolean;
  readonly source: boolean;
}

/** The bounded window of commands, and how it is doing. */
export interface ActivityWindow extends LoadState {
  /** The commands the API returned, in its own newest-first order. */
  readonly rows: readonly ActivityCommand[];
  /** Whether a window has been received at all. */
  readonly hasAnswer: boolean;
  /** The number of commands asked for. */
  readonly limit: number;
  /**
   * Whether the answer filled the window, so older commands exist beyond it.
   *
   * The contract publishes no total and no cursor, so this is the only honest
   * thing that can be said about what is not on screen.
   */
  readonly isFull: boolean;
  readonly refresh: () => void;
}

/** Everything the command details region renders. */
export interface ActivityDetails {
  /** The command the address names. */
  readonly commandId: string;
  readonly observation: CommandObservation;
  /** The labels the command's identifiers resolve to, once it is loaded. */
  readonly labels: ActivityCommand | undefined;
  /** The reported point's own last known state, from the configuration. */
  readonly reported: ActuatorFeedback | undefined;
  /**
   * The command exists, and is not a command of the selected control zone.
   *
   * Its details are deliberately not shown: a UUID in an address is a claim,
   * and the portal does not adopt a command into a context the contract does
   * not place it in.
   */
  readonly isOutsideContext: boolean;
  /** The configuration document that resolves labels could not be read. */
  readonly labelsUnavailable: boolean;
  /**
   * The control loop the command names, if this zone's list contains it.
   *
   * A command may name a loop the list does not contain — the list is scoped to
   * one zone, and a loop can be deleted after it issued a command. That is left
   * unresolved and shown as the identifier, never guessed at.
   */
  readonly loop: ZoneControlLoop | undefined;
}

/** Everything the Activity page renders. */
export interface ActivityView {
  readonly topology: TopologyOverview;
  /** The sites the API returned, as the site filter offers them. */
  readonly siteOptions: readonly SiteRead[];
  /** The facilities offered, narrowed by the selected site. */
  readonly facilityOptions: readonly FacilityRead[];
  /** The selected facility's zones, as the API returned them. */
  readonly zoneOptions: readonly ControlZoneRead[];
  /** The selected zone's control outputs, as the actuator filter offers them. */
  readonly actuatorOptions: readonly ZoneActuator[];
  readonly zones: LoadState & { readonly collection: Collection<ControlZoneRead> | undefined };
  readonly configuration: LoadState & {
    readonly hasAnswer: boolean;
    /** The cloud API has no facility with the selected identifier. */
    readonly isFacilityMissing: boolean;
    /** The document loaded and does not contain the selected zone. */
    readonly isZoneAbsent: boolean;
  };
  readonly selection: ActivitySelection;
  readonly unrecognised: UnrecognisedSelection;
  readonly commands: ActivityWindow;
  /** The open command's details, or `undefined` when none is open. */
  readonly details: ActivityDetails | undefined;
  readonly selectSite: (siteId: string | null) => void;
  readonly selectFacility: (facilityId: string | null) => void;
  readonly selectZone: (zoneId: string | null) => void;
  readonly selectActuator: (pointId: string | null) => void;
  readonly selectSource: (source: CommandSource | null) => void;
  readonly openCommand: (commandId: string) => void;
  readonly closeCommand: () => void;
}

/**
 * Read the Activity page's state.
 *
 * @returns The view model the page renders.
 */
export function useActivity(): ActivityView {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const params = readActivityParams(searchParams);

  const topology = useTopologyOverview();
  const sites = topology.sites?.items ?? [];
  const facilities = topology.facilities?.items ?? [];

  // --- Site -------------------------------------------------------------
  //
  // A site is adopted only when the API returned it. A `?site=` naming none is
  // reported and then ignored: it narrows nothing, and it does not stop a
  // facility in the same address from resolving.
  const site = sites.find((candidate) => sameResourceId(candidate.id, params.site));
  const siteUnrecognised = params.site !== undefined && site === undefined && topology.hasData;

  // --- Facility ---------------------------------------------------------
  //
  // Parentage is `FacilityRead.site_id` and nothing else. A facility the
  // selected site does not own is not drawn under it, exactly as the facility
  // and zone workspaces refuse a mismatched pair.
  const facilityCandidate = facilities.find((candidate) =>
    sameResourceId(candidate.id, params.facility),
  );
  const facilityBelongs =
    facilityCandidate !== undefined &&
    (site === undefined || sameResourceId(facilityCandidate.site_id, site.id));
  const facility = facilityBelongs ? facilityCandidate : undefined;
  const facilityUnrecognised =
    params.facility !== undefined && facility === undefined && topology.hasData;

  // The site shown when the address named none: the selected facility's own,
  // read from the contract's `site_id` rather than guessed.
  const effectiveSite =
    site ?? sites.find((candidate) => sameResourceId(candidate.id, facility?.site_id));

  const facilityOptions =
    site === undefined
      ? facilities
      : facilities.filter((candidate) => sameResourceId(candidate.site_id, site.id));

  // --- Control zone -----------------------------------------------------
  const zonesQuery = useControlZonesQuery(facility?.id);
  const zoneOptions = zonesQuery.data?.items ?? [];
  const zoneCandidate = zoneOptions.find((candidate) => sameResourceId(candidate.id, params.zone));
  const zone =
    zoneCandidate !== undefined && sameResourceId(zoneCandidate.facility_id, facility?.id)
      ? zoneCandidate
      : undefined;
  const zoneUnrecognised =
    params.zone !== undefined && zone === undefined && zonesQuery.data !== undefined;

  // --- Configuration: labels, actuator options, reported state ----------
  const configurationQuery = useFacilityConfigurationQuery(facility?.id, facility !== undefined);
  // Read once per zone so an automatic command's cause has a name. Shares its
  // key with the ControlZone workspace, so moving between the two re-reads
  // nothing, and it is never requested per command row.
  const controlLoopsQuery = useControlLoopsQuery(zone?.id, zone !== undefined);
  const configuration = configurationQuery.data;

  const selectedZoneId = zone?.id;
  // Read straight from the document rather than memoised by hand: the work is a
  // lookup and a loop over one zone's links, and the compiler memoises what is
  // worth memoising without a dependency list that can fall out of step.
  const actuatorOptions: readonly ZoneActuator[] =
    configuration === undefined || selectedZoneId === undefined
      ? []
      : readZoneActuators(configuration, selectedZoneId).actuators;

  const isZoneAbsent =
    configuration !== undefined &&
    zone !== undefined &&
    !configuration.control_zones.some((candidate) => sameResourceId(candidate.id, zone.id));

  // --- Target actuator filter -------------------------------------------
  //
  // An actuator is a point the contract assigns to *this* zone as a control
  // output. It is never recognised by name, by code or by position, and an
  // identifier the zone does not assign filters nothing rather than filtering
  // everything away.
  const actuator = actuatorOptions.find((candidate) =>
    sameResourceId(candidate.pointId, params.point),
  );
  const pointUnrecognised =
    params.point !== undefined && actuator === undefined && configuration !== undefined;

  // --- Source filter ----------------------------------------------------
  const source = parseSourceParam(params.source);
  const sourceUnrecognised = hasUnknownSource(params.source);

  // --- The window -------------------------------------------------------
  //
  // The request waits for the actuator filter to be decided. Asking before the
  // configuration document has answered would send one window without the
  // filter and a second one with it, and would briefly show the customer a list
  // that is not the one their address asked for.
  const pointDecided = params.point === undefined || configuration !== undefined;
  const filters = {
    controlZoneId: zone?.id ?? "",
    ...(actuator === undefined ? {} : { targetPointId: actuator.pointId }),
    ...(source === undefined ? {} : { source }),
    limit: ACTIVITY_COMMAND_LIMIT,
  };
  const commandsQuery = useCommandListQuery(filters, zone !== undefined && pointDecided);

  const items = commandsQuery.data?.items;
  const rows = useMemo(
    () => (items === undefined ? [] : toActivityCommands(items, configuration)),
    [items, configuration],
  );

  // --- The open command -------------------------------------------------
  //
  // Details are only ever asked for inside a resolved zone: without one there
  // is no context to verify the command against, and the portal does not read
  // an arbitrary identifier out of an address just because it is well-formed.
  const commandId = zone === undefined ? undefined : params.command;
  const observation = useCommandObservation(commandId);
  const observedCommand = observation.command;

  /*
   * A command already in the loaded window seeds the detail cache, so opening a
   * row renders the answer already in hand instead of a spinner. It is only a
   * seed: the authoritative read still runs, and it is what the details and the
   * polling are built from.
   *
   * It seeds an empty slot and never an answered one. A window is a snapshot,
   * and the detail read is the current truth — so a command the detail read has
   * already answered about, including one it answered `404` for, keeps its own
   * answer. Writing a stale row over a `404` would resurrect a command the cloud
   * API says it does not have.
   */
  useEffect(() => {
    if (commandId === undefined || items === undefined) {
      return;
    }
    const known = items.find((candidate) => sameResourceId(candidate.id, commandId));
    if (known === undefined) {
      return;
    }
    const key = queryKeys.command(commandId);
    const state = queryClient.getQueryState(key);
    if (state?.data === undefined && (state?.error ?? null) === null) {
      queryClient.setQueryData(key, known);
    }
  }, [commandId, items, queryClient]);

  const isOutsideContext =
    observedCommand !== undefined &&
    zone !== undefined &&
    !sameResourceId(observedCommand.control_zone_id, zone.id);

  const zoneLoops = useMemo(
    () => readZoneControlLoops(controlLoopsQuery.data?.items ?? [], configuration),
    [controlLoopsQuery.data, configuration],
  );

  const detailLabels = useMemo<ActivityCommand | undefined>(() => {
    if (observedCommand === undefined || isOutsideContext) {
      return undefined;
    }
    const points = indexPoints(configuration);
    return {
      command: observedCommand,
      target: readPointLabel(points, observedCommand.target_point_id),
      reported: readPointLabel(points, observedCommand.reported_point_id),
    };
  }, [observedCommand, isOutsideContext, configuration]);

  const reported =
    observedCommand === undefined || isOutsideContext
      ? undefined
      : readReportedFeedback(configuration, observedCommand.reported_point_id);

  // --- Writing the address ----------------------------------------------
  //
  // Every selection is pushed rather than replaced, so Back and Forward walk
  // through the states the customer actually chose. That is the whole point of
  // putting the selection in the URL: a refresh restores it and history
  // restores it.
  const patch = useCallback(
    (change: ActivityPatch) => {
      setSearchParams((current) => applyActivityPatch(current, change));
    },
    [setSearchParams],
  );

  const configurationState = toLoadState(configurationQuery);
  const isFacilityMissing = isResourceMissing(configurationQuery.error);
  const commandsState = toLoadState(commandsQuery);

  return {
    topology,
    siteOptions: sites,
    facilityOptions,
    zoneOptions,
    actuatorOptions,
    zones: { ...toLoadState(zonesQuery), collection: zonesQuery.data },
    configuration: {
      ...(isFacilityMissing
        ? { isLoading: false, isRefreshing: false, error: null, refreshError: null }
        : configurationState),
      hasAnswer: configuration !== undefined,
      isFacilityMissing,
      isZoneAbsent,
    },
    selection: {
      site: effectiveSite,
      facility,
      zone,
      actuator,
      source,
      commandId,
    },
    unrecognised: {
      site: siteUnrecognised,
      facility: facilityUnrecognised,
      zone: zoneUnrecognised,
      point: pointUnrecognised,
      source: sourceUnrecognised,
    },
    commands: {
      ...commandsState,
      rows,
      hasAnswer: commandsQuery.data !== undefined,
      limit: ACTIVITY_COMMAND_LIMIT,
      isFull: (items?.length ?? 0) >= ACTIVITY_COMMAND_LIMIT,
      refresh: () => {
        void commandsQuery.refetch();
      },
    },
    details:
      commandId === undefined
        ? undefined
        : {
            commandId,
            observation,
            labels: detailLabels,
            reported,
            isOutsideContext,
            labelsUnavailable: configuration === undefined,
            loop: isOutsideContext
              ? undefined
              : findControlLoop(zoneLoops, observedCommand?.control_loop_id ?? null),
          },
    selectSite: (siteId) => {
      patch(selectSitePatch(siteId));
    },
    selectFacility: (facilityId) => {
      patch(selectFacilityPatch(facilityId));
    },
    selectZone: (zoneId) => {
      patch(selectZonePatch(zoneId));
    },
    selectActuator: (pointId) => {
      patch(selectPointPatch(pointId));
    },
    selectSource: (next) => {
      patch(selectSourcePatch(next));
    },
    openCommand: (id) => {
      patch(selectCommandPatch(id));
    },
    closeCommand: () => {
      patch(selectCommandPatch(null));
    },
  };
}
