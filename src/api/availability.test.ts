import { describe, expect, it } from "vitest";
import { describeAvailability } from "./availability";
import type { HealthQuerySnapshot } from "./availability";
import { ApiConfigError, NetworkError } from "./errors";

function snapshot(overrides: Partial<HealthQuerySnapshot> = {}): HealthQuerySnapshot {
  return {
    isPending: false,
    isFetching: false,
    data: undefined,
    error: null,
    dataUpdatedAt: 0,
    errorUpdatedAt: 0,
    ...overrides,
  };
}

describe("cloud API availability", () => {
  it("is checking before the first answer, not unavailable", () => {
    const availability = describeAvailability(snapshot({ isPending: true, isFetching: true }));
    expect(availability.kind).toBe("checking");
    expect(availability.label).toBe("Checking");
    expect(availability.checkedAt).toBeNull();
  });

  it("is available when the backend reports itself and its database healthy", () => {
    const availability = describeAvailability(
      snapshot({
        data: { status: "ok", service: "greenhouse", database: "ok" },
        dataUpdatedAt: 1_700_000_000_000,
      }),
    );
    expect(availability.kind).toBe("available");
    expect(availability.label).toBe("Available");
    expect(availability.detail).toContain("greenhouse");
    expect(availability.checkedAt).toBe(1_700_000_000_000);
  });

  it("is degraded when the backend answers but reports a problem", () => {
    const availability = describeAvailability(
      snapshot({
        data: { status: "unavailable", service: "greenhouse", database: "unavailable" },
        dataUpdatedAt: 1,
      }),
    );
    expect(availability.kind).toBe("degraded");
    expect(availability.detail).toContain("database");
  });

  it("is unavailable when the request failed", () => {
    const availability = describeAvailability(
      snapshot({ error: new NetworkError("no route"), errorUpdatedAt: 5 }),
    );
    expect(availability.kind).toBe("unavailable");
    expect(availability.label).toBe("Unavailable");
    expect(availability.detail).toBe("The portal could not reach the cloud API.");
  });

  it("names a misconfigured deployment instead of blaming the backend", () => {
    const availability = describeAvailability(
      snapshot({
        error: new ApiConfigError("VITE_API_BASE_URL must use http or https."),
        errorUpdatedAt: 5,
      }),
    );
    expect(availability.kind).toBe("unavailable");
    expect(availability.detail).toContain("This portal is misconfigured.");
    expect(availability.detail).toContain("VITE_API_BASE_URL");
  });

  it("marks a recheck over an answer it already has", () => {
    const availability = describeAvailability(
      snapshot({
        isFetching: true,
        data: { status: "ok", service: "greenhouse", database: "ok" },
        dataUpdatedAt: 1,
      }),
    );
    expect(availability.isRechecking).toBe(true);
  });
});
