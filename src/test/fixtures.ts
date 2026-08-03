/**
 * Response bodies copied from the current `greenhouse` backend.
 *
 * The shapes here are the ones `greenhouse/tests/integration` asserts field by
 * field against a real PostgreSQL database: the facility page envelope, the
 * facility configuration document and the count-free telemetry history. They
 * are written out literally rather than generated from the application's own
 * types, so a client that drifts from the backend fails these tests instead of
 * agreeing with itself.
 */

export const SITE_ID = "11111111-1111-4111-8111-111111111111";
export const FACILITY_ID = "22222222-2222-4222-8222-222222222222";
export const OTHER_FACILITY_ID = "22222222-2222-4222-8222-999999999999";
export const ZONE_ID = "33333333-3333-4333-8333-333333333333";

export const POINT_IDS = {
  airTemperature: "d1111111-dddd-4ddd-8ddd-dddddddddddd",
  airHumidity: "d2222222-dddd-4ddd-8ddd-dddddddddddd",
  soilMoisture: "d3333333-dddd-4ddd-8ddd-dddddddddddd",
  fanRunning: "d4444444-dddd-4ddd-8ddd-dddddddddddd",
  fanPower: "d5555555-dddd-4ddd-8ddd-dddddddddddd",
};

/** `GET /api/v1/facilities?status=active&limit=200`. */
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

/** An empty facility page, as a clean backend answers it. */
export const emptyFacilityPage = { items: [], total: 0, limit: 200, offset: 0 };

/**
 * `GET /api/v1/facilities/{id}/configuration`.
 *
 * Deliberately mixed: two numeric measurement points with readings, one
 * measurement point that has never reported, one boolean measurement point and
 * one control point. That covers "chart numeric only", "no-data is not zero"
 * and "control points are not measurements" in one document.
 */
export const facilityConfiguration = {
  facility: {
    id: FACILITY_ID,
    name: "Basil Growbox",
    code: "basil-growbox",
    facility_type: "growbox",
    status: "active",
  },
  site: { id: SITE_ID, name: "Home", code: "home", timezone: "UTC" },
  control_zones: [
    {
      id: ZONE_ID,
      name: "Main Climate",
      code: "main-climate",
      zone_type: "climate",
      status: "active",
      points: [
        { point_id: POINT_IDS.airTemperature, code: "air_temperature", role: "primary_sensor" },
        { point_id: POINT_IDS.fanPower, code: "fan_power", role: "actuator" },
      ],
    },
  ],
  points: [
    {
      id: POINT_IDS.airTemperature,
      code: "air_temperature",
      name: "Air temperature",
      point_kind: "measurement",
      metric_type: "air_temperature",
      data_type: "float",
      unit: "°C",
      status: "active",
      state: { value: 23.4, quality: "good", observed_at: "2026-08-01T09:00:00Z" },
    },
    {
      id: POINT_IDS.airHumidity,
      code: "air_humidity",
      name: "Air humidity",
      point_kind: "measurement",
      metric_type: "air_humidity",
      data_type: "float",
      unit: "%",
      status: "active",
      state: { value: 61, quality: "good", observed_at: "2026-08-01T09:00:00Z" },
    },
    {
      id: POINT_IDS.soilMoisture,
      code: "soil_moisture",
      name: "Soil moisture",
      point_kind: "measurement",
      metric_type: "soil_moisture",
      data_type: "float",
      unit: "%",
      status: "active",
      state: { value: null, quality: "no_data", observed_at: null },
    },
    {
      id: POINT_IDS.fanRunning,
      code: "fan_running",
      name: "Fan running",
      point_kind: "measurement",
      metric_type: "fan_running",
      data_type: "boolean",
      unit: null,
      status: "active",
      state: { value: false, quality: "good", observed_at: "2026-08-01T09:00:00Z" },
    },
    {
      id: POINT_IDS.fanPower,
      code: "fan_power",
      name: "Fan power",
      point_kind: "control",
      metric_type: "fan_power",
      data_type: "float",
      unit: "%",
      status: "active",
      state: { value: 40, quality: "good", observed_at: "2026-08-01T09:00:00Z" },
    },
  ],
};

/** A facility that exists but has no zones or points, as the backend answers it. */
export const emptyFacilityConfiguration = {
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

/**
 * `GET /api/v1/points/{id}/telemetry?limit=100`, newest first.
 *
 * The backend orders by `observed_at DESC, id DESC`; these fixtures keep that
 * order so a client that forgets to reverse it draws a backwards time axis and
 * fails the chart test.
 */
export function telemetryHistory(count: number, pointId = POINT_IDS.airTemperature) {
  const base = Date.parse("2026-08-01T09:00:00Z");
  const items = Array.from({ length: count }, (_, index) => {
    const observedAt = new Date(base - index * 60_000).toISOString();
    return {
      id: `aaaaaaaa-0000-4000-8000-${String(index).padStart(12, "0")}`,
      point_id: pointId,
      value: 20 + (count - index) * 0.1,
      unit: "°C",
      observed_at: observedAt,
      received_at: observedAt,
      quality: "good",
    };
  });
  return { items };
}
