/**
 * The control-loop client against the checked-in contract.
 *
 * The loop resource is the portal's newest read, and the thing most likely to be
 * got wrong about it is not the URL: it is decoding a threshold. A loop whose
 * numbers cannot be read is a loop the portal must refuse rather than describe
 * with a guess, so that is asserted alongside the request itself.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchControlLoops, parseControlLoop } from "./controlLoops";
import { ApiError, ParseError } from "./errors";
import { climateZone, northLampLoop, page } from "../test/fixtures";

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

describe("control-loop URLs", () => {
  it("asks the backend to filter loops by zone rather than filtering locally", async () => {
    const fetchStub = stubJson(page([northLampLoop]));
    await fetchControlLoops(climateZone.id);

    expect(requestedUrl(fetchStub)).toBe(
      `/api/v1/control-loops?limit=200&offset=0&control_zone_id=${climateZone.id}`,
    );
  });

  it("encodes an identifier from the address rather than interpolating it", async () => {
    const fetchStub = stubJson(page([]));
    await fetchControlLoops("a b?c=1#d");

    const url = requestedUrl(fetchStub);
    expect(url).toContain("control_zone_id=a+b%3Fc%3D1%23d");
    expect(url).not.toContain("?c=1");
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

    const pending = fetchControlLoops(climateZone.id, { signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchStub.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });
});

describe("control-loop decoding", () => {
  it("round-trips the published schema", () => {
    expect(parseControlLoop(northLampLoop)).toEqual(northLampLoop);
  });

  it("ignores a field the contract adds later", () => {
    expect(parseControlLoop({ ...northLampLoop, enabled: true })).toEqual(northLampLoop);
  });

  it("keeps a policy the portal has never seen rather than rejecting the loop", () => {
    // The schema's own description says the enum exists so a second policy can
    // arrive. A loop the backend configured is not made unreadable by that.
    const decoded = parseControlLoop({ ...northLampLoop, policy_type: "deadband-v2" });
    expect(decoded.policy_type).toBe("deadband-v2");
  });

  it("refuses a loop whose thresholds cannot be read as numbers", () => {
    // Rendering a threshold the portal had to guess at would be inventing the
    // one number the rule is actually about.
    const { lower_threshold: _omitted, ...withoutLower } = northLampLoop;
    expect(() => parseControlLoop(withoutLower)).toThrow(ParseError);
    expect(() => parseControlLoop({ ...northLampLoop, upper_threshold: "1200" })).toThrow(
      ParseError,
    );
    expect(() => parseControlLoop({ ...northLampLoop, upper_threshold: null })).toThrow(ParseError);
  });

  it("refuses a loop that names no point to measure or to drive", () => {
    const { control_point_id: _omitted, ...withoutControl } = northLampLoop;
    expect(() => parseControlLoop(withoutControl)).toThrow(ParseError);
  });
});

describe("control-loop failures", () => {
  it("reports a rejected identifier as an API error", async () => {
    stubJson({ error: { code: "not_found", message: "Not found" } }, 404);
    await expect(fetchControlLoops(climateZone.id)).rejects.toBeInstanceOf(ApiError);
  });
});
