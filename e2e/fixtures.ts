/**
 * Deterministic `/api/v1` answers for the browser suite.
 *
 * These mirror the backend response shapes the unit fixtures use. Serving them
 * through Playwright's routing means the smoke tests need no backend, no
 * database and no shared mutable state.
 */

import type { Page, Route } from "@playwright/test";

export const FACILITY_ID = "22222222-2222-4222-8222-222222222222";
export const OTHER_FACILITY_ID = "22222222-2222-4222-8222-999999999999";
export const TEMPERATURE_POINT_ID = "d1111111-dddd-4ddd-8ddd-dddddddddddd";
export const HUMIDITY_POINT_ID = "d2222222-dddd-4ddd-8ddd-dddddddddddd";
export const FAN_RUNNING_POINT_ID = "d4444444-dddd-4ddd-8ddd-dddddddddddd";

const SITE_ID = "11111111-1111-4111-8111-111111111111";

export const facilityPage = {
  items: [
    {
      id: FACILITY_ID,
      site_id: SITE_ID,
      name: "Basil Growbox",
      code: "basil-growbox",
      facility_type: "growbox",
      status: "active",
      created_at: "2026-07-01T10:00:00Z",
      updated_at: "2026-07-01T10:00:00Z",
    },
    {
      id: OTHER_FACILITY_ID,
      site_id: SITE_ID,
      name: "Mint Growbox",
      code: "mint-growbox",
      facility_type: "growbox",
      status: "active",
      created_at: "2026-07-02T10:00:00Z",
      updated_at: "2026-07-02T10:00:00Z",
    },
  ],
  total: 2,
  limit: 200,
  offset: 0,
};

export function configuration(temperature: number) {
  return {
    facility: {
      id: FACILITY_ID,
      name: "Basil Growbox",
      code: "basil-growbox",
      facility_type: "growbox",
      status: "active",
    },
    site: { id: SITE_ID, name: "Home", code: "home", timezone: "UTC" },
    control_zones: [],
    points: [
      {
        id: TEMPERATURE_POINT_ID,
        code: "air_temperature",
        name: "Air temperature",
        point_kind: "measurement",
        metric_type: "air_temperature",
        data_type: "float",
        unit: "°C",
        status: "active",
        state: { value: temperature, quality: "good", observed_at: "2026-08-01T09:00:00Z" },
      },
      {
        id: HUMIDITY_POINT_ID,
        code: "air_humidity",
        name: "Air humidity",
        point_kind: "measurement",
        metric_type: "air_humidity",
        data_type: "float",
        unit: "%",
        status: "active",
        state: { value: null, quality: "no_data", observed_at: null },
      },
      {
        id: FAN_RUNNING_POINT_ID,
        code: "fan_running",
        name: "Fan running",
        point_kind: "measurement",
        metric_type: "fan_running",
        data_type: "boolean",
        unit: null,
        status: "active",
        state: { value: true, quality: "good", observed_at: "2026-08-01T09:00:00Z" },
      },
    ],
  };
}

export const emptyConfiguration = {
  facility: {
    id: OTHER_FACILITY_ID,
    name: "Mint Growbox",
    code: "mint-growbox",
    facility_type: "growbox",
    status: "active",
  },
  site: { id: SITE_ID, name: "Home", code: "home", timezone: "UTC" },
  control_zones: [],
  points: [],
};

/** 100 samples, newest first, exactly as the history endpoint answers. */
export function telemetry(pointId: string, count = 100) {
  const base = Date.parse("2026-08-01T09:00:00Z");
  return {
    items: Array.from({ length: count }, (_, index) => {
      const observedAt = new Date(base - index * 60_000).toISOString();
      return {
        id: `aaaaaaaa-0000-4000-8000-${String(index).padStart(12, "0")}`,
        point_id: pointId,
        value: 20 + (count - index) * 0.05,
        unit: "°C",
        observed_at: observedAt,
        received_at: observedAt,
        quality: "good",
      };
    }),
  };
}

/** Control handed back to a test so it can change the backend's behaviour. */
export interface ApiControl {
  /** Current temperature reading; changing it proves polling picks it up. */
  setTemperature: (value: number) => void;
  /** Make every subsequent request fail, standing in for a backend outage. */
  setFailing: (failing: boolean) => void;
  /** How many configuration requests the page has made. */
  configurationRequests: () => number;
}

/**
 * Answer every `/api/v1` request from fixtures.
 *
 * @param page The page to install the route on.
 * @returns Controls for changing what the fake backend does mid-test.
 */
export async function mockApi(page: Page): Promise<ApiControl> {
  let temperature = 23.4;
  let failing = false;
  let configurationRequests = 0;

  await page.route("**/api/v1/**", async (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (failing) {
      await route.abort("failed");
      return;
    }

    const json = async (body: unknown) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    };

    if (path === "/api/v1/facilities") {
      await json(facilityPage);
      return;
    }
    if (path === `/api/v1/facilities/${FACILITY_ID}/configuration`) {
      configurationRequests += 1;
      await json(configuration(temperature));
      return;
    }
    if (path === `/api/v1/facilities/${OTHER_FACILITY_ID}/configuration`) {
      await json(emptyConfiguration);
      return;
    }
    if (path.endsWith("/telemetry")) {
      const pointId = path.split("/")[4] ?? TEMPERATURE_POINT_ID;
      await json(telemetry(pointId, url.searchParams.get("limit") === "100" ? 100 : 10));
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "not_found", message: "unrouted" } }),
    });
  });

  return {
    setTemperature: (value: number) => {
      temperature = value;
    },
    setFailing: (value: boolean) => {
      failing = value;
    },
    configurationRequests: () => configurationRequests,
  };
}
