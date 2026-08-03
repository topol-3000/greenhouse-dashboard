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
}

interface ConfigurationPointRow {
  id: string;
  code: string;
  name: string;
  point_kind: string;
  metric_type: string;
  data_type: string;
  unit: string | null;
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

export interface TopologyDataset {
  sites: SiteRow[];
  facilities: FacilityRow[];
  zones: ZoneRow[];
  points: ZonePointRow[];
  /** `FacilityConfigurationRead` documents, keyed by the facility they describe. */
  configurations: ConfigurationRow[];
  /** `TelemetryHistoryRead` items, keyed by point identifier. */
  telemetry: Record<string, TelemetryRow[]>;
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
          unit: null,
          status: "active",
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
          status: "active",
          // Never reported: the empty projection a point is created with.
          state: { value: null, quality: "no_data", observed_at: null },
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
};

/** A cloud API with nothing provisioned. */
export const EMPTY_TOPOLOGY: TopologyDataset = {
  sites: [],
  facilities: [],
  zones: [],
  points: [],
  configurations: [],
  telemetry: {},
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
