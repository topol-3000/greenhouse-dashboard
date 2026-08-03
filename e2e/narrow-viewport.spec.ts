/**
 * Narrow-viewport smoke flow.
 *
 * Runs on the `mobile` project only. It proves the layout stays usable at phone
 * width: the page does not scroll sideways, the cards and the charts stack into
 * a single column, and the facility selector is still reachable and operable.
 */

import { expect, test } from "@playwright/test";
import { mockApi } from "./fixtures";

test.describe("narrow viewport", () => {
  test("stacks the layout without horizontal overflow", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");

    await expect(page.getByTestId("facility-context")).toBeVisible();
    await expect(page.getByTestId("measurement-card")).toHaveCount(3);

    // The body must never scroll sideways at phone width.
    const overflow = await page.evaluate(() => {
      const document_ = document.documentElement;
      return document_.scrollWidth - document_.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(1);

    // Cards are stacked, not sitting side by side.
    const boxes = await page
      .getByTestId("measurement-card")
      .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().left));
    expect(new Set(boxes).size).toBe(1);
  });

  test("stacks the charts into one column", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");

    const charts = page.getByTestId("history-chart");
    await expect(charts).toHaveCount(2);

    const lefts = await charts.evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().left),
    );
    expect(new Set(lefts).size).toBe(1);
  });

  test("keeps the facility selector usable at phone width", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");

    const facility = page.getByLabel("Active facility");
    await expect(facility).toBeVisible();

    // Comfortably tappable.
    const box = await facility.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(40);
  });

  test("keeps every chart inside the viewport", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");

    const charts = page.getByTestId("history-chart");
    await expect(charts).toHaveCount(2);

    const viewport = page.viewportSize()!;
    const widths = await charts.evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().width),
    );
    for (const width of widths) {
      expect(width).toBeLessThanOrEqual(viewport.width);
    }
  });
});
