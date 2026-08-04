/**
 * Desktop browser smoke flow over the production bundle.
 *
 * This is the unit's observable outcome end to end: open the Customer Portal,
 * land on its working Dashboard route, see whether the cloud API is available,
 * keep using the shell when it is not, and get a portal-styled 404 for an
 * address that does not exist — including after a browser refresh.
 */

import { expect, test } from "@playwright/test";
import { mockHealth, mockTopology } from "./fixtures";

const PORTAL_NAME = "AI Greenhouse Customer Portal";

test.describe("the Customer Portal", () => {
  test("opens as the Customer Portal with a working dashboard route", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);
    await page.goto("/");

    await expect(page).toHaveTitle(`Dashboard · ${PORTAL_NAME}`);
    await expect(page.getByRole("link", { name: PORTAL_NAME })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
    await expect(page.getByTestId("dashboard-page")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link")).toHaveText([
      "Dashboard",
      "Greenhouses",
      "Activity",
    ]);
  });

  test("shows that the cloud API is available", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);
    await page.goto("/");

    await expect(page.getByTestId("api-status")).toHaveText("Cloud API: Available");
    await expect(page.getByRole("heading", { name: "The cloud API is available" })).toBeVisible();
  });

  test("stays usable when the cloud API is unreachable", async ({ page }) => {
    const health = await mockHealth(page, "unreachable");
    const topology = await mockTopology(page);
    topology.setUnreachable(true);
    await page.goto("/");

    await expect(page.getByTestId("api-status")).toHaveText("Cloud API: Unavailable");

    // Not a blank error screen: the whole shell is still there.
    await expect(page.getByRole("link", { name: PORTAL_NAME })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
    // The topology read failed too, and says so without replacing the portal.
    await expect(page.getByTestId("request-error")).toContainText(
      "Your greenhouses could not be loaded",
    );

    // Rechecking recovers, and the change is announced.
    health.setMode("available");
    await page.getByRole("button", { name: "Check again" }).click();
    await expect(page.getByTestId("api-status")).toHaveText("Cloud API: Available");
    await expect(page.getByTestId("notification-region")).toContainText("available again");
  });

  test("renders a portal 404 for an unknown address, including after a refresh", async ({
    page,
  }) => {
    await mockHealth(page);
    await mockTopology(page);
    await page.goto("/no-such-page");

    await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
    await expect(page.getByRole("link", { name: PORTAL_NAME })).toBeVisible();

    // A refresh on a client-side route must still serve the application.
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();

    await page.getByRole("link", { name: "Go to the Dashboard" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test("renders no telemetry, actuator or command data", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);
    await page.goto("/");
    await expect(page.getByTestId("dashboard-page")).toBeVisible();

    const text = (await page.locator("body").innerText()).toLowerCase();
    for (const forbidden of ["actuator", "setpoint", "telemetry sample", "command"]) {
      expect(text).not.toContain(forbidden);
    }
    expect(text).not.toMatch(/\d+(\.\d+)?\s?(°c|°f|lx|ppm|kpa)/);
  });

  test("asks the backend only for health and the published topology paths", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);
    const requested: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith("/api/") || url.pathname === "/health") {
        requested.push(request.url());
      }
    });

    await page.goto("/");
    await expect(page.getByTestId("api-status")).toHaveText("Cloud API: Available");
    await expect(page.getByTestId("dashboard-topology")).toBeVisible();

    expect(requested.length).toBeGreaterThan(0);

    // Same-origin only: the default build carries no backend host.
    const origin = new URL(page.url()).origin;
    expect(new Set(requested)).toEqual(
      new Set([
        `${origin}/health`,
        `${origin}/api/v1/sites?limit=200&offset=0`,
        `${origin}/api/v1/facilities?limit=200&offset=0`,
      ]),
    );
  });

  test("drives the shell with the keyboard alone", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);
    await page.goto("/");
    await expect(page.getByTestId("dashboard-page")).toBeVisible();

    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: PORTAL_NAME })).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Dashboard" })).toBeFocused();
  });
});
