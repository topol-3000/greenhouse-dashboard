/**
 * Activity in a real browser, over the production bundle.
 *
 * This is Unit 5's observable outcome end to end: open Activity from the
 * primary navigation, scope it to a real control zone, read that zone's manual
 * and automatic commands, tell what was requested from what is reported from how
 * far the command got, open one command's details, and come back to the same
 * command after a refresh and after Back.
 *
 * The unhappy paths are here because they decide whether the surface is honest:
 * a window that comes back empty, a command the address names that belongs to
 * another zone, and a lifecycle that moves from pending, through an Edge
 * receipt, to applied without either of the first two ever being drawn as
 * success.
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  E2E_COMMAND_IDS,
  E2E_IDS,
  SEEDED_COMMANDS,
  mockCommands,
  mockHealth,
  mockTopology,
} from "./fixtures";

const ZONE_ACTIVITY = `/activity?site=${E2E_IDS.riversideSite}&facility=${E2E_IDS.northGreenhouse}&zone=${E2E_IDS.climateZone}`;

/** One command's row, found by the identifier the cloud API published. */
function row(page: Page, commandId: string) {
  return page.getByTestId(`activity-row-${commandId}`);
}

/** A backend serving the topology and a zone's existing command history. */
async function serveActivity(page: Page) {
  await mockHealth(page);
  await mockTopology(page);
  return mockCommands(page, undefined, SEEDED_COMMANDS);
}

test.describe("reaching and scoping Activity", () => {
  test("walks the navigation and chooses a site, facility and zone", async ({ page }) => {
    await serveActivity(page);
    await page.goto("/");

    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Activity" })
      .click();

    await expect(page).toHaveURL(/\/activity$/);
    await expect(page.getByRole("heading", { level: 1, name: "Activity" })).toBeVisible();

    // Nothing is chosen for the customer, so nothing is shown yet.
    await expect(page.getByTestId("activity-needs-selection")).toBeVisible();

    await page
      .getByRole("combobox", { name: "Site", exact: true })
      .selectOption(E2E_IDS.riversideSite);
    await page
      .getByRole("combobox", { name: "Facility", exact: true })
      .selectOption(E2E_IDS.northGreenhouse);
    await page
      .getByRole("combobox", { name: "Control zone", exact: true })
      .selectOption(E2E_IDS.climateZone);

    await expect(page.getByTestId("activity-list")).toBeVisible();
    // The selection is in the address, so it can be sent and restored.
    await expect(page).toHaveURL(new RegExp(`zone=${E2E_IDS.climateZone}`));
  });

  test("narrows by source and by control point through the backend", async ({ page }) => {
    const commands = await serveActivity(page);
    await page.goto(ZONE_ACTIVITY);
    await expect(page.getByTestId("activity-list")).toBeVisible();
    await expect(page.getByTestId("activity-list").getByRole("button")).toHaveCount(4);

    await page.getByRole("combobox", { name: "Source", exact: true }).selectOption("manual");
    await expect(row(page, E2E_COMMAND_IDS.lampOnAutomatic)).toHaveCount(0);
    await expect(row(page, E2E_COMMAND_IDS.ventOnPending)).toBeVisible();

    await page
      .getByRole("combobox", { name: "Control point", exact: true })
      .selectOption(E2E_IDS.ventPoint);
    await expect(row(page, E2E_COMMAND_IDS.lampOnApplied)).toHaveCount(0);
    await expect(row(page, E2E_COMMAND_IDS.ventOnPending)).toBeVisible();

    // Narrowing is the operation's own filters, never a filter applied in the
    // browser to a window the backend already limited. Polled rather than read
    // once: the assertion is about the request the selection causes, and the
    // rendered list is not proof that it has already been made.
    const windows = () => commands.requests().filter((path) => !path.includes("/commands/"));

    await expect.poll(() => windows().some((path) => path.includes("source=manual"))).toBe(true);
    await expect
      .poll(() => windows().some((path) => path.includes(`target_point_id=${E2E_IDS.ventPoint}`)))
      .toBe(true);

    expect(windows().every((path) => path.includes(`control_zone_id=${E2E_IDS.climateZone}`))).toBe(
      true,
    );
    // No lifecycle filter is sent, because the operation publishes none.
    expect(windows().some((path) => path.includes("state="))).toBe(false);
  });

  test("restores the whole selection across Back and Forward", async ({ page }) => {
    await serveActivity(page);
    await page.goto(ZONE_ACTIVITY);
    await expect(page.getByTestId("activity-list")).toBeVisible();

    await page.getByRole("combobox", { name: "Source", exact: true }).selectOption("control_loop");
    await expect(row(page, E2E_COMMAND_IDS.ventOnPending)).toHaveCount(0);

    await page.goBack();
    await expect(page.getByRole("combobox", { name: "Source", exact: true })).toHaveValue("");
    await expect(row(page, E2E_COMMAND_IDS.ventOnPending)).toBeVisible();

    await page.goForward();
    await expect(page.getByRole("combobox", { name: "Source", exact: true })).toHaveValue(
      "control_loop",
    );
    await expect(row(page, E2E_COMMAND_IDS.ventOnPending)).toHaveCount(0);
  });

  test("degrades safely for a stale address and an unknown source", async ({ page }) => {
    await serveActivity(page);
    await page.goto(
      `/activity?facility=${E2E_IDS.northGreenhouse}&zone=${E2E_IDS.seedlingClimateZone}&source=nonsense`,
    );

    await expect(page.getByTestId("activity-zone-note")).toBeVisible();
    await expect(page.getByTestId("activity-source-note")).toBeVisible();
    await expect(page.getByTestId("activity-needs-selection")).toBeVisible();
    // A degraded address is still the portal, not an error screen.
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  });
});

