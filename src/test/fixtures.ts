/**
 * Contract-valid topology and monitoring data for the test suite.
 *
 * Every object here is shaped by a schema in `openapi.json` —  `SiteRead`,
 * `FacilityRead`, `ControlZoneRead`, `ZonePointAssignmentRead`,
 * `FacilityConfigurationRead`, `TelemetrySampleRead` — and every paginated
 * collection is wrapped in the `Page` envelope the collection endpoints
 * publish, with a real `total`, `limit` and `offset`.
 *
 * This file is test support and nothing else. It is not imported by any
 * production module, there is no demo mode behind it, and the portal has no
 * path that falls back to it: a request that is not answered by the backend is
 * an error state on screen, never one of these objects.
 *
 * The default dataset is deliberately awkward on purpose. It has two sites, one
 * of which has no facilities; a facility with two control zones and a facility
 * with none; and a control zone belonging to a facility other than the one a
 * misleading URL might name. A portal that quietly assumes "one greenhouse"
 * fails against it.
 *
 * Its points are awkward on purpose too. The climate zone holds four
 * measurement points and several that are not measurements, one of which is
 * named so that any portal classifying points by their name would show it as
 * one. Of the measurements, one reads a real `0`, one reads `false`, one has
 * never reported at all, and one carries no unit — so "missing", "zero" and "no
 * unit" cannot be rendered the same way and pass.
 *
 * Its control points are awkward in the same spirit. Two of them satisfy every
 * clause of the manual command operation's precondition, so no portal can pass
 * by picking the first one it finds. The rest each fail exactly one clause — a
 * `float` data type, an archived status, no `reported_point_id`, and a control
 * point assigned as a `safety_interlock` rather than a `control_output` — so a
 * portal that checks four of the five clauses fails here rather than in a
 * customer's greenhouse. One status point is named "North lamp power switch",
 * which is what a portal matching on names would offer as an actuator.
 */

import type {
  CommandRead,
  ConfigurationPoint,
  ControlZoneRead,
  FacilityConfigurationRead,
  FacilityRead,
  Page,
  SiteRead,
  TelemetrySampleRead,
  ZonePointAssignmentRead,
} from "../api/contract";
import { TELEMETRY_HISTORY_LIMIT } from "../api/queries";
import type { Router } from "./harness";

/** The URL the portal builds for the backend's health endpoint. */
export const HEALTH_URL = "/health";

/** A healthy answer from the backend's published `HealthResponse`. */
export const HEALTHY_BODY = { status: "ok", service: "greenhouse", database: "ok" } as const;

/** Identifiers are UUIDs in the contract, so the fixtures use real ones. */
export const IDS = {
  riversideSite: "6f1c9f3a-6b1e-4f27-9b6d-5f2b1c9d0001",
  harbourSite: "6f1c9f3a-6b1e-4f27-9b6d-5f2b1c9d0002",
  northGreenhouse: "8a2d0e4b-7c2f-4a38-8c7e-6a3c2d0e0001",
  seedlingRoom: "8a2d0e4b-7c2f-4a38-8c7e-6a3c2d0e0002",
  climateZone: "9b3e1f5c-8d30-4b49-9d8f-7b4d3e1f0001",
  irrigationZone: "9b3e1f5c-8d30-4b49-9d8f-7b4d3e1f0002",
  seedlingClimateZone: "9b3e1f5c-8d30-4b49-9d8f-7b4d3e1f0003",
  unknownFacility: "00000000-0000-4000-8000-000000000404",
  unknownZone: "00000000-0000-4000-8000-000000000405",
} as const;

const T0 = "2026-01-04T09:00:00Z";

export const riversideSite: SiteRead = {
  id: IDS.riversideSite,
  name: "Riverside Growing Site",
  code: "riverside",
  timezone: "Europe/Kyiv",
  status: "active",
  created_at: T0,
  updated_at: T0,
};

export const harbourSite: SiteRead = {
  id: IDS.harbourSite,
  name: "Harbour Research Site",
  code: "harbour",
  timezone: "Europe/Amsterdam",
  status: "active",
  created_at: T0,
  updated_at: T0,
};

