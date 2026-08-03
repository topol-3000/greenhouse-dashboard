/**
 * Narrow-viewport smoke flow.
 *
 * Runs on the `mobile` project only. It proves the portal shell and the
 * topology screens stay usable at phone width: no page scrolls sideways, the
 * primary navigation collapses behind an accessible toggle, the facility
 * switcher is reachable and operable, and the content stacks into one readable
 * column.
 */

import { expect, test } from "@playwright/test";
import { E2E_IDS, mockHealth, mockTopology } from "./fixtures";

const FACILITY_URL = `/facilities/${E2E_IDS.northGreenhouse}`;
const ZONE_URL = `${FACILITY_URL}/zones/${E2E_IDS.climateZone}`;

/** How far the document can be scrolled horizontally, in pixels. */
async function horizontalOverflow(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
}

test.describe("the portal shell at phone width", () => {
  test("lays out without horizontal overflow", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);
    await page.goto("/");
    await expect(page.getByTestId("dashboard-page")).toBeVisible();

    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  });

  test("keeps every topology screen inside the viewport", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);

    for (const url of ["/sites", FACILITY_URL, ZONE_URL]) {
      await page.goto(url);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    }
  });

  test("offers a keyboard-operable facility switcher with an accessible name", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);
    await page.goto(FACILITY_URL);

    const switcher = page.getByRole("combobox", { name: "Switch facility" });
    await expect(switcher).toBeVisible();

    // Comfortably tappable, and reachable and operable from the keyboard.
    const box = await switcher.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(40);

    await switcher.focus();
    await expect(switcher).toBeFocused();
    await switcher.selectOption(E2E_IDS.seedlingRoom);
    await expect(page.getByRole("heading", { level: 1, name: "Seedling Room" })).toBeVisible();
  });

  test("collapses the primary navigation behind an accessible toggle", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);
    await page.goto("/");

    const toggle = page.getByRole("button", { name: "Menu" });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    // Collapsed means collapsed: the links are out of the layout and out of
    // the accessibility tree, not just painted over.
    const navigationLinks = page.getByRole("navigation", { name: "Primary" }).getByRole("link");
    await expect(navigationLinks).toHaveCount(0);

    // Comfortably tappable.
    const box = await toggle.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(40);

    await toggle.click();
    await expect(page.getByRole("button", { name: "Close menu" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    // Both offered routes are there, and reachable from the opened menu.
    await expect(navigationLinks).toHaveText(["Dashboard", "Greenhouses"]);
    await navigationLinks.last().click();
    await expect(page.getByRole("heading", { level: 1, name: "Greenhouses" })).toBeVisible();
  });

  test("keeps the availability indicator and content in one column", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);
    await page.goto("/");

    await expect(page.getByTestId("api-status")).toBeVisible();

    const viewport = page.viewportSize()!;
    const widths = await page
      .locator(".panel")
      .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().width));
    expect(widths.length).toBeGreaterThan(0);
    for (const width of widths) {
      expect(width).toBeLessThanOrEqual(viewport.width);
    }
  });
});
