/**
 * The monitoring boundary: the URLs it builds and the responses it accepts.
 *
 * The assertions are about the published contract — the exact paths, the
 * `limit` the telemetry operation declares, the fields each schema requires —
 * so a change in what the portal sends is a failing test rather than a request
 * the backend quietly rejects.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { ParseError } from "./errors";
import {
  fetchFacilityConfiguration,
  fetchPointTelemetry,
  parseFacilityConfiguration,
  parseTelemetryWindow,
} from "./monitoring";

const CONFIGURATION = {
  facility: {
    id: "8a2d0e4b-7c2f-4a38-8c7e-6a3c2d0e0001",
    name: "North Greenhouse",
    code: "north-gh",
    facility_type: "greenhouse",
    status: "active",
  },
  site: {
    id: "6f1c9f3a-6b1e-4f27-9b6d-5f2b1c9d0001",
    name: "Riverside Growing Site",
    code: "riverside",
    timezone: "Europe/Kyiv",
  },
  control_zones: [
    {
      id: "9b3e1f5c-8d30-4b49-9d8f-7b4d3e1f0001",
      name: "North Climate",
      code: "north-climate",
      zone_type: "climate",
      status: "active",
      points: [
        {
          point_id: "bb000000-0000-4000-8000-000000000001",
          code: "north-air-temp",
          role: "primary_measurement",
        },
      ],
    },
  ],
  points: [
    {
      id: "bb000000-0000-4000-8000-000000000001",
      code: "north-air-temp",
      name: "North air temperature",
      point_kind: "measurement",
      metric_type: "air_temperature",
      data_type: "float",
      unit: "degC",
      status: "active",
      state: { value: 21.4, quality: "good", observed_at: "2026-01-04T09:05:00Z" },
    },
  ],
};

/** Stub `fetch` with one JSON answer and record what it was asked for. */
function stubFetch(body: unknown, status = 200) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      calls.push(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the facility configuration request", () => {
  it("asks the contract's path and sends no include_archived", async () => {
    const calls = stubFetch(CONFIGURATION);

    await fetchFacilityConfiguration("8a2d0e4b-7c2f-4a38-8c7e-6a3c2d0e0001");

    expect(calls).toEqual([
      "/api/v1/facilities/8a2d0e4b-7c2f-4a38-8c7e-6a3c2d0e0001/configuration",
    ]);
  });

  it("percent-encodes an identifier from the address bar", async () => {
    const calls = stubFetch(CONFIGURATION);

    await fetchFacilityConfiguration("../../edge/telemetry");

    expect(calls[0]).toBe("/api/v1/facilities/..%2F..%2Fedge%2Ftelemetry/configuration");
  });

  it("keeps a value of zero, false and null exactly as the API sent them", () => {
    const parsed = parseFacilityConfiguration({
      ...CONFIGURATION,
      points: [
        {
          ...CONFIGURATION.points[0],
          id: "p1",
          state: { value: 0, quality: "good", observed_at: null },
        },
        {
          ...CONFIGURATION.points[0],
          id: "p2",
          state: { value: false, quality: "good", observed_at: null },
        },
        {
          ...CONFIGURATION.points[0],
          id: "p3",
          state: { value: null, quality: "no_data", observed_at: null },
        },
      ],
    });

    expect(parsed.points.map((point) => point.state.value)).toEqual([0, false, null]);
  });

  it("rejects a document that does not match the published schema", () => {
    expect(() => parseFacilityConfiguration({ facility: {}, site: {} })).toThrow(ParseError);
  });
});

describe("the telemetry request", () => {
  it("asks the contract's path with the requested limit", async () => {
    const calls = stubFetch({ items: [] });

    await fetchPointTelemetry("bb000000-0000-4000-8000-000000000001", { limit: 200 });

    expect(calls).toEqual([
      "/api/v1/points/bb000000-0000-4000-8000-000000000001/telemetry?limit=200",
    ]);
  });

  it("never asks for more than the limit the contract allows", async () => {
    const calls = stubFetch({ items: [] });

    await fetchPointTelemetry("p1", { limit: 100_000 });

    expect(calls[0]).toBe("/api/v1/points/p1/telemetry?limit=1000");
  });

  it("reports how many entries it could not read instead of losing the window", () => {
    const window = parseTelemetryWindow(
      {
        items: [
          {
            id: "s1",
            point_id: "p1",
            value: 21.4,
            unit: "degC",
            observed_at: "2026-01-04T09:00:00Z",
            received_at: "2026-01-04T09:00:01Z",
            quality: "good",
          },
          { id: "s2", point_id: "p1" },
          {
            id: "s3",
            point_id: "p1",
            value: 22.1,
            unit: "degC",
            observed_at: "2026-01-04T09:01:00Z",
            received_at: "2026-01-04T09:01:01Z",
            quality: "good",
          },
        ],
      },
      200,
    );

    expect(window.items.map((sample) => sample.id)).toEqual(["s1", "s3"]);
    expect(window.unreadableCount).toBe(1);
    expect(window.requestedLimit).toBe(200);
  });

  it("rejects an envelope with no items list", () => {
    expect(() => parseTelemetryWindow({ total: 3 }, 200)).toThrow(ParseError);
  });

  it("accepts an empty window as an answer rather than a failure", () => {
    const window = parseTelemetryWindow({ items: [] }, 200);
    expect(window.items).toHaveLength(0);
    expect(window.unreadableCount).toBe(0);
  });
});