export const northGreenhouse: FacilityRead = {
  id: IDS.northGreenhouse,
  site_id: IDS.riversideSite,
  name: "North Greenhouse",
  code: "north-gh",
  facility_type: "greenhouse",
  status: "active",
  created_at: T0,
  updated_at: T0,
};

export const seedlingRoom: FacilityRead = {
  id: IDS.seedlingRoom,
  site_id: IDS.riversideSite,
  name: "Seedling Room",
  code: "seedling-1",
  facility_type: "seedling_room",
  status: "active",
  created_at: T0,
  updated_at: T0,
};

export const climateZone: ControlZoneRead = {
  id: IDS.climateZone,
  facility_id: IDS.northGreenhouse,
  name: "North Climate",
  code: "north-climate",
  zone_type: "climate",
  status: "active",
  created_at: T0,
  updated_at: T0,
};

export const irrigationZone: ControlZoneRead = {
  id: IDS.irrigationZone,
  facility_id: IDS.northGreenhouse,
  name: "North Irrigation",
  code: "north-irrigation",
  zone_type: "irrigation",
  status: "active",
  created_at: T0,
  updated_at: T0,
};

/** A zone of the Seedling Room, used to prove it cannot be shown elsewhere. */
export const seedlingClimateZone: ControlZoneRead = {
  id: IDS.seedlingClimateZone,
  facility_id: IDS.seedlingRoom,
  name: "Seedling Climate",
  code: "seedling-climate",
  zone_type: "climate",
  status: "active",
  created_at: T0,
  updated_at: T0,
};

/** Point identifiers, shared by the composition and the configuration document. */
export const POINT_IDS = {
  airTemp: "bb000000-0000-4000-8000-000000000001",
  vent: "bb000000-0000-4000-8000-000000000002",
  co2: "bb000000-0000-4000-8000-000000000003",
  soilMoisture: "bb000000-0000-4000-8000-000000000004",
  humiditySensorStatus: "bb000000-0000-4000-8000-000000000005",
  leafWetness: "bb000000-0000-4000-8000-000000000006",
  archivedTemp: "bb000000-0000-4000-8000-000000000007",
  ventStatus: "bb000000-0000-4000-8000-000000000008",
  lamp: "bb000000-0000-4000-8000-000000000009",
  lampStatus: "bb000000-0000-4000-8000-00000000000a",
  dimmer: "bb000000-0000-4000-8000-00000000000b",
  archivedPump: "bb000000-0000-4000-8000-00000000000c",
  pumpStatus: "bb000000-0000-4000-8000-00000000000d",
  heater: "bb000000-0000-4000-8000-00000000000e",
  interlock: "bb000000-0000-4000-8000-00000000000f",
  interlockStatus: "bb000000-0000-4000-8000-000000000010",
} as const;

