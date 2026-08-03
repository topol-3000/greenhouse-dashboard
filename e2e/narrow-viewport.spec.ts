/**
 * Narrow-viewport smoke flow.
 *
 * Runs on the `mobile` project only. It proves the portal shell stays usable at
 * phone width: the page does not scroll sideways, the primary navigation
 * collapses behind an accessible toggle, and the content stacks into one
 * readable column.
 */

import { expect, test } from "@playwright/test";
import { mockHealth } from "./fixtures";

test.describe("the portal shell at phone width", () => {
  test("lays out without horizontal overflow", async ({ page }) => {
    await mockHealth(page);
    await page.goto("/");
    await expect(page.getByTestId("dashboard-page")).toBeVisible();

    const overflow = await page.evaluate(() => {
      const root = document.documentElement;
      return root.scrollWidth - root.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("collapses the primary navigation behind an accessible toggle", async ({ page }) => {
    await mockHealth(page);
    await page.goto("/");

    const toggle = page.getByRole("button", { name: "Menu" });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    // Collapsed means collapsed: the links are out of the layout, not just
    // painted over.
    const dashboardLink = page.getByRole("navigation", { name: "Primary" }).getByRole("link");
    await expect(dashboardLink).toBeHidden();

    // Comfortably tappable.
    const box = await toggle.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(40);

    await toggle.click();
    await expect(page.getByRole("button", { name: "Close menu" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(dashboardLink).toBeVisible();

    await dashboardLink.click();
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  });

  test("keeps the availability indicator and content in one column", async ({ page }) => {
    await mockHealth(page);
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
