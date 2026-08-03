import { describe, expect, it } from "vitest";
import { resolveApiBaseUrl } from "./config";

describe("API base URL configuration", () => {
  it("defaults to the same origin when it is not configured", () => {
    expect(resolveApiBaseUrl(undefined)).toEqual({ valid: true, baseUrl: "" });
    expect(resolveApiBaseUrl("")).toEqual({ valid: true, baseUrl: "" });
    expect(resolveApiBaseUrl("   ")).toEqual({ valid: true, baseUrl: "" });
  });

  it("accepts an absolute path for a proxy on a sub-path", () => {
    expect(resolveApiBaseUrl("/greenhouse-api")).toEqual({
      valid: true,
      baseUrl: "/greenhouse-api",
    });
  });

  it("accepts an absolute http(s) URL", () => {
    expect(resolveApiBaseUrl("https://api.example.com")).toEqual({
      valid: true,
      baseUrl: "https://api.example.com",
    });
  });

  it("strips a trailing slash so paths are appended exactly once", () => {
    expect(resolveApiBaseUrl("https://api.example.com/")).toEqual({
      valid: true,
      baseUrl: "https://api.example.com",
    });
    expect(resolveApiBaseUrl("/greenhouse-api/")).toEqual({
      valid: true,
      baseUrl: "/greenhouse-api",
    });
  });

  it("rejects a value carrying a query string or fragment", () => {
    const query = resolveApiBaseUrl("https://api.example.com?token=abc");
    expect(query.valid).toBe(false);
    expect(query.valid ? "" : query.reason).toContain("query string");

    expect(resolveApiBaseUrl("https://api.example.com#x").valid).toBe(false);
  });

  it("rejects a protocol-relative value", () => {
    const resolution = resolveApiBaseUrl("//api.example.com");
    expect(resolution.valid).toBe(false);
    expect(resolution.valid ? "" : resolution.reason).toContain("protocol-relative");
  });

  it("rejects a non-http scheme", () => {
    const resolution = resolveApiBaseUrl("ftp://api.example.com");
    expect(resolution.valid).toBe(false);
    expect(resolution.valid ? "" : resolution.reason).toContain("http");
  });

  it("rejects a value that is neither a path nor a URL", () => {
    const resolution = resolveApiBaseUrl("api.example.com");
    expect(resolution.valid).toBe(false);
    expect(resolution.valid ? "" : resolution.reason).toContain("VITE_API_BASE_URL");
  });
});