export const climateZonePoints: readonly ZonePointAssignmentRead[] = [
  {
    id: "aa000000-0000-4000-8000-000000000001",
    control_zone_id: IDS.climateZone,
    point_id: POINT_IDS.airTemp,
    role: "primary_measurement",
    created_at: T0,
    point_code: "north-air-temp",
    point_name: "North air temperature",
    point_kind: "measurement",
    data_type: "float",
    unit: "degC",
    reported_point_id: null,
  },
  {
    id: "aa000000-0000-4000-8000-000000000002",
    control_zone_id: IDS.climateZone,
    point_id: POINT_IDS.vent,
    role: "control_output",
    created_at: T0,
    point_code: "north-vent",
    // Named to look like a measurement. It is a `control` point, and only
    // `point_kind` decides.
    point_name: "North air temperature vent",
    point_kind: "control",
    data_type: "boolean",
    unit: null,
    reported_point_id: POINT_IDS.ventStatus,
  },
  {
    id: "aa000000-0000-4000-8000-000000000003",
    control_zone_id: IDS.climateZone,
    point_id: POINT_IDS.co2,
    role: "secondary_measurement",
    created_at: T0,
    point_code: "north-co2",
    point_name: "North CO2",
    point_kind: "measurement",
    data_type: "integer",
    unit: "ppm",
    reported_point_id: null,
  },
  {
    id: "aa000000-0000-4000-8000-000000000004",
    control_zone_id: IDS.climateZone,
    point_id: POINT_IDS.soilMoisture,
    role: "secondary_measurement",
    created_at: T0,
    point_code: "north-soil-moisture",
    point_name: "North soil moisture",
    point_kind: "measurement",
    data_type: "float",
    unit: null,
    reported_point_id: null,
  },
  {
    id: "aa000000-0000-4000-8000-000000000005",
    control_zone_id: IDS.climateZone,
    point_id: POINT_IDS.humiditySensorStatus,
    role: "status_feedback",
    created_at: T0,
    point_code: "north-humidity-sensor-state",
    point_name: "North humidity sensor",
    point_kind: "status",
    data_type: "string",
    unit: null,
    reported_point_id: null,
  },
  {
    id: "aa000000-0000-4000-8000-000000000006",
    control_zone_id: IDS.climateZone,
    point_id: POINT_IDS.leafWetness,
    role: "secondary_measurement",
    created_at: T0,
    point_code: "north-leaf-wetness",
    point_name: "North leaf wetness",
    point_kind: "measurement",
    data_type: "boolean",
    unit: null,
    reported_point_id: null,
  },
  {
    id: "aa000000-0000-4000-8000-000000000007",
    control_zone_id: IDS.climateZone,
    point_id: POINT_IDS.ventStatus,
    role: "status_feedback",
    created_at: T0,
    point_code: "north-vent-status",
    point_name: "North vent status",
    point_kind: "status",
    data_type: "boolean",
    unit: null,
    reported_point_id: null,
  },
  {
    id: "aa000000-0000-4000-8000-000000000008",
    control_zone_id: IDS.climateZone,
    point_id: POINT_IDS.lamp,
    role: "control_output",
    created_at: T0,
    point_code: "north-lamp",
    point_name: "North lamp",
    point_kind: "control",
    data_type: "boolean",
    unit: null,
    reported_point_id: POINT_IDS.lampStatus,
  },
  {
    id: "aa000000-0000-4000-8000-000000000009",
    control_zone_id: IDS.climateZone,
    point_id: POINT_IDS.lampStatus,
    // Named exactly like the actuator a name-matching portal would offer. It is
    // a `status` point, so it is never a command target.
    role: "status_feedback",
    created_at: T0,
    point_code: "north-lamp-power-switch",
    point_name: "North lamp power switch",
    point_kind: "status",
    data_type: "boolean",
    unit: null,
    reported_point_id: null,
  },
  {
    id: "aa000000-0000-4000-8000-00000000000a",
    control_zone_id: IDS.climateZone,
    point_id: POINT_IDS.dimmer,
    role: "control_output",
    created_at: T0,
    point_code: "north-vent-dimmer",
    point_name: "North vent dimmer",
    point_kind: "control",
    // The command boundary accepts a strict `bool` and nothing else, so this
    // point has no action the contract can express.
    data_type: "float",
    unit: "%",
    reported_point_id: POINT_IDS.ventStatus,
  },
  {
    id: "aa000000-0000-4000-8000-00000000000b",
    control_zone_id: IDS.climateZone,
    point_id: POINT_IDS.archivedPump,
    role: "control_output",
    created_at: T0,
    point_code: "north-pump",
    point_name: "North circulation pump",
    point_kind: "control",
    data_type: "boolean",
    unit: null,
    reported_point_id: POINT_IDS.pumpStatus,
  },
  {
    id: "aa000000-0000-4000-8000-00000000000c",
    control_zone_id: IDS.climateZone,
    point_id: POINT_IDS.pumpStatus,
    role: "status_feedback",
    created_at: T0,
    point_code: "north-pump-status",
    point_name: "North circulation pump status",
    point_kind: "status",
    data_type: "boolean",
    unit: null,
    reported_point_id: null,
  },
  {
    id: "aa000000-0000-4000-8000-00000000000d",
    control_zone_id: IDS.climateZone,
    point_id: POINT_IDS.heater,
    role: "control_output",
    created_at: T0,
    point_code: "north-heater",
    point_name: "North heater",
    point_kind: "control",
    data_type: "boolean",
    unit: null,
    // No point reports it back, which the creation operation requires.
    reported_point_id: null,
  },
  {
    id: "aa000000-0000-4000-8000-00000000000e",
    control_zone_id: IDS.climateZone,
    point_id: POINT_IDS.interlock,
    // A commandable-looking control point that this zone does not assign as a
    // `control_output`. The role belongs to the link, so it is not a manual
    // target of this zone.
    role: "safety_interlock",
    created_at: T0,
    point_code: "north-frost-interlock",
    point_name: "North frost interlock",
    point_kind: "control",
    data_type: "boolean",
    unit: null,
    reported_point_id: POINT_IDS.interlockStatus,
  },
  {
    id: "aa000000-0000-4000-8000-00000000000f",
    control_zone_id: IDS.climateZone,
    point_id: POINT_IDS.interlockStatus,
    role: "status_feedback",
    created_at: T0,
    point_code: "north-frost-interlock-status",
    point_name: "North frost interlock status",
    point_kind: "status",
    data_type: "boolean",
    unit: null,
    reported_point_id: null,
  },
];

