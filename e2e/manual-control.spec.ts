/**
 * Manual control in a real browser, over the production bundle.
 *
 * This is Unit 4's observable outcome end to end: walk to a real control zone,
 * read what its equipment reports, choose an action, review the exact target and
 * confirm it, and then follow one command through the lifecycle the cloud API
 * publishes. The unhappy paths are here because they are the ones that decide
 * whether the portal is honest: a request the API refuses, a request whose
 * response is lost, a lifecycle read that fails over a command already on
 * screen, and a confirmation pressed twice.
 */

import { expect, test } from "@playwright/test";
import { E2E_IDS, mockCommands, mockHealth, mockTopology } from "./fixtures";
import { focusIsInside, tabTo } from "./keyboard";

const FACILITY_URL = `/facilities/${E2E_IDS.northGreenhouse}`;
const ZONE_URL = `${FACILITY_URL}/zones/${E2E_IDS.climateZone}`;
const IRRIGATION_URL = `${FACILITY_URL}/zones/${E2E_IDS.irrigationZone}`;

/** The actuator card for one point, found by the identifier the API sent. */
function actuator(page: import("@playwright/test").Page, pointId: string) {
  return page.getByTestId("manual-control").locator(`[data-point-id="${pointId}"]`);
}

test.describe("operating one actuator", () => {
  test("walks Dashboard → Greenhouses → Facility → ControlZone → manual control", async ({
    page,
  }) => {
    await mockHealth(page);
    await mockTopology(page);
    await mockCommands(page);
    await page.goto("/");

    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Greenhouses" })
      .click();
    await page.getByRole("link", { name: "North Greenhouse" }).click();
    await page.getByRole("link", { name: "North Climate" }).click();

    await expect(page).toHaveURL(new RegExp(`${ZONE_URL}$`));

    // Unit 3's monitoring is where it was.
    await expect(page.getByRole("region", { name: "Monitoring" })).toBeVisible();
    await expect(page.getByTestId("measurement-card")).toHaveCount(3);

    // And manual control is a section of the same workspace.
    await expect(page.getByRole("region", { name: "Manual control" })).toBeVisible();
    await expect(
      actuator(page, E2E_IDS.ventPoint).getByRole("button", {
        name: "Turn on North air temperature vent",
      }),
    ).toBeVisible();

    // Manual control adds no navigation entry of its own.
    await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link")).toHaveCount(
      3,
    );
  });

  test("offers actions only where the contract proves them", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);
    await mockCommands(page);
    await page.goto(ZONE_URL);

    await expect(page.getByTestId("actuator-cards")).toBeVisible();

    // The `float` control point is listed with the reason and has no action.
    const dimmer = actuator(page, E2E_IDS.dimmerPoint);
    await expect(dimmer.getByTestId("actuator-unsupported")).toContainText("on/off");
    await expect(dimmer.getByTestId("actuator-on")).toHaveCount(0);

    // A status point named like an actuator is not a target.
    await expect(actuator(page, E2E_IDS.lampStatusPoint)).toHaveCount(0);
    // Neither is a measurement point.
    await expect(actuator(page, E2E_IDS.airTempPoint)).toHaveCount(0);

    // Nothing invented a slider, a text field or an unlabelled switch.
    const control = page.getByTestId("manual-control");
    await expect(control.getByRole("slider")).toHaveCount(0);
    await expect(control.getByRole("switch")).toHaveCount(0);
    await expect(control.getByRole("textbox")).toHaveCount(0);
  });

  test("reads reported state without confusing it for a request", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);
    await mockCommands(page);
    await page.goto(ZONE_URL);

    // The vent's reported point published `false`, which is a reading.
    await expect(actuator(page, E2E_IDS.ventPoint).getByTestId("reported-state")).toHaveText(
      "False",
    );
    await expect(actuator(page, E2E_IDS.ventPoint)).toContainText("North vent status");

    // The lamp's reported point has never reported at all.
    await expect(actuator(page, E2E_IDS.lampPoint).getByTestId("reported-state")).toHaveText(
      "No reported state yet",
    );
  });

  test("confirms, submits one command and follows it to a terminal state", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);
    const commands = await mockCommands(page);
    await page.goto(ZONE_URL);

    await actuator(page, E2E_IDS.ventPoint)
      .getByRole("button", { name: "Turn on North air temperature vent" })
      .click();

    // Choosing sent nothing.
    expect(commands.creations()).toHaveLength(0);

    const dialog = page.getByRole("dialog", { name: "Confirm this manual command" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId("command-confirmation-target")).toContainText(
      "Riverside Growing Site",
    );
    await expect(dialog.getByTestId("command-confirmation-target")).toContainText(
      "North Greenhouse",
    );
    await expect(dialog.getByTestId("command-confirmation-target")).toContainText("North Climate");
    await expect(dialog.getByTestId("command-confirmation-value")).toHaveText("On");

    await dialog.getByTestId("command-confirm").click();

    // Exactly one request, carrying exactly the contract's body and header.
    await expect(page.getByTestId("command-progress")).toBeVisible();
    expect(commands.creations()).toHaveLength(1);
    expect(commands.creations()[0]?.body).toEqual({
      control_zone_id: E2E_IDS.climateZone,
      target_point_id: E2E_IDS.ventPoint,
      desired_value: true,
    });
    expect(commands.creations()[0]?.key).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    // Accepted is not applied.
    await expect(page.getByTestId("command-state")).toContainText("Pending");
    await expect(page.getByTestId("command-state")).not.toContainText("Applied");

    // The greenhouse answers, and the portal follows it there.
    commands.setLifecycle("applied");
    await expect(page.getByTestId("command-state")).toContainText("Applied", { timeout: 15_000 });

    // The reported state is still what the greenhouse published, unchanged.
    await expect(actuator(page, E2E_IDS.ventPoint).getByTestId("reported-state")).toHaveText(
      "False",
    );
    await expect(page.getByTestId("command-terminal-note")).toBeVisible();
  });

  test("cancels without sending anything and returns focus", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);
    const commands = await mockCommands(page);
    await page.goto(ZONE_URL);

    const opener = actuator(page, E2E_IDS.ventPoint).getByRole("button", {
      name: "Turn on North air temperature vent",
    });
    await opener.click();
    await page.getByTestId("command-cancel").click();

    await expect(page.getByTestId("command-confirmation")).toHaveCount(0);
    expect(commands.creations()).toHaveLength(0);
    await expect(opener).toBeFocused();
  });

  test("closes the confirmation on Escape", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);
    const commands = await mockCommands(page);
    await page.goto(ZONE_URL);

    await actuator(page, E2E_IDS.ventPoint)
      .getByRole("button", { name: "Turn on North air temperature vent" })
      .click();
    await expect(page.getByTestId("command-confirmation")).toBeVisible();
    await page.keyboard.press("Escape");

    await expect(page.getByTestId("command-confirmation")).toHaveCount(0);
    expect(commands.creations()).toHaveLength(0);
  });

  test("is operable with the keyboard alone", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);
    const commands = await mockCommands(page);
    await page.goto(ZONE_URL);

    const opener = actuator(page, E2E_IDS.lampPoint).getByRole("button", {
      name: "Turn off North lamp",
    });
    await opener.focus();
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog", { name: "Confirm this manual command" });
    await expect(dialog).toBeVisible();
    // The keystroke that opened the dialog did not also press a button in it.
    expect(commands.creations()).toHaveLength(0);

    await tabTo(page, dialog.getByTestId("command-confirm"));
    await page.keyboard.press("Enter");

    await expect(page.getByTestId("command-progress")).toBeVisible();
    expect(commands.creations()).toHaveLength(1);
    expect(commands.creations()[0]?.body).toMatchObject({ desired_value: false });
  });

  test("keeps Tab inside the confirmation", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);
    await mockCommands(page);
    await page.goto(ZONE_URL);

    await actuator(page, E2E_IDS.ventPoint)
      .getByRole("button", { name: "Turn on North air temperature vent" })
      .click();

    const dialog = page.getByRole("dialog", { name: "Confirm this manual command" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toBeFocused();

    // Tab all the way round the dialog twice over, forwards and backwards.
    // Focus reaches both actions and always comes to rest inside the dialog —
    // never on the page behind it, which is where an untrapped dialog leaks.
    for (const key of ["Tab", "Shift+Tab"] as const) {
      for (let press = 0; press < 8; press += 1) {
        await page.keyboard.press(key);
        await expect
          .poll(() => focusIsInside(page, "command-confirmation"), { timeout: 2000 })
          .toBe(true);
      }
    }

    await tabTo(page, dialog.getByTestId("command-cancel"));
    await tabTo(page, dialog.getByTestId("command-confirm"));
  });

  test("sends one command however fast the confirmation is pressed", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);
    const commands = await mockCommands(page);
    await page.goto(ZONE_URL);

    await actuator(page, E2E_IDS.ventPoint)
      .getByRole("button", { name: "Turn on North air temperature vent" })
      .click();

    const confirm = page.getByTestId("command-confirm");
    await confirm.click({ clickCount: 3, delay: 0 });

    await expect(page.getByTestId("command-progress")).toBeVisible();
    expect(commands.creations()).toHaveLength(1);
    expect(commands.stored()).toHaveLength(1);
  });

  test("says truthfully that a zone has no manual controls", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);
    await mockCommands(page);
    await page.goto(IRRIGATION_URL);

    await expect(page.getByTestId("control-empty")).toContainText(
      "No manual controls are available for this zone",
    );
    await expect(page.getByTestId("control-request-error")).toHaveCount(0);
  });
});

