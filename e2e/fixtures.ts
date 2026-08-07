/**
 * Deterministic backend answers for the browser suite.
 *
 * The suite runs the real production bundle against a contract-faithful fake of
 * the cloud API, implemented here with Playwright's request interception: the
 * `/health` endpoint, and the topology collections and resources this portal
 * reads. It is a test double of the *published contract* — the same paths, the
 * same `Page` envelope with a real `total`, the same query parameters, `404`
 * for a resource that does not exist — so no sibling repository and no running
 * backend is needed to prove the portal against it.
 *
 * These fixtures exist only in the browser suite. Nothing in `src/` imports
 * them, and the shipped bundle has no path that falls back to them.
 */

import type { Page, Route } from "@playwright/test";

export type HealthMode = "available" | "degraded" | "unreachable";

export interface HealthController {
  /** Change what the backend answers for the next check. */
  setMode: (mode: HealthMode) => void;
  /** How many health checks the browser has made. */
  checks: () => number;
}

/**
 * Answer the portal's health checks without a backend.
 *
 * @param page The page under test.
 * @param initial The mode to start in.
 * @returns A handle for switching the answer mid-test.
 */
export async function mockHealth(page: Page, initial: HealthMode = "available") {
  let mode = initial;
  let checks = 0;

  await page.route("**/health", async (route) => {
    checks += 1;
    if (mode === "unreachable") {
      await route.abort("connectionrefused");
      return;
    }
    const body =
      mode === "available"
        ? { status: "ok", service: "greenhouse", database: "ok" }
        : { status: "unavailable", service: "greenhouse", database: "unavailable" };
    await route.fulfill({
      status: mode === "available" ? 200 : 503,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  const controller: HealthController = {
    setMode: (next) => {
      mode = next;
    },
    checks: () => checks,
  };
  return controller;
}

/* Topology ---------------------------------------------------------------- */

interface SiteRow {
  id: string;
  name: string;
  code: string;
  timezone: string;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
}

interface FacilityRow {
  id: string;
  site_id: string;
  name: string;
  code: string;
  facility_type: string;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
}

interface ZoneRow {
  id: string;
  facility_id: string;
  name: string;
  code: string;
  zone_type: string;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
}

interface ZonePointRow {
  id: string;
  control_zone_id: string;
  point_id: string;
  role: string;
  created_at: string;
  point_code: string;
  point_name: string;
  point_kind: string;
  data_type: string;
  unit: string | null;
  reported_point_id: string | null;
}

interface ConfigurationPointRow {
  id: string;
  code: string;
  name: string;
  point_kind: string;
  metric_type: string;
  data_type: string;
  unit: string | null;
  reported_point_id: string | null;
  status: "active" | "archived";
  state: { value?: unknown; quality: string; observed_at: string | null };
}

interface ConfigurationRow {
  facility: { id: string; name: string; code: string; facility_type: string; status: string };
  site: { id: string; name: string; code: string; timezone: string };
  control_zones: {
    id: string;
    name: string;
    code: string;
    zone_type: string;
    status: string;
    points: { point_id: string; code: string; role: string }[];
  }[];
  points: ConfigurationPointRow[];
}

interface TelemetryRow {
  id: string;
  point_id: string;
  value: unknown;
  unit: string | null;
  observed_at: string;
  received_at: string;
  quality: string;
}

interface ControlLoopRow {
  id: string;
  control_zone_id: string;
  measurement_point_id: string;
  control_point_id: string;
  status_point_id: string;
  policy_type: string;
  lower_threshold: number;
  upper_threshold: number;
  created_at: string;
}

export interface TopologyDataset {
  sites: SiteRow[];
  facilities: FacilityRow[];
  zones: ZoneRow[];
  points: ZonePointRow[];
  /** `FacilityConfigurationRead` documents, keyed by the facility they describe. */
  configurations: ConfigurationRow[];
  /** `TelemetryHistoryRead` items, keyed by point identifier. */
  telemetry: Record<string, TelemetryRow[]>;
  /** `ControlLoopRead` rows, across every zone. */
  controlLoops: ControlLoopRow[];
}

/** Identifiers are UUIDs in the contract, so the fixtures use real ones. */
export const E2E_IDS = {
  riversideSite: "6f1c9f3a-6b1e-4f27-9b6d-5f2b1c9d0001",
  harbourSite: "6f1c9f3a-6b1e-4f27-9b6d-5f2b1c9d0002",
  northGreenhouse: "8a2d0e4b-7c2f-4a38-8c7e-6a3c2d0e0001",
  seedlingRoom: "8a2d0e4b-7c2f-4a38-8c7e-6a3c2d0e0002",
  climateZone: "9b3e1f5c-8d30-4b49-9d8f-7b4d3e1f0001",
  irrigationZone: "9b3e1f5c-8d30-4b49-9d8f-7b4d3e1f0002",
  seedlingClimateZone: "9b3e1f5c-8d30-4b49-9d8f-7b4d3e1f0003",
  unknownFacility: "00000000-0000-4000-8000-000000000404",
  airTempPoint: "bb000000-0000-4000-8000-000000000001",
  ventPoint: "bb000000-0000-4000-8000-000000000002",
  co2Point: "bb000000-0000-4000-8000-000000000003",
  soilMoisturePoint: "bb000000-0000-4000-8000-000000000004",
  ventStatusPoint: "bb000000-0000-4000-8000-000000000008",
  lampPoint: "bb000000-0000-4000-8000-000000000009",
  lampStatusPoint: "bb000000-0000-4000-8000-00000000000a",
  dimmerPoint: "bb000000-0000-4000-8000-00000000000b",
} as const;

const T0 = "2026-01-04T09:00:00Z";

/** Two sites — one with two facilities, one with none — and three zones. */
export const DEFAULT_TOPOLOGY: TopologyDataset = {
  sites: [
    {
      id: E2E_IDS.riversideSite,
      name: "Riverside Growing Site",
      code: "riverside",
      timezone: "Europe/Kyiv",
      status: "active",
      created_at: T0,
      updated_at: T0,
    },
    {
      id: E2E_IDS.harbourSite,
      name: "Harbour Research Site",
      code: "harbour",
      timezone: "Europe/Amsterdam",
      status: "active",
      created_at: T0,
      updated_at: T0,
    },
  ],
  facilities: [
    {
      id: E2E_IDS.northGreenhouse,
      site_id: E2E_IDS.riversideSite,
      name: "North Greenhouse",
      code: "north-gh",
      facility_type: "greenhouse",
      status: "active",
      created_at: T0,
      updated_at: T0,
    },
    {
      id: E2E_IDS.seedlingRoom,
      site_id: E2E_IDS.riversideSite,
      name: "Seedling Room",
      code: "seedling-1",
      facility_type: "seedling_room",
      status: "active",
      created_at: T0,
      updated_at: T0,
    },
  ],
  zones: [
    {
      id: E2E_IDS.climateZone,
      facility_id: E2E_IDS.northGreenhouse,
      name: "North Climate",
      code: "north-climate",
      zone_type: "climate",
      status: "active",
      created_at: T0,
      updated_at: T0,
    },
    {
      id: "9b3e1f5c-8d30-4b49-9d8f-7b4d3e1f0002",
      facility_id: E2E_IDS.northGreenhouse,
      name: "North Irrigation",
      code: "north-irrigation",
      zone_type: "irrigation",
      status: "active",
      created_at: T0,
      updated_at: T0,
    },
    {
      id: E2E_IDS.seedlingClimateZone,
      facility_id: E2E_IDS.seedlingRoom,
      name: "Seedling Climate",
      code: "seedling-climate",
      zone_type: "climate",
      status: "active",
      created_at: T0,
      updated_at: T0,
    },
  ],
  points: [
    {
      id: "aa000000-0000-4000-8000-000000000001",
      control_zone_id: E2E_IDS.climateZone,
      point_id: E2E_IDS.airTempPoint,
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
      control_zone_id: E2E_IDS.climateZone,
      point_id: E2E_IDS.ventPoint,
      role: "control_output",
      created_at: T0,
      point_code: "north-vent",
      // Named like a measurement, and classified as a control point.
      point_name: "North air temperature vent",
      point_kind: "control",
      data_type: "boolean",
      unit: null,
      reported_point_id: E2E_IDS.ventStatusPoint,
    },
    {
      id: "aa000000-0000-4000-8000-000000000003",
      control_zone_id: E2E_IDS.climateZone,
      point_id: E2E_IDS.co2Point,
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
      control_zone_id: E2E_IDS.climateZone,
      point_id: E2E_IDS.soilMoisturePoint,
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
      control_zone_id: E2E_IDS.climateZone,
      point_id: E2E_IDS.ventStatusPoint,
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
      id: "aa000000-0000-4000-8000-000000000006",
      control_zone_id: E2E_IDS.climateZone,
      point_id: E2E_IDS.lampPoint,
      role: "control_output",
      created_at: T0,
      point_code: "north-lamp",
      point_name: "North lamp",
      point_kind: "control",
      data_type: "boolean",
      unit: null,
      reported_point_id: E2E_IDS.lampStatusPoint,
    },
    {
      id: "aa000000-0000-4000-8000-000000000007",
      control_zone_id: E2E_IDS.climateZone,
      point_id: E2E_IDS.lampStatusPoint,
      // Named exactly like an actuator, and a status point.
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
      id: "aa000000-0000-4000-8000-000000000008",
      control_zone_id: E2E_IDS.climateZone,
      point_id: E2E_IDS.dimmerPoint,
      role: "control_output",
      created_at: T0,
      point_code: "north-vent-dimmer",
      point_name: "North vent dimmer",
      point_kind: "control",
      data_type: "float",
      unit: "%",
      reported_point_id: E2E_IDS.ventStatusPoint,
    },
  ],
  configurations: [
    {
      facility: {
        id: E2E_IDS.northGreenhouse,
        name: "North Greenhouse",
        code: "north-gh",
        facility_type: "greenhouse",
        status: "active",
      },
      site: {
        id: E2E_IDS.riversideSite,
        name: "Riverside Growing Site",
        code: "riverside",
        timezone: "Europe/Kyiv",
      },
      control_zones: [
        {
          id: E2E_IDS.climateZone,
          name: "North Climate",
          code: "north-climate",
          zone_type: "climate",
          status: "active",
          points: [
            {
              point_id: E2E_IDS.airTempPoint,
              code: "north-air-temp",
              role: "primary_measurement",
            },
            { point_id: E2E_IDS.ventPoint, code: "north-vent", role: "control_output" },
            { point_id: E2E_IDS.co2Point, code: "north-co2", role: "secondary_measurement" },
            {
              point_id: E2E_IDS.soilMoisturePoint,
              code: "north-soil-moisture",
              role: "secondary_measurement",
            },
            {
              point_id: E2E_IDS.ventStatusPoint,
              code: "north-vent-status",
              role: "status_feedback",
            },
            { point_id: E2E_IDS.lampPoint, code: "north-lamp", role: "control_output" },
            {
              point_id: E2E_IDS.lampStatusPoint,
              code: "north-lamp-power-switch",
              role: "status_feedback",
            },
            {
              point_id: E2E_IDS.dimmerPoint,
              code: "north-vent-dimmer",
              role: "control_output",
            },
          ],
        },
        {
          id: E2E_IDS.irrigationZone,
          name: "North Irrigation",
          code: "north-irrigation",
          zone_type: "irrigation",
          status: "active",
          points: [],
        },
      ],
      points: [
        {
          id: E2E_IDS.airTempPoint,
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
          id: E2E_IDS.ventPoint,
          code: "north-vent",
          name: "North air temperature vent",
          point_kind: "control",
          metric_type: "vent_position",
          data_type: "boolean",
          reported_point_id: E2E_IDS.ventStatusPoint,
          unit: null,
          status: "active",
          // The control point's own projection: neither a desired state nor a
          // reported one in the contract, and rendered as neither.
          state: { value: true, quality: "good", observed_at: "2026-01-04T09:05:00Z" },
        },
        {
          id: E2E_IDS.co2Point,
          code: "north-co2",
          name: "North CO2",
          point_kind: "measurement",
          metric_type: "co2",
          data_type: "integer",
          unit: "ppm",
          reported_point_id: null,
          status: "active",
          // A measured zero, which is not the same as no reading.
          state: { value: 0, quality: "uncertain", observed_at: "2026-01-04T09:04:00Z" },
        },
        {
          id: E2E_IDS.soilMoisturePoint,
          code: "north-soil-moisture",
          name: "North soil moisture",
          point_kind: "measurement",
          metric_type: "soil_moisture",
          data_type: "float",
          unit: null,
          reported_point_id: null,
          status: "active",
          // Never reported: the empty projection a point is created with.
          state: { value: null, quality: "no_data", observed_at: null },
        },
        {
          id: E2E_IDS.ventStatusPoint,
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
          id: E2E_IDS.lampPoint,
          code: "north-lamp",
          name: "North lamp",
          point_kind: "control",
          metric_type: "lamp_state",
          data_type: "boolean",
          unit: null,
          reported_point_id: E2E_IDS.lampStatusPoint,
          status: "active",
          state: { value: null, quality: "no_data", observed_at: null },
        },
        {
          id: E2E_IDS.lampStatusPoint,
          code: "north-lamp-power-switch",
          name: "North lamp power switch",
          point_kind: "status",
          metric_type: "lamp_state",
          data_type: "boolean",
          unit: null,
          reported_point_id: null,
          status: "active",
          state: { value: null, quality: "no_data", observed_at: null },
        },
        {
          id: E2E_IDS.dimmerPoint,
          code: "north-vent-dimmer",
          name: "North vent dimmer",
          point_kind: "control",
          metric_type: "vent_position",
          // A `float` control point: the command schema accepts a strict `bool`
          // and nothing else, so it carries no action.
          data_type: "float",
          unit: "%",
          reported_point_id: E2E_IDS.ventStatusPoint,
          status: "active",
          state: { value: 40, quality: "good", observed_at: "2026-01-04T09:05:00Z" },
        },
      ],
    },
    {
      facility: {
        id: E2E_IDS.seedlingRoom,
        name: "Seedling Room",
        code: "seedling-1",
        facility_type: "seedling_room",
        status: "active",
      },
      site: {
        id: E2E_IDS.riversideSite,
        name: "Riverside Growing Site",
        code: "riverside",
        timezone: "Europe/Kyiv",
      },
      control_zones: [
        {
          id: E2E_IDS.seedlingClimateZone,
          name: "Seedling Climate",
          code: "seedling-climate",
          zone_type: "climate",
          status: "active",
          points: [],
        },
      ],
      points: [],
    },
  ],
  telemetry: {
    // Deliberately not in chronological order: the contract documents none.
    [E2E_IDS.airTempPoint]: [
      {
        id: "cc000000-0000-4000-8000-000000000002",
        point_id: E2E_IDS.airTempPoint,
        value: 21.4,
        unit: "degC",
        observed_at: "2026-01-04T09:05:00Z",
        received_at: "2026-01-04T09:05:04Z",
        quality: "good",
      },
      {
        id: "cc000000-0000-4000-8000-000000000001",
        point_id: E2E_IDS.airTempPoint,
        value: 20.1,
        unit: "degC",
        observed_at: "2026-01-04T09:00:00Z",
        received_at: "2026-01-04T09:00:03Z",
        quality: "good",
      },
      {
        id: "cc000000-0000-4000-8000-000000000003",
        point_id: E2E_IDS.airTempPoint,
        value: 22.9,
        unit: "degC",
        observed_at: "2026-01-04T09:10:00Z",
        received_at: "2026-01-04T09:10:02Z",
        quality: "uncertain",
      },
    ],
    [E2E_IDS.co2Point]: [
      {
        id: "cd000000-0000-4000-8000-000000000001",
        point_id: E2E_IDS.co2Point,
        value: 412,
        unit: "ppm",
        observed_at: "2026-01-04T09:00:00Z",
        received_at: "2026-01-04T09:00:01Z",
        quality: "good",
      },
      {
        id: "cd000000-0000-4000-8000-000000000002",
        point_id: E2E_IDS.co2Point,
        value: 0,
        unit: "ppm",
        observed_at: "2026-01-04T09:04:00Z",
        received_at: "2026-01-04T09:04:01Z",
        quality: "good",
      },
    ],
    // A point with no stored history at all.
    [E2E_IDS.soilMoisturePoint]: [],
  },
  controlLoops: [
    {
      id: "cc000000-0000-4000-8000-000000000001",
      control_zone_id: E2E_IDS.climateZone,
      measurement_point_id: E2E_IDS.co2Point,
      control_point_id: E2E_IDS.lampPoint,
      status_point_id: E2E_IDS.lampStatusPoint,
      policy_type: "hysteresis-v1",
      lower_threshold: 400,
      upper_threshold: 1200,
      created_at: T0,
    },
  ],
};

/** A cloud API with nothing provisioned. */
export const EMPTY_TOPOLOGY: TopologyDataset = {
  sites: [],
  facilities: [],
  zones: [],
  points: [],
  configurations: [],
  telemetry: {},
  controlLoops: [],
};

export interface TopologyController {
  /** Make every topology request fail, as an unreachable backend would. */
  setUnreachable: (unreachable: boolean) => void;
  /** Make the configuration document fail while everything else answers. */
  setConfigurationUnreachable: (unreachable: boolean) => void;
  /** Make every telemetry request fail while current state keeps answering. */
  setTelemetryUnreachable: (unreachable: boolean) => void;
  /** Every topology path the browser asked for, in order. */
  requests: () => string[];
}

/** The contract's paginated envelope, honouring the requested window. */
function envelope<T>(items: readonly T[], url: URL) {
  const limit = Number(url.searchParams.get("limit") ?? "50");
  const offset = Number(url.searchParams.get("offset") ?? "0");
  return {
    items: items.slice(offset, offset + limit),
    total: items.length,
    limit,
    offset,
  };
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

const NOT_FOUND = { error: { code: "not_found", message: "Not found" } };

/**
 * Answer the portal's topology requests without a backend.
 *
 * @param page The page under test.
 * @param dataset The topology to serve.
 * @returns A handle for making the backend unreachable and inspecting traffic.
 */
export async function mockTopology(
  page: Page,
  dataset: TopologyDataset = DEFAULT_TOPOLOGY,
): Promise<TopologyController> {
  let unreachable = false;
  let configurationUnreachable = false;
  let telemetryUnreachable = false;
  const requests: string[] = [];

  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    requests.push(url.pathname + url.search);

    if (unreachable) {
      await route.abort("connectionrefused");
      return;
    }

    const path = url.pathname;

    const configuration = /^\/api\/v1\/facilities\/([^/]+)\/configuration$/.exec(path);
    if (configuration) {
      if (configurationUnreachable) {
        await route.abort("connectionrefused");
        return;
      }
      const facilityId = decodeURIComponent(configuration[1]!);
      const found = dataset.configurations.find((row) => row.facility.id === facilityId);
      await (found ? json(route, found) : json(route, NOT_FOUND, 404));
      return;
    }

    const telemetry = /^\/api\/v1\/points\/([^/]+)\/telemetry$/.exec(path);
    if (telemetry) {
      if (telemetryUnreachable) {
        await route.abort("connectionrefused");
        return;
      }
      const pointId = decodeURIComponent(telemetry[1]!);
      const samples = dataset.telemetry[pointId];
      if (samples === undefined) {
        await json(route, NOT_FOUND, 404);
        return;
      }
      // `TelemetryHistoryRead` is `items` and nothing else, bounded by `limit`.
      const limit = Number(url.searchParams.get("limit") ?? "100");
      await json(route, { items: samples.slice(0, limit) });
      return;
    }

    if (path === "/api/v1/sites") {
      await json(route, envelope(dataset.sites, url));
      return;
    }
    if (path === "/api/v1/facilities") {
      const siteId = url.searchParams.get("site_id");
      const items =
        siteId === null
          ? dataset.facilities
          : dataset.facilities.filter((facility) => facility.site_id === siteId);
      await json(route, envelope(items, url));
      return;
    }
    if (path === "/api/v1/control-loops") {
      const zoneId = url.searchParams.get("control_zone_id");
      const items =
        zoneId === null
          ? dataset.controlLoops
          : dataset.controlLoops.filter((loop) => loop.control_zone_id === zoneId);
      await json(route, envelope(items, url));
      return;
    }
    if (path === "/api/v1/control-zones") {
      const facilityId = url.searchParams.get("facility_id");
      const items =
        facilityId === null
          ? dataset.zones
          : dataset.zones.filter((zone) => zone.facility_id === facilityId);
      await json(route, envelope(items, url));
      return;
    }

    const site = /^\/api\/v1\/sites\/([^/]+)$/.exec(path);
    if (site) {
      const found = dataset.sites.find((row) => row.id === decodeURIComponent(site[1]!));
      await (found ? json(route, found) : json(route, NOT_FOUND, 404));
      return;
    }

    const facility = /^\/api\/v1\/facilities\/([^/]+)$/.exec(path);
    if (facility) {
      const found = dataset.facilities.find((row) => row.id === decodeURIComponent(facility[1]!));
      await (found ? json(route, found) : json(route, NOT_FOUND, 404));
      return;
    }

    const zonePoints = /^\/api\/v1\/control-zones\/([^/]+)\/points$/.exec(path);
    if (zonePoints) {
      const zoneId = decodeURIComponent(zonePoints[1]!);
      if (!dataset.zones.some((row) => row.id === zoneId)) {
        await json(route, NOT_FOUND, 404);
        return;
      }
      await json(
        route,
        envelope(
          dataset.points.filter((point) => point.control_zone_id === zoneId),
          url,
        ),
      );
      return;
    }

    const zone = /^\/api\/v1\/control-zones\/([^/]+)$/.exec(path);
    if (zone) {
      const found = dataset.zones.find((row) => row.id === decodeURIComponent(zone[1]!));
      await (found ? json(route, found) : json(route, NOT_FOUND, 404));
      return;
    }

    await json(route, NOT_FOUND, 404);
  });

  return {
    setUnreachable: (next) => {
      unreachable = next;
    },
    setConfigurationUnreachable: (next) => {
      configurationUnreachable = next;
    },
    setTelemetryUnreachable: (next) => {
      telemetryUnreachable = next;
    },
    requests: () => [...requests],
  };
}

/* Manual control ---------------------------------------------------------- */

export interface CommandRow {
  id: string;
  source: string;
  idempotency_key: string;
  control_zone_id: string;
  control_loop_id: string | null;
  trigger_sample_id: string | null;
  target_point_id: string;
  reported_point_id: string;
  gateway_id: string | null;
  desired_value: boolean;
  state: "pending" | "applied" | "rejected";
  result_control_sample_id: string | null;
  result_status_sample_id: string | null;
  issued_at: string;
  executed_at: string | null;
  acknowledged_at: string | null;
  rejection_reason: { code: string; message: string } | null;
  created_at: string;
}

/** Identifiers of the command history Activity reads. */
export const E2E_COMMAND_IDS = {
  ventOnPending: "dd000000-0000-4000-8000-0000000000a1",
  lampOnAutomatic: "dd000000-0000-4000-8000-0000000000a2",
  lampOnApplied: "dd000000-0000-4000-8000-0000000000a3",
  ventOffRejected: "dd000000-0000-4000-8000-0000000000a4",
} as const;

const LOOP_ID = "cc000000-0000-4000-8000-0000000000b1";
const TRIGGER_SAMPLE_ID = "cc000000-0000-4000-8000-0000000000b2";

/**
 * A control zone's command history, newest first.
 *
 * The order is the one the list operation guarantees — `created_at DESC, id
 * DESC` — so a portal that re-sorts, or that renders arrival order while
 * claiming recency, disagrees with this double.
 *
 * It holds a manual command and an automatic one, a pending command with no
 * acknowledgement and a pending one with an acknowledgement, a terminal success
 * and a terminal failure, so every lifecycle a customer can meet is on screen at
 * once.
 */
export const SEEDED_COMMANDS: readonly CommandRow[] = [
  {
    id: E2E_COMMAND_IDS.ventOffRejected,
    source: "control_loop",
    idempotency_key: "ee000000-0000-4000-8000-0000000000a4",
    control_zone_id: E2E_IDS.climateZone,
    control_loop_id: LOOP_ID,
    trigger_sample_id: TRIGGER_SAMPLE_ID,
    target_point_id: E2E_IDS.ventPoint,
    reported_point_id: E2E_IDS.ventStatusPoint,
    gateway_id: null,
    desired_value: false,
    state: "rejected",
    result_control_sample_id: null,
    result_status_sample_id: null,
    issued_at: "2026-01-04T09:12:00Z",
    executed_at: "2026-01-04T09:12:45Z",
    acknowledged_at: "2026-01-04T09:12:30Z",
    rejection_reason: {
      code: "actuator_interlocked",
      message: "A safety interlock is engaged for this actuator.",
    },
    created_at: "2026-01-04T09:12:00Z",
  },
  {
    id: E2E_COMMAND_IDS.lampOnApplied,
    source: "manual",
    idempotency_key: "ee000000-0000-4000-8000-0000000000a3",
    control_zone_id: E2E_IDS.climateZone,
    control_loop_id: null,
    trigger_sample_id: null,
    target_point_id: E2E_IDS.lampPoint,
    reported_point_id: E2E_IDS.lampStatusPoint,
    gateway_id: null,
    desired_value: true,
    state: "applied",
    result_control_sample_id: null,
    result_status_sample_id: null,
    issued_at: "2026-01-04T09:10:00Z",
    executed_at: "2026-01-04T09:11:00Z",
    acknowledged_at: "2026-01-04T09:10:20Z",
    rejection_reason: null,
    created_at: "2026-01-04T09:10:00Z",
  },
  {
    id: E2E_COMMAND_IDS.lampOnAutomatic,
    source: "control_loop",
    idempotency_key: "ee000000-0000-4000-8000-0000000000a2",
    control_zone_id: E2E_IDS.climateZone,
    control_loop_id: LOOP_ID,
    trigger_sample_id: TRIGGER_SAMPLE_ID,
    target_point_id: E2E_IDS.lampPoint,
    reported_point_id: E2E_IDS.lampStatusPoint,
    gateway_id: null,
    desired_value: true,
    state: "pending",
    result_control_sample_id: null,
    result_status_sample_id: null,
    issued_at: "2026-01-04T09:08:00Z",
    executed_at: null,
    acknowledged_at: "2026-01-04T09:09:00Z",
    rejection_reason: null,
    created_at: "2026-01-04T09:08:00Z",
  },
  {
    id: E2E_COMMAND_IDS.ventOnPending,
    source: "manual",
    idempotency_key: "ee000000-0000-4000-8000-0000000000a1",
    control_zone_id: E2E_IDS.climateZone,
    control_loop_id: null,
    trigger_sample_id: null,
    target_point_id: E2E_IDS.ventPoint,
    reported_point_id: E2E_IDS.ventStatusPoint,
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
  },
];

/** How the fake command service answers a creation request. */
export type CreationMode = "created" | "refused" | "unreachable";

/**
 * What the greenhouse eventually reports about a command it was sent.
 *
 * `acknowledged` is not a `CommandState` and the double does not pretend it is:
 * it sets `acknowledged_at` and leaves the command `pending`, which is exactly
 * what the contract says an Edge receipt means.
 */
export type LifecycleMode = "pending" | "acknowledged" | "applied" | "rejected";

export interface CommandController {
  /** Change how the next creation request is answered. */
  setCreationMode: (mode: CreationMode) => void;
  /** Change what a command's state becomes on the next read. */
  setLifecycle: (mode: LifecycleMode) => void;
  /** Make reading a command fail while everything else answers. */
  setReadUnreachable: (unreachable: boolean) => void;
  /** Every command creation request the browser made, in order. */
  creations: () => { key: string; body: unknown }[];
  /** Every command path the browser asked for, in order. */
  requests: () => string[];
  /** The commands the service has stored. */
  stored: () => CommandRow[];
}

/**
 * Answer the portal's manual-control requests without a backend.
 *
 * It is a test double of the *published contract*: `POST /api/v1/commands`
 * requires the `Idempotency-Key` header and answers `422` without it, `201` for
 * a first creation and `200` with `outcome: "existing"` for a replay of the same
 * key and body, and `409 idempotency_key_conflict` for the same key with a
 * different one. `GET /api/v1/commands?idempotency_key=` resolves zero or one
 * command, and `GET /api/v1/commands/{id}` reads one.
 *
 * Register it after {@link mockTopology}: Playwright tries the most recently
 * registered route first, and the topology double matches all of `/api/v1`.
 *
 * `GET /api/v1/commands` is answered the way the operation documents it: every
 * filter is an exact match, several may be combined, the window is ordered
 * `created_at DESC, id DESC` *before* `limit` is applied, and the envelope is
 * `items` alone — no total and no cursor.
 *
 * @param page The page under test.
 * @param dataset The topology whose zones and points commands may name.
 * @param seed Commands that already exist, for reading history rather than
 *   creating it.
 * @returns A handle for steering creation, lifecycle and failures.
 */
export async function mockCommands(
  page: Page,
  dataset: TopologyDataset = DEFAULT_TOPOLOGY,
  seed: readonly CommandRow[] = [],
): Promise<CommandController> {
  let creationMode: CreationMode = "created";
  let lifecycle: LifecycleMode = "pending";
  let readUnreachable = false;
  const stored: CommandRow[] = seed.map((row) => ({ ...row }));
  const creations: { key: string; body: unknown }[] = [];
  const requests: string[] = [];
  let issued = 0;

  const reportedPointOf = (targetPointId: string): string | null => {
    for (const configuration of dataset.configurations) {
      const point = configuration.points.find((row) => row.id === targetPointId);
      if (point !== undefined) {
        return point.reported_point_id;
      }
    }
    return null;
  };

  await page.route("**/api/v1/commands**", async (route) => {
    const url = new URL(route.request().url());
    requests.push(url.pathname + url.search);
    const request = route.request();

    if (request.method() === "POST") {
      const key = request.headers()["idempotency-key"];
      const body = request.postDataJSON() as {
        control_zone_id: string;
        target_point_id: string;
        desired_value: boolean;
      };
      creations.push({ key: key ?? "", body });

      if (creationMode === "unreachable") {
        await route.abort("connectionrefused");
        return;
      }
      if (key === undefined) {
        await json(route, { error: { code: "validation_error", message: "no", details: {} } }, 422);
        return;
      }
      if (creationMode === "refused") {
        await json(
          route,
          { error: { code: "validation_error", message: "Refused.", details: {} } },
          422,
        );
        return;
      }

      const existing = stored.find((row) => row.idempotency_key === key);
      if (existing !== undefined) {
        const same =
          existing.control_zone_id === body.control_zone_id &&
          existing.target_point_id === body.target_point_id &&
          existing.desired_value === body.desired_value;
        if (!same) {
          await json(
            route,
            { error: { code: "idempotency_key_conflict", message: "Different.", details: {} } },
            409,
          );
          return;
        }
        // A replay writes nothing and enqueues nothing.
        await json(route, { outcome: "existing", command: existing }, 200);
        return;
      }

      const reported = reportedPointOf(body.target_point_id);
      if (reported === null) {
        await json(
          route,
          { error: { code: "not_found", message: "No target.", details: {} } },
          404,
        );
        return;
      }

      issued += 1;
      const command: CommandRow = {
        id: `dd000000-0000-4000-8000-00000000000${String(issued)}`,
        source: "manual",
        idempotency_key: key,
        control_zone_id: body.control_zone_id,
        control_loop_id: null,
        trigger_sample_id: null,
        target_point_id: body.target_point_id,
        reported_point_id: reported,
        gateway_id: null,
        desired_value: body.desired_value,
        // Every command is written pending. Acceptance is acceptance of the
        // request, never of the physical change.
        state: "pending",
        result_control_sample_id: null,
        result_status_sample_id: null,
        issued_at: "2026-01-04T09:06:00Z",
        executed_at: null,
        acknowledged_at: null,
        rejection_reason: null,
        created_at: "2026-01-04T09:06:00Z",
      };
      stored.push(command);
      await json(route, { outcome: "created", command }, 201);
      return;
    }

    if (readUnreachable) {
      await route.abort("connectionrefused");
      return;
    }

    const byKey = url.searchParams.get("idempotency_key");
    if (byKey !== null) {
      const found = stored.filter((row) => row.idempotency_key === byKey);
      await json(route, { items: found });
      return;
    }

    const detail = /^\/api\/v1\/commands\/([^/]+)$/.exec(url.pathname);
    if (detail) {
      const id = decodeURIComponent(detail[1]!);
      const found = stored.find((row) => row.id === id);
      if (found === undefined) {
        await json(route, NOT_FOUND, 404);
        return;
      }
      // The Edge's answer arrives between reads, exactly as it would in life.
      if (lifecycle === "acknowledged") {
        // Receipt, and nothing else. The command is still non-terminal.
        found.acknowledged_at = "2026-01-04T09:06:30Z";
      } else if (lifecycle === "applied") {
        found.state = "applied";
        found.acknowledged_at = "2026-01-04T09:06:30Z";
        found.executed_at = "2026-01-04T09:07:00Z";
      } else if (lifecycle === "rejected") {
        found.state = "rejected";
        found.acknowledged_at = "2026-01-04T09:06:30Z";
        found.executed_at = "2026-01-04T09:07:00Z";
        found.rejection_reason = {
          code: "actuator_unreachable",
          message: "The gateway did not answer.",
        };
      }
      await json(route, found);
      return;
    }

    // The command window. Every filter is an exact match, the order is applied
    // before the limit, and the envelope carries `items` and nothing else.
    const zoneId = url.searchParams.get("control_zone_id");
    const targetPointId = url.searchParams.get("target_point_id");
    const source = url.searchParams.get("source");
    const limit = Number(url.searchParams.get("limit") ?? "100");

    const items = stored
      .filter((row) => zoneId === null || row.control_zone_id === zoneId)
      .filter((row) => targetPointId === null || row.target_point_id === targetPointId)
      .filter((row) => source === null || row.source === source)
      .sort((a, b) =>
        a.created_at === b.created_at
          ? b.id.localeCompare(a.id)
          : b.created_at.localeCompare(a.created_at),
      )
      .slice(0, limit);

    await json(route, { items });
  });

  return {
    setCreationMode: (mode) => {
      creationMode = mode;
    },
    setLifecycle: (mode) => {
      lifecycle = mode;
    },
    setReadUnreachable: (next) => {
      readUnreachable = next;
    },
    creations: () => [...creations],
    requests: () => [...requests],
    stored: () => stored.map((row) => ({ ...row })),
  };
}
