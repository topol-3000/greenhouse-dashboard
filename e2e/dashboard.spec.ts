/**
 * Desktop browser smoke flow over the production bundle.
 *
 * This is the acceptance path end to end: choose a facility, read every active
 * measurement point, inspect a numeric point's history, watch new telemetry
 * arrive through polling, and survive a backend outage with a stale snapshot
 * and a working Retry.
 */

import { expect, test } from "@playwright/test";
import { HUMIDITY_POINT_ID, mockApi, OTHER_FACILITY_ID } from "./fixtures";

test.describe("owner monitoring", () => {
  test("shows a facility's measurement points and charts a numeric one", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1, name: "Greenhouse Monitor" })).toBeVisible();

    // Facility and site context.
    await expect(page.getByTestId("facility-context")).toContainText("Basil Growbox");
    await expect(page.getByTestId("facility-context")).toContainText("Home");

    // One card per active measurement point, control points excluded.
    const cards = page.getByTestId("measurement-card");
    await expect(cards).toHaveCount(3);

    const temperature = cards.filter({ has: page.getByText("Air temperature") });
    await expect(temperature.getByTestId("card-value")).toHaveText("23.4");
    await expect(temperature.getByTestId("card-unit")).toHaveText("°C");

    // A point that has never reported shows no-data, not zero.
    const humidity = cards.filter({ has: page.getByText("Air humidity") });
    await expect(humidity.getByTestId("card-value")).toHaveText("—");

    // The chart is present with a text summary beside it.
    await expect(page.getByTestId("chart-summary")).toContainText(
      "100 samples for Air temperature",
    );
    await expect(page.getByTestId("history-chart").locator("svg").first()).toBeVisible();
  });

  test("offers only numeric points for charting", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");

    await expect(page.getByTestId("chart-summary")).toBeVisible();
    const options = page.getByLabel("Charted measurement").locator("option");

    await expect(options).toHaveCount(2);
    await expect(options).toHaveText(["Air temperature (°C)", "Air humidity (%)"]);
  });

  test("picks up new telemetry through polling without a reload", async ({ page }) => {
    const api = await mockApi(page);
    await page.goto("/");

    const value = page
      .getByTestId("measurement-card")
      .filter({ has: page.getByText("Air temperature") })
      .getByTestId("card-value");
    await expect(value).toHaveText("23.4");

    // The backend starts reporting something new; the 5s configuration poll
    // must bring it in on its own.
    api.setTemperature(25.9);

    await expect(value).toHaveText("25.9", { timeout: 15_000 });
    // Still the same document — no full page navigation happened.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("keeps the last snapshot and marks it stale when the backend fails", async ({ page }) => {
    const api = await mockApi(page);
    await page.goto("/");

    await expect(page.getByTestId("facility-context")).toBeVisible();
    await expect(page.getByRole("status").first()).toContainText("Live");

    api.setFailing(true);

    const banner = page.getByRole("status").first();
    await expect(banner).toContainText("Stale", { timeout: 20_000 });
    await expect(banner).toContainText("last successful snapshot");

    // The data the owner was looking at is still on screen.
    await expect(page.getByTestId("measurement-card")).toHaveCount(3);
    await expect(
      page
        .getByTestId("measurement-card")
        .filter({ has: page.getByText("Air temperature") })
        .getByTestId("card-value"),
    ).toHaveText("23.4");

    // Retry actually refetches, and recovers once the backend is back.
    api.setFailing(false);
    await banner.getByRole("button", { name: "Retry" }).click();
    await expect(banner).toContainText("Live", { timeout: 20_000 });
  });

  test("switches facility and shows the empty-facility state", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");

    await expect(page.getByTestId("facility-context")).toContainText("Basil Growbox");

    await page.getByLabel("Active facility").selectOption(OTHER_FACILITY_ID);

    await expect(page.getByText("No measurement points")).toBeVisible();
    await expect(page.getByTestId("measurement-card")).toHaveCount(0);
  });

  test("drives the primary controls with the keyboard alone", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await expect(page.getByTestId("chart-summary")).toBeVisible();

    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Active facility")).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Charted measurement")).toBeFocused();

    await page.getByLabel("Charted measurement").selectOption(HUMIDITY_POINT_ID);
    await expect(page.getByTestId("chart-summary")).toContainText("Air humidity");
  });

  test("only ever requests same-origin /api/v1 URLs", async ({ page }) => {
    await mockApi(page);
    const requested: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/")) {
        requested.push(request.url());
      }
    });

    await page.goto("/");
    await expect(page.getByTestId("chart-summary")).toBeVisible();

    expect(requested.length).toBeGreaterThan(0);
    const origin = new URL(page.url()).origin;
    for (const url of requested) {
      expect(url.startsWith(`${origin}/api/v1`)).toBe(true);
    }
  });
});
