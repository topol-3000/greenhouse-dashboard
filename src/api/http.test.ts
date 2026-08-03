import { describe, expect, it } from "vitest";
import { installFetchMock } from "../test/harness";
import { API_V1_PREFIX } from "./config";
import { ApiError, NetworkError } from "./errors";
import { apiUrl, getJson } from "./http";

describe("the API boundary", () => {
  it("builds same-origin URLs by default and encodes the query", () => {
    expect(apiUrl("/health")).toBe("/health");
    expect(apiUrl(`${API_V1_PREFIX}/sites`, { limit: 20, status: "active" })).toBe(
      "/api/v1/sites?limit=20&status=active",
    );
  });

  it("decodes a successful JSON body", async () => {
    installFetchMock({ "/health": { body: { status: "ok" } } });
    await expect(getJson("/health")).resolves.toEqual({ status: 200, body: { status: "ok" } });
  });

  it("normalises a failing status into an ApiError carrying the backend code", async () => {
    installFetchMock({
      "/api/v1/sites": { status: 422, body: { error: { code: "validation_error" } } },
    });

    const error = await getJson("/api/v1/sites").catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(422);
    expect((error as ApiError).code).toBe("validation_error");
  });

  it("normalises an unreachable backend into a NetworkError", async () => {
    installFetchMock({ "/health": { networkError: true } });
    await expect(getJson("/health")).rejects.toBeInstanceOf(NetworkError);
  });

  it("returns a status the caller declared as data instead of throwing", async () => {
    installFetchMock({ "/health": { status: 503, body: { status: "unavailable" } } });

    await expect(getJson("/health", { acceptStatuses: [503] })).resolves.toEqual({
      status: 503,
      body: { status: "unavailable" },
    });
    await expect(getJson("/health")).rejects.toBeInstanceOf(ApiError);
  });

  it("passes the caller's abort signal through to fetch", async () => {
    installFetchMock({ "/health": { body: {} } });
    const controller = new AbortController();
    controller.abort();

    const error = await getJson("/health", { signal: controller.signal }).catch(
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("AbortError");
  });
});
