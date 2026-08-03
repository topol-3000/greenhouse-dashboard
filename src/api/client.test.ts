/**
 * The API boundary against backend-shaped fixtures.
 *
 * These assert the two things a client owes the backend: it asks for the exact
 * URL and query the contract documents, and it reads back exactly the fields
 * that contract publishes.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  API_ROOT,
  fetchFacilities,
  fetchFacilityConfiguration,
  fetchPointTelemetry,
  HISTORY_SAMPLE_LIMIT,
} from "./client";
import { ApiError, NetworkError, ParseError } from "./errors";
import {
  emptyFacilityPage,
  facilityConfiguration,
  facilityPage,
  FACILITY_ID,
  POINT_IDS,
  telemetryHistory,
} from "../test/fixtures";
import { urlOf } from "../test/harness";

function stubJson(body: unknown, status = 200) {
  const stub = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
  vi.stubGlobal("fetch", stub);
  return stub;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("URL construction", () => {
  it("asks for active facilities on a relative /api/v1 URL", async () => {
    const stub = stubJson(facilityPage);

    await fetchFacilities();

    const url = urlOf(stub.mock.calls[0]![0]);
    expect(url.startsWith(API_ROOT)).toBe(true);
    expect(url).toBe("/api/v1/facilities?status=active&limit=200");
  });

  it("never puts a backend host in the request", async () => {
    const stub = stubJson(facilityPage);

    await fetchFacilities();

    const url = urlOf(stub.mock.calls[0]![0]);
    expect(url).not.toMatch(/^https?:/);
    expect(url).not.toContain("localhost");
    expect(url).not.toContain("host.docker.internal");
  });

  it("reads a facility configuration by id", async () => {
    const stub = stubJson(facilityConfiguration);

    await fetchFacilityConfiguration(FACILITY_ID);

    expect(urlOf(stub.mock.calls[0]![0])).toBe(`/api/v1/facilities/${FACILITY_ID}/configuration`);
  });

  it("requests at most 100 telemetry samples", async () => {
    const stub = stubJson(telemetryHistory(100));

    await fetchPointTelemetry(POINT_IDS.airTemperature);

    expect(HISTORY_SAMPLE_LIMIT).toBe(100);
    expect(urlOf(stub.mock.calls[0]![0])).toBe(
      `/api/v1/points/${POINT_IDS.airTemperature}/telemetry?limit=100`,
    );
  });

  it("encodes an identifier that would otherwise break the path", async () => {
    const stub = stubJson(telemetryHistory(1));

    await fetchPointTelemetry("a/b?c");

    expect(urlOf(stub.mock.calls[0]![0])).toBe("/api/v1/points/a%2Fb%3Fc/telemetry?limit=100");
  });
});

describe("parsing", () => {
  it("reads the facility page envelope", async () => {
    stubJson(facilityPage);

    const page = await fetchFacilities();

    expect(page.total).toBe(2);
    expect(page.items).toHaveLength(2);
    expect(page.items[0]).toMatchObject({
      id: FACILITY_ID,
      name: "Basil Growbox",
      facility_type: "growbox",
      status: "active",
    });
  });

  it("reads a clean backend's empty facility page", async () => {
    stubJson(emptyFacilityPage);

    const page = await fetchFacilities();

    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
  });

  it("reads the configuration document's facility, site, zones and points", async () => {
    stubJson(facilityConfiguration);

    const document_ = await fetchFacilityConfiguration(FACILITY_ID);

    expect(document_.facility.name).toBe("Basil Growbox");
    expect(document_.site.name).toBe("Home");
    expect(document_.site.timezone).toBe("UTC");
    expect(document_.control_zones).toHaveLength(1);
    expect(document_.control_zones[0]!.points).toHaveLength(2);
    expect(document_.points).toHaveLength(5);
  });

  it("keeps a never-reported point as null rather than zero", async () => {
    stubJson(facilityConfiguration);

    const document_ = await fetchFacilityConfiguration(FACILITY_ID);
    const soil = document_.points.find((point) => point.code === "soil_moisture");

    expect(soil?.state.value).toBeNull();
    expect(soil?.state.quality).toBe("no_data");
    expect(soil?.state.observed_at).toBeNull();
  });

  it("returns telemetry in the backend's newest-first order", async () => {
    stubJson(telemetryHistory(100));

    const history = await fetchPointTelemetry(POINT_IDS.airTemperature);

    expect(history.items).toHaveLength(100);
    const first = Date.parse(history.items[0]!.observed_at);
    const last = Date.parse(history.items[99]!.observed_at);
    expect(first).toBeGreaterThan(last);
  });

  it("ignores unknown additive fields", async () => {
    stubJson({
      ...facilityConfiguration,
      new_top_level_block: { anything: true },
      facility: { ...facilityConfiguration.facility, new_facility_field: 7 },
      points: facilityConfiguration.points.map((point) => ({
        ...point,
        calibration_offset: 1.5,
        state: { ...point.state, new_state_field: "x" },
      })),
    });

    const document_ = await fetchFacilityConfiguration(FACILITY_ID);

    expect(document_.points).toHaveLength(5);
    expect(document_.facility.name).toBe("Basil Growbox");
    expect(document_.malformed_point_count).toBe(0);
  });

  it("drops an unreadable point and counts it instead of failing the document", async () => {
    stubJson({
      ...facilityConfiguration,
      points: [facilityConfiguration.points[0], { code: "broken", name: "No identifier" }],
    });

    const document_ = await fetchFacilityConfiguration(FACILITY_ID);

    expect(document_.points).toHaveLength(1);
    expect(document_.malformed_point_count).toBe(1);
  });

  it("drops a sample with an unusable observed_at and counts it", async () => {
    const history = telemetryHistory(3);
    stubJson({
      items: [
        history.items[0],
        { ...history.items[1], observed_at: "not-a-timestamp" },
        { ...history.items[2], observed_at: undefined },
      ],
    });

    const parsed = await fetchPointTelemetry(POINT_IDS.airTemperature);

    expect(parsed.items).toHaveLength(1);
    expect(parsed.malformed_sample_count).toBe(2);
  });

  it("raises ParseError when the document is not the documented shape", async () => {
    stubJson({ unexpected: true });

    await expect(fetchFacilityConfiguration(FACILITY_ID)).rejects.toBeInstanceOf(ParseError);
  });

  it("raises ParseError when a collection is not a list", async () => {
    stubJson({ items: "nope" });

    await expect(fetchFacilities()).rejects.toBeInstanceOf(ParseError);
  });
});

describe("failures", () => {
  it("raises ApiError with the backend error code", async () => {
    stubJson({ error: { code: "facility_not_found", message: "unknown" } }, 404);

    const failure = await fetchFacilityConfiguration(FACILITY_ID).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).status).toBe(404);
    expect((failure as ApiError).code).toBe("facility_not_found");
  });

  it("raises NetworkError when the request never completes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
    );

    await expect(fetchFacilities()).rejects.toBeInstanceOf(NetworkError);
  });

  it("passes an abort signal through so a superseded request is cancelled", async () => {
    const stub = stubJson(facilityPage);
    const controller = new AbortController();

    await fetchFacilities(controller.signal);

    expect(stub.mock.calls[0]![1]?.signal).toBe(controller.signal);
  });
});
