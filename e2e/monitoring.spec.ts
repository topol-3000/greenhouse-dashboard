/**
 * The monitoring experience in a real browser, over the production bundle.
 *
 * This is Unit 3's observable outcome end to end: walk to a real control zone,
 * read what its measurement points last reported, open one point's telemetry
 * history, and share or refresh that address. The unhappy paths are here too,
 * because they are the ones that tell whether the portal is honest: a point
 * that has never reported, a point with no stored history, a history endpoint
 * that fails while the current values stay on screen, and a background refresh
 * that fails over data the customer is still reading.
 */

import { expect, test } from "@playwright/test";
import { E2E_IDS, mockHealth, mockTopology } from "./fixtures";

const FACILITY_URL = `/facilities/${E2E_IDS.northGreenhouse}`;
const ZONE_URL = `${FACILITY_URL}/zones/${E2E_IDS.climateZone}`;
const IRRIGATION_URL = `${FACILITY_URL}/zones/${E2E_IDS.irrigationZone}`;

/** The measurement card for one point, found by the identifier the API sent. */
function card(page: import("@playwright/test").Page, pointId: string) {
  return page.locator(`[data-point-id="${pointId}"]`);
}

test.describe("reading a control zone's measurements", () => {
  test("walks Dashboard → Greenhouses → Facility → ControlZone → monitoring", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);
    await page.goto("/");

    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Greenhouses" })
      .click();
    await page.getByRole("link", { name: "North Greenhouse" }).click();
    await page.getByRole("link", { name: "North Climate" }).click();

    await expect(page).toHaveURL(new RegExp(`${ZONE_URL}$`));
    await expect(page.getByRole("region", { name: "Monitoring" })).toBeVisible();

    // Three measurement points, and neither of the two points that are not
    // measurements — one of which is named to look like one.
    await expect(page.getByTestId("measurement-card")).toHaveCount(3);
    await expect(card(page, E2E_IDS.airTempPoint)).toContainText("21.4 degC");
    await expect(card(page, E2E_IDS.co2Point)).toContainText("0 ppm");
    await expect(card(page, E2E_IDS.ventPoint)).toHaveCount(0);

    // The control point stays visible as the zone's composition, with no value.
    await expect(page.getByTestId("zone-points")).toContainText("North air temperature vent");
  });

  test("tells a measured zero from a point that has never reported", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);
    await page.goto(ZONE_URL);

    await expect(card(page, E2E_IDS.co2Point).getByTestId("measurement-value")).toHaveText("0 ppm");
    await expect(card(page, E2E_IDS.soilMoisturePoint).getByTestId("measurement-value")).toHaveText(
      "No data yet",
    );
    // No unit is invented for the point the API published without one.
    await expect(card(page, E2E_IDS.soilMoisturePoint)).toContainText("Unit not provided");
  });

  test("says truthfully when a zone has no measurement points", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);
    await page.goto(IRRIGATION_URL);

    await expect(page.getByTestId("monitoring-empty")).toContainText(
      "No measurement points are assigned to this control zone",
    );
    await expect(page.getByTestId("measurement-card")).toHaveCount(0);
    await expect(page.getByTestId("request-error")).toHaveCount(0);
  });
});

