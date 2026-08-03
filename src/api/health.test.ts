import { describe, expect, it } from "vitest";
import { installFetchMock } from "../test/harness";
import { ParseError } from "./errors";
import { fetchHealth, parseHealth } from "./health";

describe("the health contract", () => {
  it("reads the published document", () => {
    expect(parseHealth({ status: "ok", service: "greenhouse", database: "ok" })).toEqual({
      status: "ok",
      service: "greenhouse",
      database: "ok",
    });
  });

  it("ignores unknown additive fields", () => {
    expect(
      parseHealth({ status: "ok", service: "greenhouse", database: "ok", version: "9" }),
    ).toEqual({ status: "ok", service: "greenhouse", database: "ok" });
  });

  it("rejects a document that does not match the contract", () => {
    expect(() => parseHealth({ status: "fine", service: "x", database: "ok" })).toThrow(ParseError);
    expect(() => parseHealth(null)).toThrow(ParseError);
  });

  it("reads a 503 body rather than discarding it", async () => {
    installFetchMock({
      "/health": {
        status: 503,
        body: { status: "unavailable", service: "greenhouse", database: "unavailable" },
      },
    });

    await expect(fetchHealth()).resolves.toEqual({
      status: "unavailable",
      service: "greenhouse",
      database: "unavailable",
    });
  });

  it("requests the backend's unversioned health endpoint", async () => {
    const api = installFetchMock({
      "/health": { body: { status: "ok", service: "greenhouse", database: "ok" } },
    });

    await fetchHealth();
    expect(api.calls).toEqual(["/health"]);
  });
});