test.describe("when the cloud API does not cooperate", () => {
  test("keeps monitoring and the actuators when a command is refused", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);
    const commands = await mockCommands(page);
    commands.setCreationMode("refused");
    await page.goto(ZONE_URL);

    await actuator(page, E2E_IDS.ventPoint)
      .getByRole("button", { name: "Turn on North air temperature vent" })
      .click();
    await page.getByTestId("command-confirm").click();

    await expect(page.getByTestId("command-refused")).toContainText("(422)");
    // Nothing was retried, and nothing else on the page was lost.
    expect(commands.creations()).toHaveLength(1);
    await expect(page.getByTestId("measurement-cards")).toBeVisible();
    await expect(actuator(page, E2E_IDS.ventPoint).getByTestId("reported-state")).toHaveText(
      "False",
    );
  });

  test("keeps a lost response ambiguous and resolves it by its identifier", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);
    const commands = await mockCommands(page);
    commands.setCreationMode("unreachable");
    await page.goto(ZONE_URL);

    await actuator(page, E2E_IDS.ventPoint)
      .getByRole("button", { name: "Turn on North air temperature vent" })
      .click();
    await page.getByTestId("command-confirm").click();

    const ambiguous = page.getByTestId("command-ambiguous");
    await expect(ambiguous).toContainText("may or may not have been created");
    // Nothing was sent again on the portal's own initiative.
    expect(commands.creations()).toHaveLength(1);

    // The lookup proves nothing was stored, and the same key may be reused.
    await page.getByTestId("command-lookup").click();
    await expect(page.getByTestId("command-resolved-absent")).toBeVisible();

    const firstKey = commands.creations()[0]?.key;
    commands.setCreationMode("created");
    await page.getByTestId("command-retry-ambiguous").click();

    await expect(page.getByTestId("command-progress")).toBeVisible();
    expect(commands.creations()).toHaveLength(2);
    // One intent, one identifier.
    expect(commands.creations()[1]?.key).toBe(firstKey);
    expect(commands.stored()).toHaveLength(1);
  });

  test("keeps the last known command state when a lifecycle read fails", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);
    const commands = await mockCommands(page);
    await page.goto(ZONE_URL);

    await actuator(page, E2E_IDS.ventPoint)
      .getByRole("button", { name: "Turn on North air temperature vent" })
      .click();
    await page.getByTestId("command-confirm").click();
    await expect(page.getByTestId("command-state")).toContainText("Pending");

    commands.setReadUnreachable(true);
    await expect(page.getByTestId("command-refresh-failure")).toBeVisible({ timeout: 15_000 });

    // The command that was on screen is still on screen.
    await expect(page.getByTestId("command-state")).toContainText("Pending");
    await expect(page.getByTestId("command-refresh-retry")).toBeVisible();
  });

  test("shows a rejection with the reason the greenhouse gave", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);
    const commands = await mockCommands(page);
    await page.goto(ZONE_URL);

    await actuator(page, E2E_IDS.ventPoint)
      .getByRole("button", { name: "Turn on North air temperature vent" })
      .click();
    await page.getByTestId("command-confirm").click();
    await expect(page.getByTestId("command-progress")).toBeVisible();

    commands.setLifecycle("rejected");
    await expect(page.getByTestId("command-state")).toContainText("Rejected", { timeout: 15_000 });
    await expect(page.getByTestId("command-rejection")).toContainText("actuator_unreachable");

    // A rejection is not a reported state.
    await expect(actuator(page, E2E_IDS.ventPoint).getByTestId("reported-state")).toHaveText(
      "False",
    );
  });

  test("keeps monitoring and topology when the configuration cannot be read", async ({ page }) => {
    await mockHealth(page);
    const topology = await mockTopology(page);
    await mockCommands(page);
    topology.setConfigurationUnreachable(true);
    await page.goto(ZONE_URL);

    await expect(page.getByTestId("control-request-error")).toBeVisible();
    await expect(page.getByTestId("zone-points")).toBeAttached();
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  });
});