/**
 * The points of the North Greenhouse's configuration document.
 *
 * `ConfigurationPoint` is the schema that carries `status` and `state`, which
 * `ZonePointAssignmentRead` does not, so the monitoring rules are exercised
 * here: a real zero, a `false`, a point that has never reported, a point with
 * no unit, and two points that are not measurements and must never be shown as
 * one however they are named.
 */
export const northConfigurationPoints: readonly ConfigurationPoint[] = [
  {
    id: POINT_IDS.airTemp,
    code: "north-air-temp",
    name: "North air temperature",
    point_kind: "measurement",
    metric_type: "air_temperature",
    data_type: "float",
    unit: "degC",
    reported_point_id: null,
    status: "active",
    state: { value: 21.4, quality: "good", observed_at: "2026-01-04T09:05:00Z" },
  },
  {
    id: POINT_IDS.vent,
    code: "north-vent",
    name: "North air temperature vent",
    point_kind: "control",
    metric_type: "vent_position",
    data_type: "boolean",
    unit: null,
    reported_point_id: POINT_IDS.ventStatus,
    status: "active",
    // The control point's own projection. It is neither a desired state nor a
    // reported one in the contract, and the portal renders it as neither.
    state: { value: true, quality: "good", observed_at: "2026-01-04T09:05:00Z" },
  },
  {
    id: POINT_IDS.co2,
    code: "north-co2",
    name: "North CO2",
    point_kind: "measurement",
    metric_type: "co2",
    data_type: "integer",
    unit: "ppm",
    reported_point_id: null,
    // A measured zero, which is a reading and not an absence.
    status: "active",
    state: { value: 0, quality: "uncertain", observed_at: "2026-01-04T09:04:00Z" },
  },
  {
    id: POINT_IDS.soilMoisture,
    code: "north-soil-moisture",
    name: "North soil moisture",
    point_kind: "measurement",
    metric_type: "soil_moisture",
    data_type: "float",
    // The API published no unit for this point, and the portal invents none.
    unit: null,
    reported_point_id: null,
    status: "active",
    // Never reported: the empty projection every point starts with.
    state: { value: null, quality: "no_data", observed_at: null },
  },
  {
    id: POINT_IDS.humiditySensorStatus,
    code: "north-humidity-sensor-state",
    name: "North humidity sensor",
    point_kind: "status",
    metric_type: "sensor_state",
    data_type: "string",
    unit: null,
    reported_point_id: null,
    status: "active",
    state: { value: "online", quality: "good", observed_at: "2026-01-04T09:05:00Z" },
  },
  {
    id: POINT_IDS.leafWetness,
    code: "north-leaf-wetness",
    name: "North leaf wetness",
    point_kind: "measurement",
    metric_type: "leaf_wetness",
    data_type: "boolean",
    unit: null,
    reported_point_id: null,
    status: "active",
    // `false` is a reading. It must not render as "No data yet".
    state: { value: false, quality: "good", observed_at: "2026-01-04T09:03:00Z" },
  },
  {
    id: POINT_IDS.ventStatus,
    code: "north-vent-status",
    name: "North vent status",
    point_kind: "status",
    metric_type: "vent_state",
    data_type: "boolean",
    unit: null,
    reported_point_id: null,
    status: "active",
    // `false` is what the greenhouse reports, not an absence of a report.
    state: { value: false, quality: "good", observed_at: "2026-01-04T09:05:00Z" },
  },
  {
    id: POINT_IDS.lamp,
    code: "north-lamp",
    name: "North lamp",
    point_kind: "control",
    metric_type: "lamp_state",
    data_type: "boolean",
    unit: null,
    reported_point_id: POINT_IDS.lampStatus,
    status: "active",
    state: { value: null, quality: "no_data", observed_at: null },
  },
  {
    id: POINT_IDS.lampStatus,
    code: "north-lamp-power-switch",
    name: "North lamp power switch",
    point_kind: "status",
    metric_type: "lamp_state",
    data_type: "boolean",
    unit: null,
    reported_point_id: null,
    status: "active",
    // Nothing has reported yet: "No reported state yet", and never a `false`
    // the greenhouse did not send.
    state: { value: null, quality: "no_data", observed_at: null },
  },
  {
    id: POINT_IDS.dimmer,
    code: "north-vent-dimmer",
    name: "North vent dimmer",
    point_kind: "control",
    metric_type: "vent_position",
    data_type: "float",
    unit: "%",
    reported_point_id: POINT_IDS.ventStatus,
    status: "active",
    state: { value: 40, quality: "good", observed_at: "2026-01-04T09:05:00Z" },
  },
  {
    id: POINT_IDS.archivedPump,
    code: "north-pump",
    name: "North circulation pump",
    point_kind: "control",
    metric_type: "pump_state",
    data_type: "boolean",
    unit: null,
    reported_point_id: POINT_IDS.pumpStatus,
    // The document leaves archived points out by default. The portal does not
    // rely on that: `status` is published, so it is checked.
    status: "archived",
    state: { value: false, quality: "stale", observed_at: "2026-01-03T09:05:00Z" },
  },
  {
    id: POINT_IDS.pumpStatus,
    code: "north-pump-status",
    name: "North circulation pump status",
    point_kind: "status",
    metric_type: "pump_state",
    data_type: "boolean",
    unit: null,
    reported_point_id: null,
    status: "active",
    state: { value: true, quality: "good", observed_at: "2026-01-04T09:05:00Z" },
  },
  {
    id: POINT_IDS.heater,
    code: "north-heater",
    name: "North heater",
    point_kind: "control",
    metric_type: "heater_state",
    data_type: "boolean",
    unit: null,
    // No feedback configured, which the creation operation requires.
    reported_point_id: null,
    status: "active",
    state: { value: false, quality: "good", observed_at: "2026-01-04T09:05:00Z" },
  },
  {
    id: POINT_IDS.interlock,
    code: "north-frost-interlock",
    name: "North frost interlock",
    point_kind: "control",
    metric_type: "interlock_state",
    data_type: "boolean",
    unit: null,
    reported_point_id: POINT_IDS.interlockStatus,
    status: "active",
    state: { value: false, quality: "good", observed_at: "2026-01-04T09:05:00Z" },
  },
  {
    id: POINT_IDS.interlockStatus,
    code: "north-frost-interlock-status",
    name: "North frost interlock status",
    point_kind: "status",
    metric_type: "interlock_state",
    data_type: "boolean",
    unit: null,
    reported_point_id: null,
    status: "active",
    state: { value: false, quality: "good", observed_at: "2026-01-04T09:05:00Z" },
  },
];

