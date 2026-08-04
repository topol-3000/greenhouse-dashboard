/**
 * What an Activity address means, and what it is not allowed to mean.
 *
 * Activity's whole selection lives in the URL — `site`, `facility`, `zone`,
 * `point`, `source` and `command` — so a refresh restores it, Back and Forward
 * restore it, and a link to one command is a link someone can send. That makes
 * every one of those parameters untrusted text, and this module is where each is
 * turned into either a value the loaded customer context proves, or nothing.
 *
 * Two rules the functions below exist to enforce:
 *
 * - a parameter is adopted only when the data the portal has actually loaded
 *   contains it. A `zone` that names no zone of the selected facility selects no
 *   zone; a `command` whose `control_zone_id` is not the selected zone is
 *   reported as outside the selection rather than opened, because a UUID in an
 *   address is a claim and not evidence;
 * - a parameter that cannot be adopted degrades to "not selected" and says so.
 *   It never invalidates the parameters around it, and it is never silently
 *   rewritten into something that does resolve.
 */

import type { CommandSource } from "../../api/contract";
import { CONTROL_LOOP_COMMAND_SOURCE, MANUAL_COMMAND_SOURCE } from "../../api/contract";

/** The search parameter carrying the selected site. */
export const SITE_PARAM = "site";

/** The search parameter carrying the selected facility. */
export const FACILITY_PARAM = "facility";

/** The search parameter carrying the selected control zone. */
export const ZONE_PARAM = "zone";

/**
 * The search parameter carrying the selected target actuator.
 *
 * Spelled exactly as the monitoring section spells its own point selection, so
 * a customer moving between a zone workspace and Activity meets one name for
 * one idea rather than two.
 */
export const POINT_PARAM = "point";

/** The search parameter carrying the source filter, in the contract's words. */
export const SOURCE_PARAM = "source";

/** The search parameter carrying the command whose details are open. */
export const COMMAND_PARAM = "command";

/** Every search parameter Activity owns, so one place can clear them all. */
export const ACTIVITY_PARAMS = [
  SITE_PARAM,
  FACILITY_PARAM,
  ZONE_PARAM,
  POINT_PARAM,
  SOURCE_PARAM,
  COMMAND_PARAM,
] as const;

/** One Activity address, read as text and not yet believed. */
export interface ActivityParams {
  readonly site: string | undefined;
  readonly facility: string | undefined;
  readonly zone: string | undefined;
  readonly point: string | undefined;
  readonly source: string | undefined;
  readonly command: string | undefined;
}

/**
 * Trim one search parameter into a value, or nothing.
 *
 * @param raw The parameter as the router decoded it.
 * @returns The value, or `undefined` when the parameter carries none.
 */
export function readParam(raw: string | null): string | undefined {
  const value = raw?.trim();
  return value === undefined || value === "" ? undefined : value;
}

/**
 * Read every Activity parameter out of one address.
 *
 * @param search The current location's search parameters.
 * @returns The parameters as text, with empty ones absent.
 */
export function readActivityParams(search: URLSearchParams): ActivityParams {
  return {
    site: readParam(search.get(SITE_PARAM)),
    facility: readParam(search.get(FACILITY_PARAM)),
    zone: readParam(search.get(ZONE_PARAM)),
    point: readParam(search.get(POINT_PARAM)),
    source: readParam(search.get(SOURCE_PARAM)),
    command: readParam(search.get(COMMAND_PARAM)),
  };
}

/**
 * The `CommandSource` a `?source=` value names, if it names one.
 *
 * The address carries the contract's own vocabulary — `manual` and
 * `control_loop` — rather than a second set of words that would have to be
 * mapped in two directions and could drift from the enum. The filter is shown to
 * the customer as Manual and Automatic; the value sent to the API and written to
 * the URL is the one `CommandSource` publishes.
 *
 * Anything else is not a source. It selects nothing and, deliberately, does not
 * make the rest of the address invalid.
 *
 * @param raw The `?source=` value, as it arrived.
 * @returns The source to filter by, or `undefined` for all sources.
 */
export function parseSourceParam(raw: string | undefined): CommandSource | undefined {
  if (raw === MANUAL_COMMAND_SOURCE || raw === CONTROL_LOOP_COMMAND_SOURCE) {
    return raw;
  }
  return undefined;
}

/**
 * Whether a `?source=` value was given and is not one the contract publishes.
 *
 * @param raw The `?source=` value, as it arrived.
 * @returns Whether the address asked for a source that does not exist.
 */
export function hasUnknownSource(raw: string | undefined): boolean {
  return raw !== undefined && parseSourceParam(raw) === undefined;
}

/** A change to the Activity selection, as a set of parameters to write. */
export type ActivityPatch = Readonly<Partial<Record<string, string | null>>>;

/**
 * Apply one change to an Activity address.
 *
 * A `null` removes a parameter and a string sets it. Everything the patch does
 * not mention is left exactly as it was, which is what keeps a query parameter
 * belonging to another feature — or to a future one — from being dropped by an
 * Activity filter change.
 *
 * @param current The address being changed.
 * @param patch The parameters to set or remove.
 * @returns The new search parameters.
 */
export function applyActivityPatch(
  current: URLSearchParams,
  patch: ActivityPatch,
): URLSearchParams {
  const next = new URLSearchParams(current);
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined || value === "") {
      next.delete(key);
    } else {
      next.set(key, value);
    }
  }
  return next;
}

/**
 * The patch that selects a site, and drops what it invalidates.
 *
 * Choosing a different site cannot leave a facility, a zone, an actuator or an
 * open command from the previous one in the address: each of those is a
 * statement about a resource inside the site that is no longer selected.
 */
export function selectSitePatch(siteId: string | null): ActivityPatch {
  return {
    [SITE_PARAM]: siteId,
    [FACILITY_PARAM]: null,
    [ZONE_PARAM]: null,
    [POINT_PARAM]: null,
    [COMMAND_PARAM]: null,
  };
}

/** The patch that selects a facility, dropping the zone selection under it. */
export function selectFacilityPatch(facilityId: string | null): ActivityPatch {
  return {
    [FACILITY_PARAM]: facilityId,
    [ZONE_PARAM]: null,
    [POINT_PARAM]: null,
    [COMMAND_PARAM]: null,
  };
}

/** The patch that selects a control zone, dropping the selections inside it. */
export function selectZonePatch(zoneId: string | null): ActivityPatch {
  return {
    [ZONE_PARAM]: zoneId,
    [POINT_PARAM]: null,
    [COMMAND_PARAM]: null,
  };
}

/**
 * The patch that filters by target actuator.
 *
 * The open command is dropped with it: a command that is not for the actuator
 * now being filtered on would otherwise stay open beside a list it is not in.
 */
export function selectPointPatch(pointId: string | null): ActivityPatch {
  return { [POINT_PARAM]: pointId, [COMMAND_PARAM]: null };
}

/** The patch that filters by source, for the same reason as the actuator. */
export function selectSourcePatch(source: CommandSource | null): ActivityPatch {
  return { [SOURCE_PARAM]: source, [COMMAND_PARAM]: null };
}

/**
 * The patch that opens or closes command details.
 *
 * Closing removes the command and nothing else, so the filters a customer set
 * before opening a command survive closing it.
 */
export function selectCommandPatch(commandId: string | null): ActivityPatch {
  return { [COMMAND_PARAM]: commandId };
}
