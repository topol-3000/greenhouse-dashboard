import { describe, expect, it } from "vitest";
import {
  buildBreadcrumbs,
  documentTitleFor,
  HOME_PATH,
  matchPortalRoute,
  NOT_FOUND_TITLE,
  pageTitleFor,
  portalRoutes,
  primaryNavigationRoutes,
} from "./routes";

describe("the route table", () => {
  it("serves the dashboard at the portal root", () => {
    expect(matchPortalRoute(HOME_PATH)?.title).toBe("Dashboard");
    expect(pageTitleFor("/")).toBe("Dashboard");
  });

  it("matches nothing for an unknown address", () => {
    expect(matchPortalRoute("/facilities")).toBeNull();
    expect(pageTitleFor("/facilities")).toBe(NOT_FOUND_TITLE);
  });

  it("offers only routes that exist in the primary navigation", () => {
    const paths = new Set(portalRoutes.map((route) => route.path));
    for (const route of primaryNavigationRoutes) {
      expect(paths.has(route.path)).toBe(true);
    }
    expect(primaryNavigationRoutes.map((route) => route.title)).toEqual(["Dashboard"]);
  });

  it("names the Customer Portal in the document title", () => {
    expect(documentTitleFor("/")).toBe("Dashboard · AI Greenhouse Customer Portal");
  });

  it("renders no breadcrumb trail for a top-level page", () => {
    expect(buildBreadcrumbs("/")).toEqual([{ label: "Dashboard" }]);
  });

  it("leads an unknown address back to the dashboard", () => {
    expect(buildBreadcrumbs("/nope")).toEqual([
      { label: "Dashboard", to: "/" },
      { label: NOT_FOUND_TITLE },
    ]);
  });
});