test.describe("what the window says", () => {
  test("distinguishes manual from automatic and requested from reported", async ({ page }) => {
    await serveActivity(page);
    await page.goto(ZONE_ACTIVITY);

    const manual = row(page, E2E_COMMAND_IDS.ventOnPending);
    await expect(manual.getByTestId("activity-row-source")).toContainText("Manual");
    await expect(manual.getByTestId("activity-row-desired")).toContainText("On");
    await expect(manual.getByTestId("activity-row-state")).toContainText("Pending");
    await expect(manual.getByTestId("activity-row-receipt")).toContainText("Receipt not confirmed");

    const automatic = row(page, E2E_COMMAND_IDS.lampOnAutomatic);
    await expect(automatic.getByTestId("activity-row-source")).toContainText("Automatic");
    // Receipt is not a fourth state: still pending, and never "applied".
    await expect(automatic.getByTestId("activity-row-state")).toContainText("Pending");
    await expect(automatic.getByTestId("activity-row-receipt")).toContainText(
      "Received by the greenhouse",
    );

    await expect(
      row(page, E2E_COMMAND_IDS.lampOnApplied).getByTestId("activity-row-state"),
    ).toContainText("Applied");

    const rejected = row(page, E2E_COMMAND_IDS.ventOffRejected);
    await expect(rejected.getByTestId("activity-row-state")).toContainText("Rejected");
    await expect(rejected.getByTestId("activity-row-rejection")).toContainText(
      "actuator_interlocked",
    );

    // A row carries no reading: a current value beside an old command would
    // read as that command's outcome.
    await expect(page.getByTestId("activity-list")).not.toContainText("Reported by");
  });

  test("keeps the cloud API's newest-first order", async ({ page }) => {
    await serveActivity(page);
    await page.goto(ZONE_ACTIVITY);

    const rows = page.getByTestId("activity-list").getByRole("button");
    await expect(rows).toHaveCount(SEEDED_COMMANDS.length);

    const ids = await rows.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-command-id")),
    );
    expect(ids).toEqual(SEEDED_COMMANDS.map((command) => command.id));
  });

  test("tells an empty window apart from a failed one", async ({ page }) => {
    const commands = await serveActivity(page);
    await page.goto(`/activity?facility=${E2E_IDS.northGreenhouse}&zone=${E2E_IDS.irrigationZone}`);

    await expect(page.getByTestId("activity-empty")).toBeVisible();
    await expect(page.getByTestId("activity-error")).toHaveCount(0);

    commands.setReadUnreachable(true);
    await page.goto(`/activity?facility=${E2E_IDS.northGreenhouse}&zone=${E2E_IDS.climateZone}`);
    await expect(page.getByTestId("activity-error")).toBeVisible();
    await expect(page.getByTestId("activity-empty")).toHaveCount(0);
  });
});

