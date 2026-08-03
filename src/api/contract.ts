/**
 * The topology, monitoring and manual-control slices of the published contract.
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
 * ## Manual control operations
 *
 * | Purpose                                | Operation                                             | Schema                           |
 * | -------------------------------------- | ----------------------------------------------------- | -------------------------------- |
 * | Controllable points and reported state | `GET /api/v1/facilities/{facility_id}/configuration`   | `FacilityConfigurationRead`      |
 * | Create one manual command              | `POST /api/v1/commands`                                | `ManualCommandCreate` → `ManualCommandAcceptanceRead` |
 * | Read one command's lifecycle           | `GET /api/v1/commands/{command_id}`                    | `CommandRead`                    |
 * | Resolve a lost creation response       | `GET /api/v1/commands?idempotency_key=&limit=1`        | `CommandListRead`                |
 *
 * ### How a controllable point is identified
 *
 * `POST /api/v1/commands` states its own precondition: the target "has to be an
 * active boolean control point that is assigned to the named zone in the
 * `control_output` role and names a reported status point". Every clause of that
 * is an explicit field of the configuration document, and the portal checks all
 * five before it offers an action:
 *
 * - `ConfigurationPoint.point_kind === "control"`;
 * - `ConfigurationPoint.status === "active"`;
 * - `ConfigurationPoint.data_type === "boolean"`, which is what makes
 *   `ManualCommandCreate.desired_value` — a strict `bool` — a valid request for
 *   this target;
 * - `ConfigurationZonePoint.role === "control_output"` on the link between the
 *   zone in the address and the point;
 * - `ConfigurationPoint.reported_point_id !== null`.
 *
 * No point is classified by its name, its code, its `metric_type` or its
 * position in a list, and a point that fails any clause is offered no action.
 *
 * ### How reported state is related to a control point
 *
 * `ConfigurationPoint.reported_point_id` is the contract's one statement of that
 * relationship, and its own description says why it is in the document: "a
 * client deciding whether a control point can be commanded needs the point that
 * reports it back, and needs it before any command exists". The portal reads the
 * reported point out of the same document by that identifier. Points are never
 * paired by a similar name, a matching unit or a shared position.
 *
 * ### Desired, reported and command state
 *
 * The contract keeps these three apart and so does the portal.
 *
 * `ManualCommandCreate.desired_value` and `CommandRead.desired_value` are "a
 * request, never a reading" in the contract's own words. `CommandState` is the
 * *delivery* lifecycle: `pending` is the only non-terminal state, `applied` and
 * `rejected` are terminal, and `acknowledged_at` on a pending command "means the
 * Edge received it, not that anything moved". What the actuator actually reports
 * is the reported point's own state. A `201`, a `200` or an `applied` command is
 * therefore never rendered as a reading, and the reported state is never
 * overwritten with what was asked for.
 *
 * ### Idempotency
 *
 * The `Idempotency-Key` header is required and is a UUID the client supplies.
 * The contract defines the replay rules exactly: the same key with the same
 * `control_zone_id`, `target_point_id` and `desired_value` answers `200` with
 * `outcome: "existing"` and writes nothing; the same key with a different one
 * answers `409 idempotency_key_conflict`; and the server never replaces a
 * supplied key. That is what makes a retry of a lost request safe, and
 * `GET /api/v1/commands?idempotency_key=` is the documented way to find out
 * whether a submission whose response was lost exists — "the key is unique, so
 * the answer carries zero or one command".
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
 * `GET /api/v1/points/{point_id}/state` — the configuration document already
 * carries every point's last known state, including the reported points, and one
 * request per actuator per poll would buy only `received_at` and `revision`.
 *
 * The Cloud ↔ Edge surface — `GET /api/v1/edge/gateways/{gateway_id}/commands`,
 * `PUT .../acknowledgement` and `POST /api/v1/edge/telemetry` — is for gateways
 * and is never called from a browser. Control loops, gateways, provisioning and
 * every other `POST`, `PATCH` and `DELETE` are equally out of scope: the one
 * write this portal makes is a manual command.
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

/** The body `POST /api/v1/commands` accepts: a zone, a point and a boolean. */
export type ManualCommandCreate = components["schemas"]["ManualCommandCreate"];