/** Wrap items in the contract's `Page` envelope for a single complete page. */
export function page<T>(items: readonly T[], limit = 200, offset = 0): Page<T> {
  return { items, total: items.length, limit, offset };
}

/**
 * The North Greenhouse's configuration document.
 *
 * The zone refers to its points by identifier, and each point is described once
 * in the document's own `points` list — exactly as `FacilityConfigurationRead`
 * publishes it. The irrigation zone is present with no points at all, which is
 * the successful "this zone has no measurements" case rather than an error.
 */
export const northConfiguration: FacilityConfigurationRead = {
  facility: {
    id: northGreenhouse.id,
    name: northGreenhouse.name,
    code: northGreenhouse.code,
    facility_type: northGreenhouse.facility_type,
    status: northGreenhouse.status,
  },
  site: {
    id: riversideSite.id,
    name: riversideSite.name,
    code: riversideSite.code,
    timezone: riversideSite.timezone,
  },
  control_zones: [
    {
      id: climateZone.id,
      name: climateZone.name,
      code: climateZone.code,
      zone_type: climateZone.zone_type,
      status: climateZone.status,
      points: climateZonePoints.map((assignment) => ({
        point_id: assignment.point_id,
        code: assignment.point_code,
        role: assignment.role,
      })),
    },
    {
      id: irrigationZone.id,
      name: irrigationZone.name,
      code: irrigationZone.code,
      zone_type: irrigationZone.zone_type,
      status: irrigationZone.status,
      points: [],
    },
  ],
  points: [...northConfigurationPoints],
};

