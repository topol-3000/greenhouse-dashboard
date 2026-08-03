/**
 * Desktop browser smoke flow over the production bundle.
 *
 * This is the unit's observable outcome end to end: open the Customer Portal,
 * land on its working Dashboard route, see whether the cloud API is available,
 * keep using the shell when it is not, and get a portal-styled 404 for an
 * address that does not exist — including after a browser refresh.
 */

import { expect, test } from "@playwright/test";
import { mockHealth } from "./fixtures";

const PORTAL_NAME = "AI Greenhouse Customer Portal";

test.describe("the Customer Portal", () => {
  test("opens as the Customer Portal with a working dashboard route", async ({ page }) => {
    await mockHealth(page);
    await page.goto("/");

    await expect(page).toHaveTitle(`Dashboard · ${PORTAL_NAME}`);
    await expect(page.getByRole("link", { name: PORTAL_NAME })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
    await expect(page.getByTestId("dashboard-page")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link")).toHaveText([
      "Dashboard",
    ]);
  });

  test("shows that the cloud API is available", async ({ page }) => {
    await mockHealth(page);
    await page.goto("/");

    await expect(page.getByTestId("api-status")).toHaveText("Cloud API: Available");
    await expect(page.getByRole("heading", { name: "The cloud API is available" })).toBeVisible();
  });

  test("stays usable when the cloud API is unreachable", async ({ page }) => {
    const health = await mockHealth(page, "unreachable");
    await page.goto("/");

    await expect(page.getByTestId("api-status")).toHaveText("Cloud API: Unavailable");

    // Not a blank error screen: the whole shell is still there.
    await expect(page.getByRole("link", { name: PORTAL_NAME })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nothing has been loaded yet" })).toBeVisible();

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

  test("renders no greenhouse, telemetry or command data", async ({ page }) => {
    await mockHealth(page);
    await page.goto("/");
    await expect(page.getByTestId("dashboard-page")).toBeVisible();

    const text = (await page.locator("body").innerText()).toLowerCase();
    for (const forbidden of ["basil", "growbox", "actuator", "setpoint", "telemetry sample"]) {
      expect(text).not.toContain(forbidden);
    }
    expect(text).not.toMatch(/\d+(\.\d+)?\s?(°c|°f|lx|ppm|kpa)/);
  });

  test("asks the backend for nothing but its health endpoint", async ({ page }) => {
    await mockHealth(page);
    const requested: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith("/api/") || url.pathname === "/health") {
        requested.push(request.url());
      }
    });

    await page.goto("/");
    await expect(page.getByTestId("api-status")).toHaveText("Cloud API: Available");

    expect(requested.length).toBeGreaterThan(0);

    // One endpoint, and same-origin: the default build carries no backend host.
    const origin = new URL(page.url()).origin;
    expect(new Set(requested)).toEqual(new Set([`${origin}/health`]));
  });

  test("drives the shell with the keyboard alone", async ({ page }) => {
    await mockHealth(page);
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
