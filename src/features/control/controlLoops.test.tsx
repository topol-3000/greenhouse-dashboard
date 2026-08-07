/**
 * Automatic control, tested through the portal a customer actually uses.
 *
 * The rules worth pinning here are the three sentences the contract does not let
 * the portal say: a control loop has no name, its thresholds carry no unit, and
 * nothing states which way a policy acts or whether it is acting now. Each of
 * them looks like an obvious improvement until you read `openapi.json`, so each
 * is asserted rather than left to a code comment.
 */

import { describe, expect, it } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach } from "vitest";
import {
  backendRoutes,
  climateZoneCommands,
  commandList,
  commandListUrl,
  commandUrl,
  controlLoopsUrl,
  COMMAND_IDS,
  DEFAULT_DATASET,
  IDS,
  northLampLoop,
  page,
} from "../../test/fixtures";
import { controlZonePath } from "../../routes/routes";
import { renderPortal } from "../../test/harness";

const ZONE_URL = controlZonePath(IDS.northGreenhouse, IDS.climateZone);
const IRRIGATION_URL = controlZonePath(IDS.northGreenhouse, IDS.irrigationZone);

afterEach(() => {
  cleanup();
});

describe("the automatic control section", () => {
  it("describes a rule by the points it connects, never by a name", async () => {
    renderPortal({ path: ZONE_URL });

    const section = await screen.findByTestId("control-loops");
    const loop = within(section).getByTestId("control-loop");

    // The rule is described, and the identifier stays on screen. Nothing reads
    // as a label the backend supplied, because it supplied none.
    expect(loop).toHaveTextContent("Drives North lamp from North CO2");
    expect(loop).toHaveTextContent(northLampLoop.id);
  });

  it("shows both thresholds as bare numbers, with no unit attached", async () => {
    renderPortal({ path: ZONE_URL });

    const loop = within(await screen.findByTestId("control-loops")).getByTestId("control-loop");
    const text = loop.textContent ?? "";

    expect(text).toContain("400");
    expect(text).toContain("1,200");
    // The measured point publishes ppm. The contract says nothing about the
    // thresholds being in that unit, so they must not be rendered with it.
    expect(text).not.toMatch(/400\s*ppm/);
    expect(text).not.toMatch(/1,?200\s*ppm/);
  });

  it("says nothing about which way the rule acts or whether it is acting", async () => {
    renderPortal({ path: ZONE_URL });

    const section = await screen.findByTestId("control-loops");
    const text = section.textContent ?? "";

    for (const forbidden of [
      "above",
      "below",
      "turns on",
      "turns off",
      "Active",
      "Firing",
      "Satisfied",
      "Enabled",
      "Disabled",
      "Currently",
    ]) {
      expect(text).not.toContain(forbidden);
    }
    // And no current reading is pulled in beside a threshold to be compared.
    expect(within(section).queryByTestId("measurement-card")).toBeNull();
  });

  it("offers no way to create, edit or delete a rule", async () => {
    renderPortal({ path: ZONE_URL });

    const section = await screen.findByTestId("control-loops");
    expect(
      within(section).queryByRole("button", { name: /add|create|new|edit|delete/i }),
    ).toBeNull();
    expect(within(section).queryByRole("switch")).toBeNull();
    expect(section.querySelector("form")).toBeNull();
  });

  it("says a zone has no automatic control rather than leaving the section blank", async () => {
    renderPortal({ path: IRRIGATION_URL });

    const section = await screen.findByTestId("control-loops");
    expect(within(section).getByTestId("control-loops-empty")).toHaveTextContent(
      "The cloud API configures no control loop for North Irrigation",
    );
  });

  it("names the loop's points out of the configuration already read", async () => {
    const { api } = renderPortal({ path: ZONE_URL });
    await screen.findByTestId("control-loops");

    // Three point identifiers resolved, and no request per point: the facility
    // configuration document the workspace already polls carries all of them.
    expect(api.calls.some((url) => /\/points\/[^/]+$/.test(url))).toBe(false);
    expect(api.countFor(controlLoopsUrl(IDS.climateZone))).toBe(1);
  });

  it("renders a point the configuration does not describe as its identifier", async () => {
    const orphan = { ...northLampLoop, control_point_id: "bb000000-0000-4000-8000-0000000000ff" };
    renderPortal({
      path: ZONE_URL,
      routes: backendRoutes(DEFAULT_DATASET, {
        [controlLoopsUrl(IDS.climateZone)]: { body: page([orphan]) },
      }),
    });

    const loop = within(await screen.findByTestId("control-loops")).getByTestId("control-loop");
    expect(loop).toHaveTextContent("bb000000-0000-4000-8000-0000000000ff");
    expect(loop).toHaveTextContent("Name unavailable");
  });

  it("keeps the zone workspace usable when the rules cannot be read", async () => {
    renderPortal({
      path: ZONE_URL,
      routes: backendRoutes(DEFAULT_DATASET, {
        [controlLoopsUrl(IDS.climateZone)]: { networkError: true },
      }),
    });

    const section = await screen.findByTestId("control-loops");
    expect(within(section).getByTestId("request-error")).toBeInTheDocument();
    // The readings and the controls are untouched by it.
    expect(screen.getByTestId("measurement-cards")).toBeInTheDocument();
    expect(screen.getByTestId("manual-control")).toBeInTheDocument();
  });
});

describe("a command's control loop", () => {
  it("names the rule that issued an automatic command", async () => {
    renderPortal({
      path: `/activity?site=${IDS.riversideSite}&facility=${IDS.northGreenhouse}&zone=${IDS.climateZone}`,
      routes: backendRoutes(DEFAULT_DATASET, {
        [commandListUrl(IDS.climateZone)]: { body: commandList(climateZoneCommands) },
        [commandUrl(COMMAND_IDS.lampOnAutomatic)]: {
          body: climateZoneCommands.find((command) => command.id === COMMAND_IDS.lampOnAutomatic),
        },
      }),
    });

    await screen.findByTestId("activity-list");
    await userEvent.click(screen.getByTestId(`activity-row-${COMMAND_IDS.lampOnAutomatic}`));

    const resolved = await screen.findByTestId("command-details-loop");
    expect(resolved).toHaveTextContent("Drives North lamp from North CO2");
    // The identifier the contract published stays beside the description.
    expect(resolved).toHaveTextContent(northLampLoop.id);
  });

  it("still says a manual command had no control loop", async () => {
    renderPortal({
      path: `/activity?site=${IDS.riversideSite}&facility=${IDS.northGreenhouse}&zone=${IDS.climateZone}`,
      routes: backendRoutes(DEFAULT_DATASET, {
        [commandListUrl(IDS.climateZone)]: { body: commandList(climateZoneCommands) },
        [commandUrl(COMMAND_IDS.ventOn)]: {
          body: climateZoneCommands.find((command) => command.id === COMMAND_IDS.ventOn),
        },
      }),
    });

    await screen.findByTestId("activity-list");
    await userEvent.click(screen.getByTestId(`activity-row-${COMMAND_IDS.ventOn}`));

    expect(await screen.findByTestId("command-details-loop-absent")).toHaveTextContent(
      "None — a person asked for this command",
    );
  });
});
