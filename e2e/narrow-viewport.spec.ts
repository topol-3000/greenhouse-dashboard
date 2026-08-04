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
import {
  E2E_COMMAND_IDS,
  E2E_IDS,
  SEEDED_COMMANDS,
  mockCommands,
  mockHealth,
  mockTopology,
} from "./fixtures";

const FACILITY_URL = `/facilities/${E2E_IDS.northGreenhouse}`;
const ZONE_URL = `${FACILITY_URL}/zones/${E2E_IDS.climateZone}`;
const ZONE_ACTIVITY = `/activity?site=${E2E_IDS.riversideSite}&facility=${E2E_IDS.northGreenhouse}&zone=${E2E_IDS.climateZone}`;

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

  test("keeps the monitoring section and its chart inside the viewport", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);
    await page.goto(ZONE_URL);

    await expect(page.getByTestId("measurement-cards")).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

    // The cards stack into one column rather than being squeezed side by side.
    const viewport = page.viewportSize()!;
    const cardWidths = await page
      .getByTestId("measurement-card")
      .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().width));
    expect(cardWidths.length).toBeGreaterThan(0);
    for (const width of cardWidths) {
      expect(width).toBeLessThanOrEqual(viewport.width);
    }

    // The chart is drawn at the width it has, and the sample table scrolls
    // inside its own box, so neither pushes the page sideways.
    await page.getByRole("button", { name: "Show history of North air temperature" }).click();
    await expect(page.getByTestId("history-chart")).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

    const chartWidth = await page
      .getByTestId("history-chart-svg")
      .evaluate((node) => node.getBoundingClientRect().width);
    expect(chartWidth).toBeLessThanOrEqual(viewport.width);

    await page.getByText(/Show the \d+ loaded samples? as a table/).click();
    await expect(page.getByTestId("sample-table")).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
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

    // Every offered route is there, and reachable from the opened menu.
    await expect(navigationLinks).toHaveText(["Dashboard", "Greenhouses", "Activity"]);
    await navigationLinks.last().click();
    await expect(page.getByRole("heading", { level: 1, name: "Activity" })).toBeVisible();
  });

  test("closes the off-canvas navigation with Escape, without scrolling the page", async ({
    page,
  }) => {
    await mockHealth(page);
    await mockTopology(page);
    await page.goto("/");

    const toggle = page.getByRole("button", { name: "Menu" });
    await toggle.click();
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    // An open menu overlays the page; it never widens it.
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Menu" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    // Focus comes back to the control that opened it, so the keyboard user is
    // not left at the top of the document.
    await expect(page.getByRole("button", { name: "Menu" })).toBeFocused();
    await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link")).toHaveCount(
      0,
    );
  });

  test("offers the appearance selector at phone width", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);
    await page.goto("/");

    const group = page.getByRole("group", { name: "Appearance" });
    // The visible label is dropped for space, but the accessible name is not.
    await expect(group.getByRole("button", { name: "Dark" })).toBeVisible();

    await group.getByRole("button", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-coreui-theme", "dark");
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
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

test.describe("Activity at phone width", () => {
  test("stacks the command rows and shows the same facts as a wide screen", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);
    await mockCommands(page, undefined, SEEDED_COMMANDS);
    await page.goto(ZONE_ACTIVITY);

    await expect(page.getByTestId("activity-list")).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

    const viewport = page.viewportSize()!;
    const widths = await page
      .getByTestId("activity-list")
      .getByRole("button")
      .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().width));
    expect(widths.length).toBe(4);
    for (const width of widths) {
      expect(width).toBeLessThanOrEqual(viewport.width);
    }

    // One markup for every viewport: the phone shows the same fields the
    // desktop does, not a reduced version of them.
    const row = page.getByTestId(`activity-row-${E2E_COMMAND_IDS.lampOnAutomatic}`);
    await expect(row.getByTestId("activity-row-source")).toContainText("Automatic");
    await expect(row.getByTestId("activity-row-desired")).toContainText("On");
    await expect(row.getByTestId("activity-row-state")).toContainText("Pending");
    await expect(row.getByTestId("activity-row-receipt")).toContainText("Received");

    // Comfortably tappable rather than a table squeezed past usability.
    const box = await row.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });

  test("fits the command details on the screen", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);
    await mockCommands(page, undefined, SEEDED_COMMANDS);
    await page.goto(`${ZONE_ACTIVITY}&command=${E2E_COMMAND_IDS.ventOffRejected}`);

    const dialog = page.getByRole("dialog", { name: "Command details" });
    await expect(dialog).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

    const viewport = page.viewportSize()!;
    const box = await dialog.boundingBox();
    expect(box?.width ?? 0).toBeLessThanOrEqual(viewport.width);
    expect(box?.height ?? 0).toBeLessThanOrEqual(viewport.height);

    // A UUID and a rejection message wrap rather than widen the page.
    await expect(dialog.getByTestId("command-details-rejection")).toContainText(
      "actuator_interlocked",
    );
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  });
});

test.describe("manual control at phone width", () => {
  test("stacks the actuator cards and keeps their actions tappable", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);
    await mockCommands(page);
    await page.goto(ZONE_URL);

    await expect(page.getByTestId("actuator-cards")).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

    const viewport = page.viewportSize()!;
    const widths = await page
      .getByTestId("actuator-card")
      .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().width));
    expect(widths.length).toBeGreaterThan(0);
    for (const width of widths) {
      expect(width).toBeLessThanOrEqual(viewport.width);
    }

    // Comfortably tappable rather than squeezed into a row of small targets.
    const action = page
      .getByTestId("manual-control")
      .getByRole("button", { name: "Turn on North air temperature vent" });
    const box = await action.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(40);
  });

  test("fits the confirmation and the command lifecycle on the screen", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);
    const commands = await mockCommands(page);
    await page.goto(ZONE_URL);

    await page
      .getByTestId("manual-control")
      .getByRole("button", { name: "Turn on North air temperature vent" })
      .click();

    const dialog = page.getByRole("dialog", { name: "Confirm this manual command" });
    await expect(dialog).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

    const viewport = page.viewportSize()!;
    const box = await dialog.boundingBox();
    // Sized by the viewport rather than by a fixed pixel width.
    expect(box?.width ?? 0).toBeLessThanOrEqual(viewport.width);
    expect(box?.height ?? 0).toBeLessThanOrEqual(viewport.height);

    await dialog.getByTestId("command-confirm").click();
    await expect(page.getByTestId("command-progress")).toBeVisible();
    expect(commands.creations()).toHaveLength(1);

    // A long identifier and a long lifecycle message wrap rather than widen.
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  });
});