/** The answer to one idempotent manual request: the outcome and the command. */
export type ManualCommandAcceptanceRead = components["schemas"]["ManualCommandAcceptanceRead"];

/** Whether an idempotent manual request created or replayed a command. */
export type ManualCommandOutcome = components["schemas"]["ManualCommandOutcome"];

/** One command, with every identifier and timestamp it is followed by. */
export type CommandRead = components["schemas"]["CommandRead"];

/** A count-free collection of commands: `items`, and nothing else. */
export type CommandListRead = components["schemas"]["CommandListRead"];

/** Delivery lifecycle of a command: `pending`, `applied` or `rejected`. */
export type CommandState = components["schemas"]["CommandState"];

/** Who asked for a command: `control_loop` or `manual`. */
export type CommandSource = components["schemas"]["CommandSource"];

/** The stable code and readable message of a terminal failure. */
export type CommandRejectionReason = components["schemas"]["CommandRejectionReason"];

/**
 * `point_kind` of a point the customer reads rather than drives.
 *
 * Monitoring is built from this field and no other. A point is never classified
 * by its name, its code or its `metric_type`: `control`, `status` and `derived`
 * points are not measurements however they are labelled.
 */
export const MEASUREMENT_POINT_KIND: PointKind = "measurement";

/**
 * `point_kind` of a point the customer may drive.
 *
 * This field, and no other, is what makes a point a candidate for manual
 * control. It is a necessary condition and not a sufficient one — see
 * {@link CONTROL_OUTPUT_ROLE} and {@link BOOLEAN_DATA_TYPE}.
 */
export const CONTROL_POINT_KIND: PointKind = "control";

/**
 * The zone link role a manual command's target must carry.
 *
 * `POST /api/v1/commands` requires the target to be assigned to the named zone
 * "in the `control_output` role". A control point assigned as a
 * `safety_interlock` or a `derived_indicator` is therefore not a manual target
 * of that zone, whatever its `point_kind` says.
 */
export const CONTROL_OUTPUT_ROLE: ZonePointRole = "control_output";

/**
 * The one `data_type` a manual command can express.
 *
 * `ManualCommandCreate.desired_value` is a strict `bool`: the contract refuses
 * `1`, `"on"` and `"true"` rather than coercing them, and publishes no numeric,
 * enumerated or free-form command shape at all. A control point of any other
 * data type has no action the contract can prove, and is offered none.
 */
export const BOOLEAN_DATA_TYPE: PointDataType = "boolean";

/** The one non-terminal command state. */
export const PENDING_COMMAND_STATE: CommandState = "pending";

/** Terminal success: the Edge reported the command applied. */
export const APPLIED_COMMAND_STATE: CommandState = "applied";

/** Terminal failure: the Edge rejected the command. */
export const REJECTED_COMMAND_STATE: CommandState = "rejected";

/**
 * The command states that are reached once and never left.
 *
 * From `CommandState`'s own description: "`PENDING` is the only non-terminal
 * state […] `APPLIED` is terminal success and `REJECTED` is terminal failure;
 * both are reached exactly once […] and never left again."
 */
export const TERMINAL_COMMAND_STATES: readonly CommandState[] = [
  APPLIED_COMMAND_STATE,
  REJECTED_COMMAND_STATE,
];

/** `source` of a command a customer asked for rather than a control loop. */
export const MANUAL_COMMAND_SOURCE: CommandSource = "manual";

/** The header `POST /api/v1/commands` requires, spelled as the contract does. */
export const IDEMPOTENCY_KEY_HEADER = "Idempotency-Key";

/** `error.code` the contract names for a key reused with a different request. */
export const IDEMPOTENCY_KEY_CONFLICT_CODE = "idempotency_key_conflict";

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