test.describe("telemetry history", () => {
  test("loads a numeric point's history and keeps the zone address", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);
    await page.goto(ZONE_URL);

    await page.getByRole("button", { name: "Show history of North air temperature" }).click();

    const chart = page.getByTestId("history-chart");
    await expect(chart).toBeVisible();
    await expect(chart).toContainText("Telemetry history — North air temperature (degC)");
    await expect(chart).toContainText("3 plotted samples");

    // The workspace did not move: same facility, same zone, one query parameter.
    await expect(page).toHaveURL(new RegExp(`${ZONE_URL}\\?point=${E2E_IDS.airTempPoint}$`));
    await expect(page.getByRole("heading", { level: 1, name: "North Climate" })).toBeVisible();
    await expect(page.getByTestId("zone-points")).toBeVisible();

    // The window is described as bounded, never as the complete history.
    await expect(page.getByTestId("history-window")).toContainText("not its complete record");
  });

  test("survives a direct load and a refresh of a point's history", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);

    await page.goto(`${ZONE_URL}?point=${E2E_IDS.airTempPoint}`);
    await expect(page.getByTestId("history-chart")).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("history-chart")).toContainText("North air temperature");
    await expect(page.getByRole("heading", { level: 1, name: "North Climate" })).toBeVisible();
  });

  test("orders the loaded samples chronologically whatever order they arrive in", async ({
    page,
  }) => {
    await mockHealth(page);
    await mockTopology(page);
    await page.goto(`${ZONE_URL}?point=${E2E_IDS.airTempPoint}`);

    await page.getByText(/Show the \d+ loaded samples? as a table/).click();
    // The observation time is the row's header cell, so the first `td` is the
    // value.
    const values = page.getByTestId("sample-table").locator("tbody tr td:first-of-type");
    await expect(values).toHaveText(["20.1", "21.4", "22.9"]);
  });

  test("distinguishes a point with no stored history from a failed request", async ({ page }) => {
    await mockHealth(page);
    const topology = await mockTopology(page);
    await page.goto(`${ZONE_URL}?point=${E2E_IDS.soilMoisturePoint}`);

    await expect(page.getByTestId("history-empty")).toContainText(
      "No telemetry has been recorded for North soil moisture",
    );
    await expect(page.getByTestId("request-error")).toHaveCount(0);

    topology.setTelemetryUnreachable(true);
    await page.goto(`${ZONE_URL}?point=${E2E_IDS.airTempPoint}`);
    await expect(page.getByTestId("request-error")).toContainText(
      "Telemetry history for North air temperature could not be loaded",
    );
    await expect(page.getByTestId("history-empty")).toHaveCount(0);
  });

  test("keeps the current values when the history endpoint is unavailable", async ({ page }) => {
    await mockHealth(page);
    const topology = await mockTopology(page);
    topology.setTelemetryUnreachable(true);

    await page.goto(`${ZONE_URL}?point=${E2E_IDS.airTempPoint}`);

    await expect(page.getByTestId("request-error")).toBeVisible();
    // Current state is a separate read and is still on screen.
    await expect(card(page, E2E_IDS.airTempPoint)).toContainText("21.4 degC");
    await expect(page.getByTestId("measurement-card")).toHaveCount(3);
  });

  test("selects a point with the keyboard", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);
    await page.goto(ZONE_URL);

    const button = page.getByRole("button", { name: "Show history of North CO2" });
    await button.focus();
    await expect(button).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page.getByTestId("history-chart")).toContainText("North CO2 (ppm)");
    await expect(
      page.getByRole("button", { name: "Showing history of North CO2" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("monitoring under partial availability", () => {
  test("keeps the zone workspace when the configuration request fails", async ({ page }) => {
    await mockHealth(page);
    const topology = await mockTopology(page);
    topology.setConfigurationUnreachable(true);

    await page.goto(ZONE_URL);

    await expect(page.getByTestId("request-error")).toContainText(
      "Measurements could not be loaded",
    );
    // The workspace, the navigation and the shell keep working.
    await expect(page.getByTestId("zone-points")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "North Climate" })).toBeVisible();
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Greenhouses" })
      .click();
    await expect(page.getByRole("heading", { level: 1, name: "Greenhouses" })).toBeVisible();
  });

  test("keeps the loaded measurements when a refresh fails", async ({ page }) => {
    await mockHealth(page);
    const topology = await mockTopology(page);
    await page.goto(ZONE_URL);
    await expect(card(page, E2E_IDS.airTempPoint)).toContainText("21.4 degC");

    topology.setConfigurationUnreachable(true);
    await page.getByRole("button", { name: "Show history of North air temperature" }).click();
    await expect(page.getByTestId("history-chart")).toBeVisible();

    // Whatever happens to the refresh, the values the API last returned stay.
    await expect(card(page, E2E_IDS.airTempPoint)).toContainText("21.4 degC");
  });

  test("adds no control, command, alert or automation surface", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);
    await page.goto(`${ZONE_URL}?point=${E2E_IDS.airTempPoint}`);
    await expect(page.getByTestId("history-chart")).toBeVisible();

    const text = (await page.getByTestId("monitoring").innerText()).toLowerCase();
    for (const forbidden of [
      "desired",
      "setpoint",
      "turn on",
      "turn off",
      "command",
      "activity",
      "alert",
      "automation",
      "recipe",
      "grow cycle",
      "simulation",
    ]) {
      expect(text).not.toContain(forbidden);
    }
    await expect(page.getByTestId("monitoring").getByRole("switch")).toHaveCount(0);
    await expect(page.getByTestId("monitoring").getByRole("slider")).toHaveCount(0);
  });
});
