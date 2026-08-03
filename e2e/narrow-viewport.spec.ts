/**
 * Narrow-viewport smoke flow.
 *
 * Runs on the `mobile` project only. It proves the layout stays usable at phone
 * width: the page does not scroll sideways, the cards stack, and both selectors
 * are still reachable and operable.
 */

import { expect, test } from "@playwright/test";
import { HUMIDITY_POINT_ID, mockApi } from "./fixtures";

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

  test("keeps both selectors usable at phone width", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");

    const facility = page.getByLabel("Active facility");
    const point = page.getByLabel("Charted measurement");

    await expect(facility).toBeVisible();
    await expect(point).toBeVisible();

    // Comfortably tappable.
    const box = await facility.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(40);

    await point.selectOption(HUMIDITY_POINT_ID);
    await expect(page.getByTestId("chart-summary")).toContainText("Air humidity");
  });

  test("keeps the chart inside the viewport", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");

    const chart = page.getByTestId("history-chart");
    await expect(chart).toBeVisible();

    const viewport = page.viewportSize()!;
    const box = await chart.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(viewport.width);
  });
});