test.describe("addresses and refresh", () => {
  test("survives a direct load and a refresh of the nested route", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);
    await mockCommands(page);

    await page.goto(ZONE_URL);
    await expect(page.getByTestId("actuator-cards")).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("actuator-cards")).toBeVisible();
    await expect(page.getByRole("region", { name: "Monitoring" })).toBeVisible();
  });

  test("keeps an existing history selection while a command is submitted", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);
    await mockCommands(page);
    await page.goto(`${ZONE_URL}?point=${E2E_IDS.airTempPoint}`);

    await expect(page.getByTestId("history-window")).toBeVisible();

    await actuator(page, E2E_IDS.ventPoint)
      .getByRole("button", { name: "Turn on North air temperature vent" })
      .click();
    await page.getByTestId("command-confirm").click();
    await expect(page.getByTestId("command-progress")).toBeVisible();

    // The address still carries the selection, and the history is still drawn.
    await expect(page).toHaveURL(new RegExp(`point=${E2E_IDS.airTempPoint}`));
    await expect(page.getByTestId("history-window")).toBeVisible();
  });

  test("renders no manual control under a facility the zone does not belong to", async ({
    page,
  }) => {
    await mockHealth(page);
    await mockTopology(page);
    await mockCommands(page);
    await page.goto(`${FACILITY_URL}/zones/${E2E_IDS.seedlingClimateZone}`);

    await expect(page.getByTestId("relationship-mismatch")).toBeVisible();
    await expect(page.getByTestId("manual-control")).toHaveCount(0);
  });

  test("adds no activity, schedule or alert surface", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);
    await mockCommands(page);
    await page.goto(ZONE_URL);
    await expect(page.getByTestId("actuator-cards")).toBeVisible();

    // Command history lives on the Activity route. The workspace shows the one
    // command the customer created here and nothing resembling a feed.
    await expect(page.getByTestId("activity-list")).toHaveCount(0);

    const text = (await page.getByTestId("control-zone-page").textContent()) ?? "";
    for (const forbidden of ["Schedule", "Alert", "Recipe", "Grow cycle"]) {
      expect(text).not.toContain(forbidden);
    }
    await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link")).toHaveCount(
      3,
    );
  });

  test("shows the zone's control loops without offering to configure one", async ({ page }) => {
    await mockHealth(page);
    await mockTopology(page);
    await mockCommands(page);
    await page.goto(ZONE_URL);

    // The zone now says what its own greenhouse runs on. Reading it is the
    // whole feature: there is no create, no edit, no delete and no toggle.
    const loops = page.getByTestId("control-loops");
    await expect(loops).toBeVisible();
    await expect(loops.getByTestId("control-loop").first()).toContainText(
      "Drives North lamp from North CO2",
    );

    await expect(loops.getByRole("button", { name: /add|create|new|edit|delete/i })).toHaveCount(0);
    await expect(loops.getByRole("switch")).toHaveCount(0);
    await expect(loops.locator("form")).toHaveCount(0);

    // Thresholds are the contract's bare numbers. The measured point publishes
    // ppm; nothing says the thresholds are expressed in it, so they must not be.
    const text = (await loops.textContent()) ?? "";
    expect(text).toContain("400");
    expect(text).not.toMatch(/400\s*ppm/);
  });
});
