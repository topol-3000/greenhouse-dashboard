/**
 * What the production bundle is allowed to contain.
 *
 * The repository holds contract-shaped fixtures and a `fetch` double so the
 * suites can describe a backend. None of it may reach a customer: not as a demo
 * mode, not as a fallback when a request fails, and not as a few kilobytes of
 * someone else's greenhouse riding along in the assets.
 *
 * This suite runs against the same `vite preview` of `dist/` every other browser
 * test runs against, so it inspects the artefact that would actually ship rather
 * than a claim about it. It reads the assets `index.html` links, so a bundle
 * split into more chunks is still covered.
 */

import { expect, test } from "@playwright/test";

/**
 * Strings that exist only in test support.
 *
 * Fixture prose, fixture identifiers and the names of the modules themselves. A
 * production module importing any of them drags the whole file in, and one of
 * these lands in the bundle.
 */
const FIXTURE_MARKERS = [
  "Riverside Growing Site",
  "Harbour Research Site",
  "North Greenhouse",
  "North air temperature vent",
  "actuator_interlocked",
  "A safety interlock is engaged",
  // Fixture identifier prefixes: sites, points and commands.
  "6f1c9f3a-6b1e",
  "bb000000-0000",
  "dd000000-0000",
  // Test-support module and export names.
  "installFetchMock",
  "backendRoutes",
  "SEEDED_COMMANDS",
  "climateZoneCommands",
  "mockTopology",
  "mockCommands",
];

test.describe("the production bundle", () => {
  test("ships no fixture, seed or demo data", async ({ page, request }) => {
    await page.goto("/");
    await expect(page.getByTestId("dashboard-page")).toBeVisible();

    const assets = await page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLScriptElement>("script[src]"),
        ...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]'),
      ].map((node) => (node instanceof HTMLScriptElement ? node.src : node.href)),
    );

    expect(assets.length).toBeGreaterThan(0);

    for (const asset of assets) {
      const response = await request.get(asset);
      expect(response.ok()).toBe(true);
      const body = await response.text();
      for (const marker of FIXTURE_MARKERS) {
        expect(body, `${asset} contains the test-support marker ${marker}`).not.toContain(marker);
      }
    }
  });

  test("serves /activity directly through the SPA fallback", async ({ page }) => {
    // A deep link with a whole selection in it, requested from the server
    // rather than navigated to, is what a refresh and a shared link both are.
    const response = await page.goto("/activity?source=manual");

    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Activity" })).toBeVisible();
    await expect(page.getByTestId("activity-page")).toBeVisible();
  });
});