test.describe("one command's details", () => {
  test("opens a manual command, and reopens it after a refresh", async ({ page }) => {
    await serveActivity(page);
    await page.goto(ZONE_ACTIVITY);

    await row(page, E2E_COMMAND_IDS.ventOnPending).click();

    const dialog = page.getByTestId("command-details");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId("command-details-meta")).toContainText(
      E2E_COMMAND_IDS.ventOnPending,
    );
    await expect(dialog.getByTestId("command-details-desired")).toContainText("On");
    // The vent's reported point publishes `false`. That is a reading, not an
    // absence, and it does not become the requested value.
    await expect(dialog.getByTestId("command-reported-state")).toContainText("False");
    // A manual command invents no control loop and no trigger sample.
    await expect(dialog.getByTestId("command-details-loop-absent")).toBeVisible();
    await expect(dialog.getByTestId("command-details-trigger-absent")).toBeVisible();

    await expect(page).toHaveURL(new RegExp(`command=${E2E_COMMAND_IDS.ventOnPending}`));

    await page.reload();
    await expect(page.getByTestId("command-details")).toBeVisible();
    await expect(page.getByTestId("command-details-meta")).toContainText(
      E2E_COMMAND_IDS.ventOnPending,
    );
  });

  test("shows an automatic command's loop without offering to change it", async ({ page }) => {
    await serveActivity(page);
    await page.goto(`${ZONE_ACTIVITY}&command=${E2E_COMMAND_IDS.lampOnAutomatic}`);

    const dialog = page.getByTestId("command-details");
    await expect(dialog.getByTestId("command-details-source-meaning")).toContainText(
      "control system",
    );
    // The lamp's reported point has never reported. `applied` or not, that is
    // said explicitly rather than filled in.
    await expect(dialog.getByTestId("command-reported-state")).toContainText(
      "No reported state yet",
    );
    await expect(dialog.getByRole("button")).toHaveCount(1);
    await expect(dialog.getByRole("button", { name: "Close" })).toBeVisible();
  });

  test("shows a rejected command's typed reason", async ({ page }) => {
    await serveActivity(page);
    await page.goto(`${ZONE_ACTIVITY}&command=${E2E_COMMAND_IDS.ventOffRejected}`);

    const dialog = page.getByTestId("command-details");
    await expect(dialog.getByTestId("command-details-state")).toContainText("Rejected");
    await expect(dialog.getByTestId("command-details-rejection")).toContainText(
      "A safety interlock is engaged for this actuator.",
    );
    // Rejected, beside a reported `false` that matches the Off it asked for.
    // The reading is not evidence, and the command stays rejected.
    await expect(dialog.getByTestId("command-details-desired")).toContainText("Off");
    await expect(dialog.getByTestId("command-reported-state")).toContainText("False");
    await expect(dialog.getByTestId("command-details-terminal")).toBeVisible();
  });

  test("refuses a command the contract places in another zone", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);
    await mockCommands(page, undefined, [
      ...SEEDED_COMMANDS,
      {
        ...SEEDED_COMMANDS[3]!,
        id: "dd000000-0000-4000-8000-0000000000c1",
        control_zone_id: E2E_IDS.irrigationZone,
      },
    ]);

    await page.goto(`${ZONE_ACTIVITY}&command=dd000000-0000-4000-8000-0000000000c1`);

    await expect(page.getByTestId("command-outside-context")).toBeVisible();
    await expect(page.getByTestId("command-details-meta")).toHaveCount(0);
    await expect(page.getByTestId("activity-list")).toBeVisible();
  });

  test("follows pending, through an Edge receipt, to applied", async ({ page }) => {
    const commands = await serveActivity(page);
    await page.goto(`${ZONE_ACTIVITY}&command=${E2E_COMMAND_IDS.ventOnPending}`);

    const dialog = page.getByTestId("command-details");
    await expect(dialog.getByTestId("command-details-state")).toContainText("Pending");
    await expect(dialog).toContainText("Receipt not confirmed");

    // Receipt: the Edge has it. Nothing has moved, and nothing says it has.
    commands.setLifecycle("acknowledged");
    await expect(dialog.getByTestId("command-details-receipt")).toContainText(
      "Received by the greenhouse",
      { timeout: 15_000 },
    );
    await expect(dialog.getByTestId("command-details-state")).toContainText("Pending");
    await expect(dialog.getByTestId("command-details-state")).not.toContainText("Applied");

    // And only then, terminal success.
    commands.setLifecycle("applied");
    await expect(dialog.getByTestId("command-details-state")).toContainText("Applied", {
      timeout: 15_000,
    });
    await expect(dialog.getByTestId("command-details-terminal")).toBeVisible();
  });

  test("closes with Escape and returns focus to the row that opened it", async ({ page }) => {
    await serveActivity(page);
    await page.goto(ZONE_ACTIVITY);
    await expect(page.getByTestId("activity-list")).toBeVisible();

    const trigger = row(page, E2E_COMMAND_IDS.lampOnApplied);
    await trigger.focus();
    await page.keyboard.press("Enter");

    const dialog = page.getByTestId("command-details");
    await expect(dialog).toBeVisible();
    await expect(dialog).toBeFocused();

    // Focus stays inside the dialog.
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    // Closing removed the command and nothing else.
    await expect(page).not.toHaveURL(/command=/);
    await expect(page).toHaveURL(new RegExp(`zone=${E2E_IDS.climateZone}`));
  });
});

test.describe("the control workspace continues into Activity", () => {
  test("opens a submitted command in Activity with its own context", async ({ page }) => {
    await serveActivity(page);
    await page.goto(`/facilities/${E2E_IDS.northGreenhouse}/zones/${E2E_IDS.climateZone}`);

    await page
      .getByTestId("manual-control")
      .locator(`[data-point-id="${E2E_IDS.ventPoint}"]`)
      .getByTestId("actuator-on")
      .click();
    await page.getByTestId("command-confirm").click();

    await page.getByTestId("command-activity-link").click();

    await expect(page).toHaveURL(/\/activity\?/);
    await expect(page.getByTestId("command-details")).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Control zone", exact: true })).toHaveValue(
      E2E_IDS.climateZone,
    );
    await expect(page.getByTestId("command-details-desired")).toContainText("On");
  });
});
