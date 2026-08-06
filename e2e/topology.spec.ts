/**
 * The topology experience in a real browser, over the production bundle.
 *
 * This is the unit's observable outcome end to end: open the portal, walk
 * Dashboard → Greenhouses → Facility → ControlZone, arrive at a nested address
 * directly, refresh it, and use the browser's own back and forward buttons —
 * plus the states that are not the happy path: an empty topology, a cloud API
 * that cannot be reached, and a facility that does not exist.
 */

import { expect, test } from "@playwright/test";
import { DEFAULT_TOPOLOGY, E2E_IDS, EMPTY_TOPOLOGY, mockHealth, mockTopology } from "./fixtures";

const FACILITY_URL = `/facilities/${E2E_IDS.northGreenhouse}`;
const ZONE_URL = `${FACILITY_URL}/zones/${E2E_IDS.climateZone}`;

test.describe("navigating the topology", () => {
  test("walks Dashboard → Greenhouses → Facility → ControlZone", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);
    await page.goto("/");

    await expect(page.getByTestId("dashboard-topology")).toContainText(
      "Sites reported by the cloud API",
    );

    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", {
        name: "Greenhouses",
      })
      .click();
    await expect(page).toHaveURL(/\/sites$/);
    await expect(page.getByTestId("site-card")).toHaveCount(2);
    await expect(page.getByRole("heading", { name: "Riverside Growing Site" })).toBeVisible();
    // A site with no facilities is described, not hidden and not filled in.
    await expect(page.getByTestId("site-without-facilities")).toContainText(
      "The cloud API returns no facilities for this site",
    );

    await page.getByRole("link", { name: "North Greenhouse" }).click();
    await expect(page).toHaveURL(new RegExp(`${FACILITY_URL}$`));
    await expect(page.getByRole("heading", { level: 1, name: "North Greenhouse" })).toBeVisible();
    await expect(page.getByTestId("facility-relationship")).toContainText(
      "is a facility of the site Riverside Growing Site",
    );

    await page.getByRole("link", { name: "North Climate" }).click();
    await expect(page).toHaveURL(new RegExp(`${ZONE_URL}$`));
    await expect(page.getByRole("heading", { level: 1, name: "North Climate" })).toBeVisible();
    await expect(page.getByTestId("zone-relationship")).toContainText(
      "is a control zone of the facility North Greenhouse, which belongs to the site Riverside Growing Site",
    );
    await expect(page).toHaveTitle("North Climate · AI Greenhouse Customer Portal");
  });

  test("restores the same resource after a direct load and a refresh", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);

    // A nested address typed or shared, served by the SPA fallback.
    await page.goto(ZONE_URL);
    await expect(page.getByRole("heading", { level: 1, name: "North Climate" })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "North Climate" })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${ZONE_URL}$`));

    await page.goto(FACILITY_URL);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "North Greenhouse" })).toBeVisible();
  });

  test("keeps browser back and forward working across resources", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);

    await page.goto("/sites");
    await page.getByRole("link", { name: "North Greenhouse" }).click();
    await page.getByRole("link", { name: "North Climate" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "North Climate" })).toBeVisible();

    await page.goBack();
    await expect(page.getByRole("heading", { level: 1, name: "North Greenhouse" })).toBeVisible();

    await page.goBack();
    await expect(page.getByRole("heading", { level: 1, name: "Greenhouses" })).toBeVisible();

    await page.goForward();
    await expect(page.getByRole("heading", { level: 1, name: "North Greenhouse" })).toBeVisible();
  });

  test("switches facility without carrying the control zone across", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);
    await page.goto(ZONE_URL);
    await expect(page.getByRole("heading", { level: 1, name: "North Climate" })).toBeVisible();

    await page
      .getByRole("combobox", { name: "Switch facility" })
      .selectOption(E2E_IDS.seedlingRoom);

    await expect(page).toHaveURL(new RegExp(`/facilities/${E2E_IDS.seedlingRoom}$`));
    await expect(page.getByRole("heading", { level: 1, name: "Seedling Room" })).toBeVisible();
    await expect(page.getByTestId("control-zone-page")).toHaveCount(0);
  });

  test("refuses a control zone under a facility it does not belong to", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);

    await page.goto(`/facilities/${E2E_IDS.seedlingRoom}/zones/${E2E_IDS.climateZone}`);

    await expect(page.getByTestId("relationship-mismatch")).toContainText(
      "This control zone belongs to a different facility",
    );
    await expect(page.getByTestId("zone-points")).toHaveCount(0);
  });
});

test.describe("topology states", () => {
  test("says there is no topology rather than inventing one", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page, EMPTY_TOPOLOGY);

    await page.goto("/sites");
    await expect(page.getByTestId("topology-empty")).toContainText(
      "No greenhouse topology is available through the API",
    );
    await expect(page.getByTestId("site-card")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /add|create|new/i })).toHaveCount(0);
  });

  test("keeps the shell usable when topology requests fail", async ({ page }) => {
    await mockHealth(page);
    const topology = await mockTopology(page);
    topology.setUnreachable(true);

    await page.goto("/sites");

    await expect(page.getByTestId("request-error")).toContainText(
      "The portal could not reach the cloud API",
    );
    // Not a blank error screen: the whole portal is still there and still works.
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Greenhouses" })).toBeVisible();

    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Dashboard" })
      .click();
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
    await expect(page.getByTestId("api-status")).toHaveText("Cloud API: Available");
  });

  test("shows a resource-level not-found inside the portal shell", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);

    await page.goto(`/facilities/${E2E_IDS.unknownFacility}`);

    await expect(page.getByTestId("resource-not-found")).toContainText(
      "This facility is not in the cloud API",
    );
    // Distinct from the catch-all portal 404, and still inside the shell.
    await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to Greenhouses" })).toBeVisible();
  });

  test("keeps the Greenhouses overview free of readings", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);

    // A reading belongs to a point, which belongs to a zone. The overview is
    // every site and facility, so a reading has no zone to be read under there.
    await page.goto("/sites");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const text = (await page.locator("body").innerText()).toLowerCase();
    for (const forbidden of [
      "setpoint",
      "latest reading",
      "actuator",
      "command",
      "automation",
      "simulation",
      "grow cycle",
    ]) {
      expect(text).not.toContain(forbidden);
    }
    expect(text).not.toMatch(/\d+(\.\d+)?\s?(°c|°f|lx|ppm|kpa)/);
    await expect(page.getByTestId("monitoring")).toHaveCount(0);
    await expect(page.getByTestId("facility-readings")).toHaveCount(0);
  });

  test("reads a facility's values under the zone that owns them", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);

    await page.goto(FACILITY_URL);
    await expect(page.getByTestId("facility-readings")).toBeVisible();

    // The reading is inside the group named for the zone the API assigns the
    // point to, and it links into that zone carrying the point.
    const climate = page.locator(`[data-zone-id="${E2E_IDS.climateZone}"]`);
    await expect(climate).toBeVisible();
    await expect(climate.getByTestId("measurement-value").first()).toContainText("21.4");

    // The zone workspace's own monitoring and control still belong to the zone.
    await expect(page.getByTestId("monitoring")).toHaveCount(0);
    await expect(page.getByTestId("manual-control")).toHaveCount(0);

    const text = (await page.locator("body").innerText()).toLowerCase();
    for (const forbidden of ["setpoint", "actuator", "command", "automation", "average"]) {
      expect(text).not.toContain(forbidden);
    }
  });

  test("asks only for the read endpoints the contract publishes", async ({ page }) => {
    await mockHealth(page);
    const topology = await mockTopology(page);

    await page.goto(ZONE_URL);
    await expect(page.getByTestId("zone-points")).toBeVisible();
    await expect(page.getByTestId("measurement-cards")).toBeVisible();

    for (const request of topology.requests()) {
      expect(request).toMatch(/^\/api\/v1\/(sites|facilities|control-zones|points)(\/|\?)/);
    }
    // The configuration document is the one current-state read: no per-point
    // state request, and nothing from the control plane.
    expect(topology.requests().some((request) => request.includes("/state"))).toBe(false);
    expect(topology.requests().some((request) => request.includes("/commands"))).toBe(false);
    expect(topology.requests().some((request) => request.includes("/control-loops"))).toBe(false);
    expect(topology.requests().some((request) => request.includes("/gateways"))).toBe(false);
    // Telemetry is asked for only once a point has been chosen.
    expect(topology.requests().some((request) => request.includes("/telemetry"))).toBe(false);

    // Pagination is requested with the contract's window, at its maximum page.
    expect(topology.requests()).toContain("/api/v1/sites?limit=200&offset=0");
  });

  test("keeps the sites count honest against the dataset the API serves", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page, DEFAULT_TOPOLOGY);

    await page.goto("/");
    const summary = page.getByTestId("dashboard-topology");
    await expect(summary).toContainText("Sites reported by the cloud API");
    await expect(summary).toContainText("2");
    await expect(page.getByTestId("incomplete-collection")).toHaveCount(0);
  });
});
