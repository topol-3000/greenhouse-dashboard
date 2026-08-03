/**
 * The topology and monitoring slices of the backend's published contract.
 *
 * Every type here is an alias of a schema in [`openapi.json`](../../openapi.json),
 * re-exported through the generated `schema.ts` rather than re-typed by hand.
 * That is deliberate: a field renamed in the backend's contract becomes a
 * TypeScript error here instead of `undefined` on a screen. Run
 * `npm run generate:api-types` after refreshing `openapi.json`.
 *
 * ## Topology operations
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
 * ## Monitoring operations
 *
 * | Purpose                                | Operation                                             | Response schema                  |
 * | -------------------------------------- | ----------------------------------------------------- | -------------------------------- |
 * | Zone membership, point metadata, state | `GET /api/v1/facilities/{facility_id}/configuration`   | `FacilityConfigurationRead`      |
 * | One point's telemetry history          | `GET /api/v1/points/{point_id}/telemetry?limit=`       | `TelemetryHistoryRead`           |
 *
 * ### Why the configuration document is the monitoring source
 *
 * The configuration document is the only published operation that answers, in
 * one request, all three questions the monitoring section asks: which points a
 * control zone contains (`ConfigurationZone.points`), what each point *is*
 * (`ConfigurationPoint.point_kind`, `data_type`, `unit`, `status`) and what it
 * last read (`ConfigurationPoint.state`). Its own description says it is
 * assembled from a fixed number of queries.
 *
 * The alternative — `GET /api/v1/control-zones/{zone_id}/points` followed by
 * `GET /api/v1/points/{point_id}/state` per point — costs one request per
 * measurement point per poll, and `ZonePointAssignmentRead` still does not
 * publish the point's `status`, so archived points could not be recognised
 * without a further request each. The configuration document leaves archived
 * zones and points out by default, and the portal does not ask for them.
 *
 * What that costs, stated rather than hidden: `ConfigurationPointState` carries
 * `value`, `quality` and `observed_at` only. `received_at` and `revision` exist
 * on `PointStateRead` alone, and the portal does not spend one request per
 * point per poll to fetch them. Telemetry samples publish both timestamps, so
 * `received_at` is shown where the contract already supplies it — in history.
 *
 * ### What the telemetry contract does and does not promise
 *
 * `GET /api/v1/points/{point_id}/telemetry` takes `from`, `to` and a `limit`
 * capped at 1000, and answers `TelemetryHistoryRead`: an `items` array and
 * nothing else. There is no `total`, no cursor, no page number, and the
 * operation does not document the order of `items` or which samples a `limit`
 * keeps when more match. Three rules follow, and the screens obey them:
 *
 * - the response is a *bounded window*, never "the history" and never "the
 *   latest N";
 * - the portal sorts by `observed_at` itself rather than trusting arrival
 *   order;
 * - completeness is never claimed, because no field in the response could
 *   support the claim.
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
 * `GET /api/v1/points/{point_id}/state`, and every control-plane operation the
 * contract publishes: commands, control loops, gateways, the edge surface and
 * every `POST`, `PATCH` and `DELETE`. The portal is a reader.
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

/** Type of the values a point carries: `float`, `integer`, `boolean`, `string`. */
export type PointDataType = components["schemas"]["PointDataType"];

/** Trustworthiness the backend attaches to a value it published. */
export type DataQuality = components["schemas"]["DataQuality"];

/** A facility, its site, its zones and its points with their last known state. */
export type FacilityConfigurationRead = components["schemas"]["FacilityConfigurationRead"];

/** One control zone inside the configuration document, with its composition. */
export type ConfigurationZone = components["schemas"]["ConfigurationZone"];

/** One zone-to-point link inside the configuration document. */
export type ConfigurationZonePoint = components["schemas"]["ConfigurationZonePoint"];

/** One point of the configuration document, described once with its state. */
export type ConfigurationPoint = components["schemas"]["ConfigurationPoint"];

/** The last known state of a point, as the configuration document carries it. */
export type ConfigurationPointState = components["schemas"]["ConfigurationPointState"];

/** A count-free collection of telemetry samples: `items`, and nothing else. */
export type TelemetryHistoryRead = components["schemas"]["TelemetryHistoryRead"];

/** One stored measurement, returned unchanged by the history operation. */
export type TelemetrySampleRead = components["schemas"]["TelemetrySampleRead"];

/**
 * `point_kind` of a point the customer reads rather than drives.
 *
 * Monitoring is built from this field and no other. A point is never classified
 * by its name, its code or its `metric_type`: `control`, `status` and `derived`
 * points are not measurements however they are labelled.
 */
export const MEASUREMENT_POINT_KIND: PointKind = "measurement";

/** `status` of a resource that is in use rather than archived. */
export const ACTIVE_STATUS: StatusEnum = "active";

/** `quality` a point carries until telemetry writes to its state projection. */
export const NO_DATA_QUALITY: DataQuality = "no_data";

/**
 * The `data_type` values whose measurements can be placed on a numeric axis.
 *
 * `boolean` and `string` points are deliberately absent: plotting `false` as
 * `0` would invent a reading the backend never published.
 */
export const NUMERIC_DATA_TYPES: readonly PointDataType[] = ["float", "integer"];

/** The largest telemetry window one request may ask for, from its `limit` schema. */
export const MAX_TELEMETRY_LIMIT = 1000;

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
