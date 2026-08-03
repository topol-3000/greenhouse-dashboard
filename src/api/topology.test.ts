/**
 * The topology client against the checked-in contract.
 *
 * These assert the exact URLs the portal builds, the decoding of the published
 * schemas, and the two safety properties route parameters make necessary:
 * identifiers are encoded rather than interpolated, and a request that is
 * superseded is cancelled rather than left to resolve.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, ParseError } from "./errors";
import {
  fetchControlZone,
  fetchControlZonePoints,
  fetchControlZones,
  fetchFacilities,
  fetchFacility,
  fetchSites,
  isResourceMissing,
  parseControlZone,
  parseFacility,
  parseSite,
  parseZonePointAssignment,
  resourcePath,
  sameResourceId,
} from "./topology";
import {
  climateZone,
  climateZonePoints,
  northGreenhouse,
  page,
  riversideSite,
} from "../test/fixtures";

function stubJson(body: unknown, status = 200) {
  const fetchStub = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
  vi.stubGlobal("fetch", fetchStub);
  return fetchStub;
}

function requestedUrl(fetchStub: ReturnType<typeof stubJson>, call = 0): string {
  const input = fetchStub.mock.calls[call]?.[0];
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input?.url ?? "";
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("topology URLs", () => {
  it("asks for the site collection with the contract's page window", async () => {
    const fetchStub = stubJson(page([riversideSite]));
    await fetchSites();
    expect(requestedUrl(fetchStub)).toBe("/api/v1/sites?limit=200&offset=0");
  });

  it("asks the backend to filter zones by facility rather than filtering locally", async () => {
    const fetchStub = stubJson(page([climateZone]));
    await fetchControlZones(northGreenhouse.id);
    expect(requestedUrl(fetchStub)).toBe(
      `/api/v1/control-zones?limit=200&offset=0&facility_id=${northGreenhouse.id}`,
    );
  });

  it("resolves one facility directly instead of listing every facility", async () => {
    const fetchStub = stubJson(northGreenhouse);
    await fetchFacility(northGreenhouse.id);
    expect(requestedUrl(fetchStub)).toBe(`/api/v1/facilities/${northGreenhouse.id}`);
  });

  it("sends the site filter the contract publishes when one is asked for", async () => {
    const fetchStub = stubJson(page([northGreenhouse]));
    await fetchFacilities({ siteId: riversideSite.id });
    expect(requestedUrl(fetchStub)).toBe(
      `/api/v1/facilities?limit=200&offset=0&site_id=${riversideSite.id}`,
    );
  });

  it("reads a zone's composition from the zone's own sub-collection", async () => {
    const fetchStub = stubJson(page(climateZonePoints));
    await fetchControlZonePoints(climateZone.id);
    expect(requestedUrl(fetchStub)).toBe(
      `/api/v1/control-zones/${climateZone.id}/points?limit=200&offset=0`,
    );
  });

  it("encodes an identifier from the address bar instead of interpolating it", () => {
    // A route parameter is untrusted text: it must not be able to add a path
    // segment, a query string or a traversal to the request.
    expect(resourcePath("/api/v1/facilities", "../../health")).toBe(
      "/api/v1/facilities/..%2F..%2Fhealth",
    );
    expect(resourcePath("/api/v1/facilities", "a b?c=1#d")).toBe(
      "/api/v1/facilities/a%20b%3Fc%3D1%23d",
    );
    expect(resourcePath("/api/v1/facilities", "x".repeat(300))).toBe(
      `/api/v1/facilities/${"x".repeat(300)}`,
    );
  });

  it("cancels a superseded request through the caller's signal", async () => {
    const controller = new AbortController();
    const fetchStub = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });
    vi.stubGlobal("fetch", fetchStub);

    const pending = fetchSites({ signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchStub.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });
});

describe("topology decoding", () => {
  it("reads the published fields of every topology schema", () => {
    expect(parseSite(riversideSite)).toEqual(riversideSite);
    expect(parseFacility(northGreenhouse)).toEqual(northGreenhouse);
    expect(parseControlZone(climateZone)).toEqual(climateZone);
    expect(parseZonePointAssignment(climateZonePoints[0])).toEqual(climateZonePoints[0]);
  });

  it("keeps a nullable unit as null rather than inventing one", () => {
    expect(parseZonePointAssignment(climateZonePoints[1]).unit).toBeNull();
  });

  it("keeps an enum value the portal has never seen instead of rejecting it", () => {
    // A backend that adds a facility type must not blank the page.
    const decoded = parseFacility({ ...northGreenhouse, facility_type: "vertical_farm" });
    expect(decoded.facility_type).toBe("vertical_farm");
  });

  it("ignores additive fields the portal does not know about", () => {
    const decoded = parseSite({ ...riversideSite, region: "north" });
    expect(decoded).toEqual(riversideSite);
  });

  it("refuses a response that is missing a field the contract requires", () => {
    const { site_id: _omitted, ...withoutSite } = northGreenhouse;
    expect(() => parseFacility(withoutSite)).toThrow(ParseError);
    expect(() => parseSite("not an object")).toThrow(ParseError);
  });
});

describe("resource identity", () => {
  it("treats a missing resource and a rejected identifier as resource-level", () => {
    expect(isResourceMissing(new ApiError("gone", 404))).toBe(true);
    expect(isResourceMissing(new ApiError("invalid", 422))).toBe(true);
    expect(isResourceMissing(new ApiError("boom", 500))).toBe(false);
    expect(isResourceMissing(new Error("offline"))).toBe(false);
  });

  it("compares identifiers without caring how they were typed into the URL", () => {
    expect(sameResourceId(climateZone.facility_id, northGreenhouse.id.toUpperCase())).toBe(true);
    expect(sameResourceId(climateZone.facility_id, ` ${northGreenhouse.id} `)).toBe(true);
    expect(sameResourceId(climateZone.facility_id, riversideSite.id)).toBe(false);
    expect(sameResourceId(undefined, northGreenhouse.id)).toBe(false);
  });
});

describe("topology failures", () => {
  it("raises the backend's status rather than a blank result", async () => {
    stubJson({ error: { code: "not_found" } }, 404);
    await expect(fetchControlZone(climateZone.id)).rejects.toBeInstanceOf(ApiError);
  });
});