/** The Seedling Room's configuration document, with one empty zone. */
export const seedlingConfiguration: FacilityConfigurationRead = {
  facility: {
    id: seedlingRoom.id,
    name: seedlingRoom.name,
    code: seedlingRoom.code,
    facility_type: seedlingRoom.facility_type,
    status: seedlingRoom.status,
  },
  site: {
    id: riversideSite.id,
    name: riversideSite.name,
    code: riversideSite.code,
    timezone: riversideSite.timezone,
  },
  control_zones: [
    {
      id: seedlingClimateZone.id,
      name: seedlingClimateZone.name,
      code: seedlingClimateZone.code,
      zone_type: seedlingClimateZone.zone_type,
      status: seedlingClimateZone.status,
      points: [],
    },
  ],
  points: [],
};

/** Build one `TelemetrySampleRead`. */
export function telemetrySample(
  overrides: Partial<TelemetrySampleRead> & Pick<TelemetrySampleRead, "id" | "point_id">,
): TelemetrySampleRead {
  return {
    value: 0,
    unit: null,
    observed_at: T0,
    received_at: T0,
    quality: "good",
    ...overrides,
  };
}

/**
 * The air temperature history, returned deliberately out of order.
 *
 * The telemetry operation documents no ordering, so the portal must not depend
 * on one. A fixture that arrived sorted would let a client that trusts arrival
 * order pass.
 */
export const airTemperatureHistory: readonly TelemetrySampleRead[] = [
  telemetrySample({
    id: "cc000000-0000-4000-8000-000000000002",
    point_id: POINT_IDS.airTemp,
    value: 21.4,
    unit: "degC",
    observed_at: "2026-01-04T09:05:00Z",
    received_at: "2026-01-04T09:05:04Z",
  }),
  telemetrySample({
    id: "cc000000-0000-4000-8000-000000000001",
    point_id: POINT_IDS.airTemp,
    value: 20.1,
    unit: "degC",
    observed_at: "2026-01-04T09:00:00Z",
    received_at: "2026-01-04T09:00:03Z",
  }),
  telemetrySample({
    id: "cc000000-0000-4000-8000-000000000003",
    point_id: POINT_IDS.airTemp,
    value: 22.9,
    unit: "degC",
    observed_at: "2026-01-04T09:10:00Z",
    received_at: "2026-01-04T09:10:02Z",
    quality: "uncertain",
  }),
];

/** The CO2 history, whose readings include a real zero. */
export const co2History: readonly TelemetrySampleRead[] = [
  telemetrySample({
    id: "cd000000-0000-4000-8000-000000000001",
    point_id: POINT_IDS.co2,
    value: 412,
    unit: "ppm",
    observed_at: "2026-01-04T09:00:00Z",
    received_at: "2026-01-04T09:00:01Z",
  }),
  telemetrySample({
    id: "cd000000-0000-4000-8000-000000000002",
    point_id: POINT_IDS.co2,
    value: 0,
    unit: "ppm",
    observed_at: "2026-01-04T09:04:00Z",
    received_at: "2026-01-04T09:04:01Z",
  }),
];

