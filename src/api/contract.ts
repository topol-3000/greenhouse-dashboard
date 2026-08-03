/**
 * The topology slice of the backend's published contract.
 *
 * Every type here is an alias of a schema in [`openapi.json`](../../openapi.json),
 * re-exported through the generated `schema.ts` rather than re-typed by hand.
 * That is deliberate: a field renamed in the backend's contract becomes a
 * TypeScript error here instead of `undefined` on a screen. Run
 * `npm run generate:api-types` after refreshing `openapi.json`.
 *
 * ## Operations this unit consumes
 *
 * | Purpose                                | Operation                                             | Response schema                  |
 * | -------------------------------------- | ----------------------------------------------------- | -------------------------------- |
 * | List sites                             | `GET /api/v1/sites`                                    | `Page[SiteRead]`                 |
 * | Resolve one site                       | `GET /api/v1/sites/{site_id}`                          | `SiteRead`                       |
 * | List facilities, optionally by site    | `GET /api/v1/facilities?site_id=`                      | `Page[FacilityRead]`             |
 * | Resolve one facility, and its site     | `GET /api/v1/facilities/{facility_id}`                 | `FacilityRead`                   |
 * | List a facility's control zones        | `GET /api/v1/control-zones?facility_id=`               | `Page[ControlZoneRead]`          |
 * | Resolve one zone, and its facility     | `GET /api/v1/control-zones/{zone_id}`                  | `ControlZoneRead`                |
 * | A zone's point composition             | `GET /api/v1/control-zones/{zone_id}/points`           | `Page[ZonePointAssignmentRead]`  |
 *
 * ## Relationships, as the contract states them
 *
 * `FacilityRead.site_id` and `ControlZoneRead.facility_id` are the only
 * statements of parentage the API makes, and they are the only ones the portal
 * uses. `ControlZoneRead` publishes no `site_id` — its own description says a
 * client reads the site from the zone's facility — so the ControlZone workspace
 * resolves the facility first and the site from that. Nothing is inferred from
 * a name, a code or the shape of a URL.
 *
 * ## What is deliberately not consumed here
 *
 * `GET /api/v1/facilities/{facility_id}/configuration` returns the same
 * topology *and* `ConfigurationPointState`, which is live point state. This
 * unit is topology only, so the narrow endpoints above are used instead of the
 * one that would carry readings into the portal.
 */

import type { components } from "./schema";

/** A site, as returned by every site endpoint. */
export type SiteRead = components["schemas"]["SiteRead"];

/** A facility, as returned by every facility endpoint. Carries `site_id`. */
export type FacilityRead = components["schemas"]["FacilityRead"];

/** A control zone, as returned by every zone endpoint. Carries `facility_id`. */
export type ControlZoneRead = components["schemas"]["ControlZoneRead"];

/** One point assigned to a control zone, with the point's descriptive fields. */
export type ZonePointAssignmentRead = components["schemas"]["ZonePointAssignmentRead"];

/** Lifecycle of a topology entity: `active` or `archived`. */
export type StatusEnum = components["schemas"]["StatusEnum"];

/** Kind of growing or infrastructure object a facility represents. */
export type FacilityType = components["schemas"]["FacilityType"];

/** Aspect of a facility a control zone measures or controls. */
export type ZoneType = components["schemas"]["ZoneType"];

/** Role a point plays in the system. */
export type PointKind = components["schemas"]["PointKind"];

/** Part a point plays inside the zone it is assigned to. */
export type ZonePointRole = components["schemas"]["ZonePointRole"];

/**
 * The paginated envelope every collection endpoint returns.
 *
 * The envelope's own fields are taken from the generated contract, so `total`,
 * `limit` and `offset` cannot drift; only the item type is made generic.
 */
export type Page<T> = Omit<components["schemas"]["Page_SiteRead_"], "items"> & {
  readonly items: readonly T[];
};

/** The largest page the collection endpoints accept, from their `limit` schema. */
export const MAX_PAGE_LIMIT = 200;
