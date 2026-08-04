import { describe, expect, it } from "vitest";
import {
  buildBreadcrumbs,
  CONTROL_ZONE_PATH,
  controlZonePath,
  documentTitleFor,
  FACILITY_PATH,
  facilityPath,
  GREENHOUSES_PATH,
  HOME_PATH,
  matchPortalLocation,
  matchPortalRoute,
  NOT_FOUND_TITLE,
  pageTitleFor,
  portalRoutes,
  primaryNavigationRoutes,
  resolveRoutePath,
} from "./routes";

const FACILITY_ID = "8a2d0e4b-7c2f-4a38-8c7e-6a3c2d0e0001";
const ZONE_ID = "9b3e1f5c-8d30-4b49-9d8f-7b4d3e1f0001";

describe("the route table", () => {
  it("serves the dashboard at the portal root", () => {
    expect(matchPortalRoute(HOME_PATH)?.title).toBe("Dashboard");
    expect(pageTitleFor("/")).toBe("Dashboard");
  });

  it("serves the greenhouses overview at /sites", () => {
    expect(matchPortalRoute(GREENHOUSES_PATH)?.title).toBe("Greenhouses");
  });

  it("matches the nested facility and control zone routes with their parameters", () => {
    expect(matchPortalLocation(facilityPath(FACILITY_ID))).toMatchObject({
      route: { path: FACILITY_PATH },
      params: { facilityId: FACILITY_ID },
    });
    expect(matchPortalLocation(controlZonePath(FACILITY_ID, ZONE_ID))).toMatchObject({
      route: { path: CONTROL_ZONE_PATH },
      params: { facilityId: FACILITY_ID, zoneId: ZONE_ID },
    });
  });

  it("matches nothing for an unknown address", () => {
    expect(matchPortalRoute("/facilities")).toBeNull();
    expect(matchPortalRoute("/zones/abc")).toBeNull();
    expect(pageTitleFor("/facilities")).toBe(NOT_FOUND_TITLE);
  });

  it("offers exactly the working Dashboard, Greenhouses and Activity entries", () => {
    const paths = new Set(portalRoutes.map((route) => route.path));
    for (const route of primaryNavigationRoutes) {
      expect(paths.has(route.path)).toBe(true);
    }
    // Activity comes after Greenhouses, and the table's order is the
    // navigation's order.
    expect(primaryNavigationRoutes.map((route) => route.title)).toEqual([
      "Dashboard",
      "Greenhouses",
      "Activity",
    ]);
    // A parameterised route is reachable by link, never offered as a
    // destination the navigation could send someone to with no resource.
    expect(primaryNavigationRoutes.some((route) => route.path.includes(":"))).toBe(false);
  });

  it("names the Customer Portal in the document title", () => {
    expect(documentTitleFor("/")).toBe("Dashboard · AI Greenhouse Customer Portal");
  });

  it("uses the resolved resource name in the heading once it is known", () => {
    const path = facilityPath(FACILITY_ID);
    expect(pageTitleFor(path)).toBe("Facility");
    expect(pageTitleFor(path, { [FACILITY_PATH]: "North Greenhouse" })).toBe("North Greenhouse");
    expect(documentTitleFor(path, { [FACILITY_PATH]: "North Greenhouse" })).toBe(
      "North Greenhouse · AI Greenhouse Customer Portal",
    );
  });

  it("encodes identifiers when a route pattern is resolved to an address", () => {
    expect(resolveRoutePath(FACILITY_PATH, { facilityId: "a/b c" })).toBe("/facilities/a%2Fb%20c");
    expect(resolveRoutePath(FACILITY_PATH, {})).toBeNull();
    expect(facilityPath("a/b")).toBe("/facilities/a%2Fb");
    expect(controlZonePath("a/b", "c d")).toBe("/facilities/a%2Fb/zones/c%20d");
  });
});

describe("breadcrumbs", () => {
  it("renders no trail for a top-level page", () => {
    expect(buildBreadcrumbs("/")).toEqual([{ label: "Dashboard" }]);
  });

  it("puts Greenhouses under the dashboard", () => {
    expect(buildBreadcrumbs(GREENHOUSES_PATH)).toEqual([
      { label: "Dashboard", to: "/" },
      { label: "Greenhouses" },
    ]);
  });

  it("stays structurally understandable before the resource names resolve", () => {
    expect(buildBreadcrumbs(controlZonePath(FACILITY_ID, ZONE_ID))).toEqual([
      { label: "Dashboard", to: "/" },
      { label: "Greenhouses", to: GREENHOUSES_PATH },
      { label: "Facility", to: facilityPath(FACILITY_ID) },
      { label: "Control zone" },
    ]);
  });

  it("shows the resolved names once the queries have answered", () => {
    expect(
      buildBreadcrumbs(controlZonePath(FACILITY_ID, ZONE_ID), {
        [FACILITY_PATH]: "North Greenhouse",
        [CONTROL_ZONE_PATH]: "North Climate",
      }),
    ).toEqual([
      { label: "Dashboard", to: "/" },
      { label: "Greenhouses", to: GREENHOUSES_PATH },
      { label: "North Greenhouse", to: facilityPath(FACILITY_ID) },
      { label: "North Climate" },
    ]);
  });

  it("leads an unknown address back to the dashboard", () => {
    expect(buildBreadcrumbs("/nope")).toEqual([
      { label: "Dashboard", to: "/" },
      { label: NOT_FOUND_TITLE },
    ]);
  });
});