/** The leaf wetness history: contract-valid booleans, and no numeric axis. */
export const leafWetnessHistory: readonly TelemetrySampleRead[] = [
  telemetrySample({
    id: "ce000000-0000-4000-8000-000000000001",
    point_id: POINT_IDS.leafWetness,
    value: false,
    observed_at: "2026-01-04T09:00:00Z",
    received_at: "2026-01-04T09:00:01Z",
  }),
  telemetrySample({
    id: "ce000000-0000-4000-8000-000000000002",
    point_id: POINT_IDS.leafWetness,
    value: true,
    observed_at: "2026-01-04T09:03:00Z",
    received_at: "2026-01-04T09:03:01Z",
  }),
];

/** Command identifiers, as the contract types them. */
export const COMMAND_IDS = {
  ventOn: "dd000000-0000-4000-8000-000000000001",
  lampOff: "dd000000-0000-4000-8000-000000000002",
} as const;

/** An idempotency key a test can send and assert on without generating one. */
export const IDEMPOTENCY_KEY = "ee000000-0000-4000-8000-000000000001";

/**
 * Build one `CommandRead`.
 *
 * The defaults describe the pending manual command the vent fixture produces:
 * a request that has been stored, has not been acknowledged, has not executed
 * and has no rejection. Every field the schema requires is present, so a portal
 * that reads one the contract does not publish fails here.
 */
export function manualCommand(overrides: Partial<CommandRead> = {}): CommandRead {
  return {
    id: COMMAND_IDS.ventOn,
    source: "manual",
    idempotency_key: IDEMPOTENCY_KEY,
    control_zone_id: IDS.climateZone,
    control_loop_id: null,
    trigger_sample_id: null,
    target_point_id: POINT_IDS.vent,
    reported_point_id: POINT_IDS.ventStatus,
    gateway_id: null,
    desired_value: true,
    state: "pending",
    result_control_sample_id: null,
    result_status_sample_id: null,
    issued_at: "2026-01-04T09:06:00Z",
    executed_at: null,
    acknowledged_at: null,
    rejection_reason: null,
    created_at: "2026-01-04T09:06:00Z",
    ...overrides,
  };
}

/** The `ManualCommandAcceptanceRead` envelope one creation answers with. */
export function commandAcceptance(
  command: CommandRead = manualCommand(),
  outcome: "created" | "existing" = "created",
) {
  return { outcome, command };
}

/** A topology and its monitoring data, as the fake backend will serve them. */
export interface Dataset {
  readonly sites: readonly SiteRead[];
  readonly facilities: readonly FacilityRead[];
  readonly zones: readonly ControlZoneRead[];
  readonly points: readonly ZonePointAssignmentRead[];
  /** Configuration documents, keyed by the facility they describe. */
  readonly configurations: readonly FacilityConfigurationRead[];
  /** Telemetry windows, keyed by point identifier. */
  readonly telemetry: Readonly<Record<string, readonly TelemetrySampleRead[]>>;
}

/** Two sites, two facilities, three zones — and one site with nothing in it. */
export const DEFAULT_DATASET: Dataset = {
  sites: [riversideSite, harbourSite],
  facilities: [northGreenhouse, seedlingRoom],
  zones: [climateZone, irrigationZone, seedlingClimateZone],
  points: climateZonePoints,
  configurations: [northConfiguration, seedlingConfiguration],
  telemetry: {
    [POINT_IDS.airTemp]: airTemperatureHistory,
    [POINT_IDS.co2]: co2History,
    [POINT_IDS.leafWetness]: leafWetnessHistory,
    [POINT_IDS.soilMoisture]: [],
  },
};

/** A cloud API that has nothing provisioned at all. */
export const EMPTY_DATASET: Dataset = {
  sites: [],
  facilities: [],
  zones: [],
  points: [],
  configurations: [],
  telemetry: {},
};

const V1 = "/api/v1";

/** The URL the portal builds for one page of the site collection. */
export function sitesUrl(offset = 0): string {
  return `${V1}/sites?limit=200&offset=${String(offset)}`;
}

/** The URL the portal builds for one page of the facility collection. */
export function facilitiesUrl(offset = 0): string {
  return `${V1}/facilities?limit=200&offset=${String(offset)}`;
}

