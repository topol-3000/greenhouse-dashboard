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

export interface TopologyDataset {
  sites: SiteRow[];
  facilities: FacilityRow[];
  zones: ZoneRow[];
  points: ZonePointRow[];
}

/** Identifiers are UUIDs in the contract, so the fixtures use real ones. */
export const E2E_IDS = {
  riversideSite: "6f1c9f3a-6b1e-4f27-9b6d-5f2b1c9d0001",
  harbourSite: "6f1c9f3a-6b1e-4f27-9b6d-5f2b1c9d0002",
  northGreenhouse: "8a2d0e4b-7c2f-4a38-8c7e-6a3c2d0e0001",
  seedlingRoom: "8a2d0e4b-7c2f-4a38-8c7e-6a3c2d0e0002",
  climateZone: "9b3e1f5c-8d30-4b49-9d8f-7b4d3e1f0001",
  seedlingClimateZone: "9b3e1f5c-8d30-4b49-9d8f-7b4d3e1f0003",
  unknownFacility: "00000000-0000-4000-8000-000000000404",
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
      point_id: "bb000000-0000-4000-8000-000000000001",
      role: "primary_measurement",
      created_at: T0,
      point_code: "north-air-temp",
      point_name: "North air temperature",
      point_kind: "measurement",
      data_type: "float",
      unit: "degC",
    },
  ],
};

/** A cloud API with nothing provisioned. */
export const EMPTY_TOPOLOGY: TopologyDataset = {
  sites: [],
  facilities: [],
  zones: [],
  points: [],
};

export interface TopologyController {
  /** Make every topology request fail, as an unreachable backend would. */
  setUnreachable: (unreachable: boolean) => void;
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
  const requests: string[] = [];

  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    requests.push(url.pathname + url.search);

    if (unreachable) {
      await route.abort("connectionrefused");
      return;
    }

    const path = url.pathname;

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
    requests: () => [...requests],
  };
}