/** The URL the portal builds to resolve one site. */
export function siteUrl(id: string): string {
  return `${V1}/sites/${encodeURIComponent(id)}`;
}

/** The URL the portal builds to resolve one facility. */
export function facilityUrl(id: string): string {
  return `${V1}/facilities/${encodeURIComponent(id)}`;
}

/** The URL the portal builds for one facility's zones, filtered server-side. */
export function facilityZonesUrl(facilityId: string, offset = 0): string {
  return `${V1}/control-zones?limit=200&offset=${String(offset)}&facility_id=${encodeURIComponent(facilityId)}`;
}

/** The URL the portal builds to resolve one control zone. */
export function controlZoneUrl(id: string): string {
  return `${V1}/control-zones/${encodeURIComponent(id)}`;
}

/** The URL the portal builds for one zone's point composition. */
export function controlZonePointsUrl(id: string, offset = 0): string {
  return `${V1}/control-zones/${encodeURIComponent(id)}/points?limit=200&offset=${String(offset)}`;
}

/**
 * The URL the portal builds for one facility's configuration document.
 *
 * No `include_archived` is sent, so the contract's own default applies.
 */
export function facilityConfigurationUrl(id: string): string {
  return `${V1}/facilities/${encodeURIComponent(id)}/configuration`;
}

/** The URL the portal builds for one bounded telemetry window. */
export function pointTelemetryUrl(pointId: string, limit = TELEMETRY_HISTORY_LIMIT): string {
  return `${V1}/points/${encodeURIComponent(pointId)}/telemetry?limit=${String(limit)}`;
}

/** The URL the portal posts one manual command to. Carries no query string. */
export function commandsUrl(): string {
  return `${V1}/commands`;
}

/** The URL the portal builds to read one command's lifecycle. */
export function commandUrl(commandId: string): string {
  return `${V1}/commands/${encodeURIComponent(commandId)}`;
}

/** The URL the portal builds to resolve one lost creation response. */
export function commandByKeyUrl(idempotencyKey: string): string {
  return `${V1}/commands?idempotency_key=${encodeURIComponent(idempotencyKey)}&limit=1`;
}

/**
 * Build a routing table that answers every request the dataset supports.
 *
 * Anything the dataset does not contain is deliberately left unrouted, so a
 * test that expects a resource to be missing must say so explicitly through
 * {@link extra} rather than getting a silent empty answer.
 *
 * @param dataset The topology to serve.
 * @param extra Routes merged on top, for failures and missing resources.
 * @returns A routing table for the fetch stub.
 */
export function backendRoutes(dataset: Dataset = DEFAULT_DATASET, extra: Router = {}): Router {
  const routes: Router = {
    [HEALTH_URL]: { body: HEALTHY_BODY },
    [sitesUrl()]: { body: page(dataset.sites) },
    [facilitiesUrl()]: { body: page(dataset.facilities) },
  };

  for (const site of dataset.sites) {
    routes[siteUrl(site.id)] = { body: site };
  }
  for (const facility of dataset.facilities) {
    routes[facilityUrl(facility.id)] = { body: facility };
    routes[facilityZonesUrl(facility.id)] = {
      body: page(dataset.zones.filter((zone) => zone.facility_id === facility.id)),
    };
  }
  for (const zone of dataset.zones) {
    routes[controlZoneUrl(zone.id)] = { body: zone };
    routes[controlZonePointsUrl(zone.id)] = {
      body: page(dataset.points.filter((point) => point.control_zone_id === zone.id)),
    };
  }
  for (const configuration of dataset.configurations) {
    routes[facilityConfigurationUrl(configuration.facility.id)] = { body: configuration };
  }
  for (const [pointId, samples] of Object.entries(dataset.telemetry)) {
    // `TelemetryHistoryRead` is `items` and nothing else: no total, no cursor.
    routes[pointTelemetryUrl(pointId)] = { body: { items: samples } };
  }

  return { ...routes, ...extra };
}

/** The body the backend returns for a request it validated and rejected. */
export const NOT_FOUND_BODY = { error: { code: "not_found", message: "Not found" } };
