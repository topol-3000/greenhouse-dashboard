/**
 * Manual control, end to end, over contract-valid fixtures.
 *
 * The tests are written as claims a customer could check: I can see which
 * equipment this zone lets me operate, I can tell what it reports from what I
 * asked for, nothing is sent until I confirm it, one confirmation sends one
 * command, and I am never told a command was applied before the cloud API says
 * so. The negative claims matter as much: a status point is never a target, a
 * `float` control point never grows a slider, a lost connection is never a
 * failure, and a command that never settles is never a rejection.
 */

import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COMMAND_OBSERVATION_WINDOW_MS,
  COMMAND_POLL_MS,
  MONITORING_POLL_MS,
} from "../../api/queries";
import { controlZonePath } from "../../routes/routes";
import {
  backendRoutes,
  climateZone,
  COMMAND_IDS,
  commandAcceptance,
  commandByKeyUrl,
  commandsUrl,
  commandUrl,
  DEFAULT_DATASET,
  facilityConfigurationUrl,
  HEALTH_URL,
  IDS,
  manualCommand,
  northGreenhouse,
  NOT_FOUND_BODY,
  POINT_IDS,
  pointTelemetryUrl,
  riversideSite,
  seedlingClimateZone,
} from "../../test/fixtures";
import type { Router } from "../../test/harness";
import { renderPortal } from "../../test/harness";

const ZONE_URL = controlZonePath(IDS.northGreenhouse, IDS.climateZone);
const IRRIGATION_URL = controlZonePath(IDS.northGreenhouse, IDS.irrigationZone);
const CONFIG_URL = facilityConfigurationUrl(IDS.northGreenhouse);
const COMMANDS_URL = commandsUrl();
const VENT_COMMAND_URL = commandUrl(COMMAND_IDS.ventOn);

const KEY_ONE = "ee000000-0000-4000-8000-00000000aaa1";
const KEY_TWO = "ee000000-0000-4000-8000-00000000aaa2";

/** Make the identifiers a submission generates predictable and assertable. */
function stubIdempotencyKeys(...keys: readonly string[]) {
  let issued = 0;
  vi.spyOn(globalThis.crypto, "randomUUID").mockImplementation(() => {
    const key = keys[issued] ?? keys[keys.length - 1] ?? KEY_ONE;
    issued += 1;
    return key as `${string}-${string}-${string}-${string}-${string}`;
  });
}

/** The actuator card for one point, found by the identifier the API published. */
function actuatorCard(pointId: string): HTMLElement {
  const card = screen.getByTestId("manual-control").querySelector(`[data-point-id="${pointId}"]`);
  if (card === null) {
    throw new Error(`No actuator card for ${pointId}`);
  }
  return card as HTMLElement;
}

/** The routes a control test needs on top of the topology fixture. */
function routes(extra: Router = {}): Router {
  return backendRoutes(DEFAULT_DATASET, extra);
}

/** Open the confirmation for one action on the vent, without submitting it. */
async function chooseVentAction(user: ReturnType<typeof userEvent.setup>, on = true) {
  await screen.findByTestId("actuator-cards");
  const card = actuatorCard(POINT_IDS.vent);
  const button = within(card).getByTestId(on ? "actuator-on" : "actuator-off");
  await user.click(button);
  return button;
}

beforeEach(() => {
  stubIdempotencyKeys(KEY_ONE, KEY_TWO);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("the controllable inventory on screen", () => {
  it("keeps the zone's context, its monitoring and the portal's navigation", async () => {
    renderPortal({ path: ZONE_URL });

    expect(await screen.findByTestId("zone-relationship")).toHaveTextContent(
      `${climateZone.name} is a control zone of the facility ${northGreenhouse.name}, which belongs to the site ${riversideSite.name}`,
    );
    expect(await screen.findByTestId("monitoring")).toBeInTheDocument();
    expect(await screen.findAllByTestId("measurement-card")).toHaveLength(4);

    const navigation = screen.getByRole("navigation", { name: "Primary" });
    expect(
      within(navigation)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Dashboard", "Greenhouses", "Activity"]);
  });

  it("labels the section and offers actions only where the contract proves them", async () => {
    renderPortal({ path: ZONE_URL });

    const control = await screen.findByRole("region", { name: "Manual control" });
    await within(control).findByTestId("actuator-cards");

    // Two supported actuators, each with two named actions.
    expect(within(actuatorCard(POINT_IDS.vent)).getByTestId("actuator-on")).toHaveAccessibleName(
      "Turn on North air temperature vent",
    );
    expect(within(actuatorCard(POINT_IDS.lamp)).getByTestId("actuator-off")).toHaveAccessibleName(
      "Turn off North lamp",
    );

    // The `float` control point is listed with the reason, and has no action.
    const dimmer = actuatorCard(POINT_IDS.dimmer);
    expect(within(dimmer).queryByTestId("actuator-on")).toBeNull();
    expect(within(dimmer).getByTestId("actuator-unsupported")).toHaveTextContent(
      "publishes no on/off values",
    );

    // Archived, and no feedback configured: two more reasons, still no action.
    expect(within(actuatorCard(POINT_IDS.archivedPump)).queryByTestId("actuator-on")).toBeNull();
    expect(within(actuatorCard(POINT_IDS.heater)).queryByTestId("actuator-on")).toBeNull();
  });

  it("never offers a measurement, a status point or a non-control-output as a target", async () => {
    renderPortal({ path: ZONE_URL });
    const control = await screen.findByTestId("manual-control");
    await within(control).findByTestId("actuator-cards");

    for (const pointId of [
      POINT_IDS.airTemp,
      POINT_IDS.leafWetness,
      POINT_IDS.humiditySensorStatus,
      POINT_IDS.ventStatus,
      // Named "North lamp power switch" and a `status` point.
      POINT_IDS.lampStatus,
      // An active boolean control point, assigned here as a safety interlock.
      POINT_IDS.interlock,
    ]) {
      expect(control.querySelector(`[data-point-id="${pointId}"]`)).toBeNull();
    }
  });

  it("invents no slider, no free-form field and no unlabelled toggle", async () => {
    renderPortal({ path: ZONE_URL });
    const control = await screen.findByTestId("manual-control");
    await within(control).findByTestId("actuator-cards");

    expect(within(control).queryByRole("slider")).toBeNull();
    expect(within(control).queryByRole("switch")).toBeNull();
    expect(within(control).queryByRole("checkbox")).toBeNull();
    expect(within(control).queryByRole("textbox")).toBeNull();
    expect(within(control).queryByRole("spinbutton")).toBeNull();
    // Every button says what it would ask for.
    for (const button of within(control).getAllByRole("button")) {
      expect(button.textContent?.trim()).not.toBe("");
    }
  });

  it("separates reported state from a value nobody reported", async () => {
    renderPortal({ path: ZONE_URL });
    await screen.findByTestId("actuator-cards");

    // The vent's reported point published `false`. That is a reading.
    const vent = within(actuatorCard(POINT_IDS.vent)).getByTestId("reported-state");
    expect(vent).toHaveTextContent("False");
    expect(vent).not.toHaveTextContent("No reported state yet");
    expect(within(actuatorCard(POINT_IDS.vent)).getByTestId("reported-state")).toBeInTheDocument();

    // The lamp's reported point has never reported.
    expect(within(actuatorCard(POINT_IDS.lamp)).getByTestId("reported-state")).toHaveTextContent(
      "No reported state yet",
    );
  });

  it("names the point the contract relates as the source of reported state", async () => {
    renderPortal({ path: ZONE_URL });
    await screen.findByTestId("actuator-cards");

    expect(actuatorCard(POINT_IDS.vent)).toHaveTextContent("North vent status");
    // The control point's own projection is `true`; it is never shown as the
    // reported state, which is the reported point's `false`.
    expect(
      within(actuatorCard(POINT_IDS.vent)).getByTestId("reported-state"),
    ).not.toHaveTextContent("True");
  });

  it("says truthfully that a zone has no manual controls", async () => {
    renderPortal({ path: IRRIGATION_URL });

    const empty = await screen.findByTestId("control-empty");
    expect(empty).toHaveTextContent("No manual controls are available for this zone");
    expect(empty).toHaveTextContent("not a failure to reach it");
    expect(screen.queryByTestId("control-request-error")).toBeNull();
  });

  it("renders no manual control for a zone the contract puts elsewhere", async () => {
    renderPortal({ path: controlZonePath(IDS.northGreenhouse, IDS.seedlingClimateZone) });

    expect(await screen.findByTestId("relationship-mismatch")).toHaveTextContent(
      seedlingClimateZone.name,
    );
    expect(screen.queryByTestId("manual-control")).toBeNull();
    expect(screen.queryByTestId("actuator-cards")).toBeNull();
  });

  it("shares one configuration request with monitoring", async () => {
    const { api } = renderPortal({ path: ZONE_URL });
    await screen.findByTestId("actuator-cards");
    await screen.findByTestId("measurement-cards");

    expect(api.countFor(CONFIG_URL)).toBe(1);
  });
});

describe("choosing an action", () => {
  it("sends nothing when an action is chosen", async () => {
    const user = userEvent.setup();
    const { api } = renderPortal({ path: ZONE_URL });

    await chooseVentAction(user);

    expect(await screen.findByTestId("command-confirmation")).toBeInTheDocument();
    expect(api.countFor(COMMANDS_URL)).toBe(0);
  });

  it("shows the whole target and the requested value before anything is sent", async () => {
    const user = userEvent.setup();
    renderPortal({ path: ZONE_URL });

    await chooseVentAction(user);
    const dialog = await screen.findByTestId("command-confirmation");

    const target = within(dialog).getByTestId("command-confirmation-target");
    expect(target).toHaveTextContent(riversideSite.name);
    expect(target).toHaveTextContent(northGreenhouse.name);
    expect(target).toHaveTextContent(climateZone.name);
    expect(target).toHaveTextContent("North air temperature vent");
    expect(within(dialog).getByTestId("command-confirmation-value")).toHaveTextContent("On");

    // The reported state is stated in the confirmation, as it stands now.
    expect(within(dialog).getByTestId("confirmation-reported-state")).toHaveTextContent("False");
    // And the command is described as a request, not as an outcome.
    expect(dialog).toHaveTextContent("may not be applied immediately");
  });

  it("is a modal dialog that owns focus and gives it back", async () => {
    const user = userEvent.setup();
    renderPortal({ path: ZONE_URL });

    const opener = await chooseVentAction(user);
    const dialog = await screen.findByTestId("command-confirmation");

    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Confirm this manual command");
    // Focus starts on the dialog rather than on either action, so the keystroke
    // that opened it cannot also press one.
    expect(document.activeElement).toBe(dialog);

    await user.click(within(dialog).getByTestId("command-cancel"));

    await waitFor(() => {
      expect(screen.queryByTestId("command-confirmation")).toBeNull();
    });
    expect(document.activeElement).toBe(opener);
  });

  it("sends nothing when the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    const { api } = renderPortal({ path: ZONE_URL });

    await chooseVentAction(user);
    await user.click(await screen.findByTestId("command-cancel"));

    expect(api.countFor(COMMANDS_URL)).toBe(0);
    expect(screen.queryByTestId("command-progress")).toBeNull();
  });

  it("closes on Escape without sending anything", async () => {
    const user = userEvent.setup();
    const { api } = renderPortal({ path: ZONE_URL });

    const opener = await chooseVentAction(user);
    await screen.findByTestId("command-confirmation");
    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByTestId("command-confirmation")).toBeNull();
    });
    expect(api.countFor(COMMANDS_URL)).toBe(0);
    expect(document.activeElement).toBe(opener);
  });

  it("is operable from the keyboard alone", async () => {
    const user = userEvent.setup();
    const { api } = renderPortal({
      path: ZONE_URL,
      routes: routes({
        [COMMANDS_URL]: { status: 201, body: commandAcceptance() },
        [VENT_COMMAND_URL]: { body: manualCommand() },
      }),
    });

    await screen.findByTestId("actuator-cards");
    const button = within(actuatorCard(POINT_IDS.vent)).getByTestId("actuator-on");
    button.focus();
    await user.keyboard("{Enter}");

    const dialog = await screen.findByTestId("command-confirmation");
    // Enter on the opener must not also press a button inside the dialog.
    expect(api.countFor(COMMANDS_URL)).toBe(0);

    await user.tab();
    await user.tab();
    expect(document.activeElement).toBe(within(dialog).getByTestId("command-confirm"));
    await user.keyboard("{Enter}");

    await screen.findByTestId("command-progress");
    expect(api.countFor(COMMANDS_URL)).toBe(1);
  });

  it("replaces an obsolete confirmation when another action is chosen", async () => {
    const user = userEvent.setup();
    const { api } = renderPortal({ path: ZONE_URL });

    await chooseVentAction(user, true);
    expect(await screen.findByTestId("command-confirmation-value")).toHaveTextContent("On");

    await user.click(
      within(await screen.findByTestId("command-confirmation")).getByTestId("command-cancel"),
    );
    await user.click(within(actuatorCard(POINT_IDS.lamp)).getByTestId("actuator-off"));

    const dialog = await screen.findByTestId("command-confirmation");
    expect(within(dialog).getByTestId("command-confirmation-value")).toHaveTextContent("Off");
    expect(dialog).toHaveTextContent("North lamp");
    expect(api.countFor(COMMANDS_URL)).toBe(0);
  });
});

describe("submitting one command", () => {
  it("sends exactly the contract's request, once", async () => {
    const user = userEvent.setup();
    const { api } = renderPortal({
      path: ZONE_URL,
      routes: routes({
        [COMMANDS_URL]: { status: 201, body: commandAcceptance() },
        [VENT_COMMAND_URL]: { body: manualCommand() },
      }),
    });

    await chooseVentAction(user);
    await user.click(await screen.findByTestId("command-confirm"));
    await screen.findByTestId("command-progress");

    const sent = api.requestsFor(COMMANDS_URL);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.method).toBe("POST");
    expect(sent[0]?.body).toEqual({
      control_zone_id: IDS.climateZone,
      target_point_id: POINT_IDS.vent,
      desired_value: true,
    });
    expect(sent[0]?.headers["idempotency-key"]).toBe(KEY_ONE);
  });

  it("sends one command however fast the confirmation is pressed", async () => {
    const user = userEvent.setup();
    const { api } = renderPortal({
      path: ZONE_URL,
      routes: routes({
        [COMMANDS_URL]: { status: 201, body: commandAcceptance() },
        [VENT_COMMAND_URL]: { body: manualCommand() },
      }),
    });

    await chooseVentAction(user);
    const confirm = await screen.findByTestId("command-confirm");
    await user.tripleClick(confirm);
    await screen.findByTestId("command-progress");

    expect(api.countFor(COMMANDS_URL)).toBe(1);
  });

  it("gives a different action a different identifier", async () => {
    const user = userEvent.setup();
    const lampCommand = manualCommand({
      id: COMMAND_IDS.lampOff,
      idempotency_key: KEY_TWO,
      target_point_id: POINT_IDS.lamp,
      reported_point_id: POINT_IDS.lampStatus,
      desired_value: false,
    });
    const { api } = renderPortal({
      path: ZONE_URL,
      routes: routes({
        [COMMANDS_URL]: (attempt) => ({
          status: 201,
          body: attempt === 1 ? commandAcceptance() : commandAcceptance(lampCommand),
        }),
        [VENT_COMMAND_URL]: { body: manualCommand() },
        [commandUrl(COMMAND_IDS.lampOff)]: { body: lampCommand },
      }),
    });

    await chooseVentAction(user);
    await user.click(await screen.findByTestId("command-confirm"));
    await screen.findByTestId("command-progress");

    await user.click(within(actuatorCard(POINT_IDS.lamp)).getByTestId("actuator-off"));
    await user.click(await screen.findByTestId("command-confirm"));
    await waitFor(() => {
      expect(api.countFor(COMMANDS_URL)).toBe(2);
    });

    const sent = api.requestsFor(COMMANDS_URL);
    expect(sent[0]?.headers["idempotency-key"]).toBe(KEY_ONE);
    expect(sent[1]?.headers["idempotency-key"]).toBe(KEY_TWO);
    expect(sent[1]?.body).toMatchObject({ target_point_id: POINT_IDS.lamp, desired_value: false });
  });

  it("does not call an Edge or gateway endpoint", async () => {
    const user = userEvent.setup();
    const { api } = renderPortal({
      path: ZONE_URL,
      routes: routes({
        [COMMANDS_URL]: { status: 201, body: commandAcceptance() },
        [VENT_COMMAND_URL]: { body: manualCommand() },
      }),
    });

    await chooseVentAction(user);
    await user.click(await screen.findByTestId("command-confirm"));
    await screen.findByTestId("command-progress");

    expect(api.calls.some((url) => url.includes("/edge/"))).toBe(false);
    expect(api.calls.some((url) => url.includes("/gateways"))).toBe(false);
    expect(api.calls.some((url) => url.includes("/control-loops"))).toBe(false);
  });
});

describe("following the command", () => {
  it("shows an accepted request as pending, never as applied", async () => {
    const user = userEvent.setup();
    renderPortal({
      path: ZONE_URL,
      routes: routes({
        [COMMANDS_URL]: { status: 201, body: commandAcceptance() },
        [VENT_COMMAND_URL]: { body: manualCommand() },
      }),
    });

    await chooseVentAction(user);
    await user.click(await screen.findByTestId("command-confirm"));

    const state = await screen.findByTestId("command-state");
    expect(state).toHaveTextContent("Pending");
    expect(state).not.toHaveTextContent("Applied");
    expect(state).toHaveTextContent("nothing has been reported as changed");
    // A live region, so the transition is announced rather than silent.
    expect(state).toHaveAttribute("role", "status");

    // What was asked for is labelled as a request, beside the reported state.
    expect(screen.getByTestId("command-desired-value")).toHaveTextContent("On");
    expect(within(actuatorCard(POINT_IDS.vent)).getByTestId("reported-state")).toHaveTextContent(
      "False",
    );
  });

  it("does not overwrite the reported state with what was asked for", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPortal({
      path: ZONE_URL,
      routes: routes({
        [COMMANDS_URL]: { status: 201, body: commandAcceptance() },
        [VENT_COMMAND_URL]: {
          body: manualCommand({ state: "applied", executed_at: "2026-01-04T09:07:00Z" }),
        },
      }),
    });

    await chooseVentAction(user);
    await user.click(await screen.findByTestId("command-confirm"));
    await screen.findByTestId("command-progress");

    // The creation answered `pending`, and the portal shows `pending` until the
    // command itself says otherwise.
    expect(screen.getByTestId("command-state")).toHaveTextContent("Pending");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(COMMAND_POLL_MS + 100);
    });

    // Applied, and the reported state has not moved. Both facts, side by side.
    await waitFor(() => {
      expect(screen.getByTestId("command-state")).toHaveTextContent("Applied");
    });
    expect(within(actuatorCard(POINT_IDS.vent)).getByTestId("reported-state")).toHaveTextContent(
      "False",
    );
    expect(screen.getByTestId("command-terminal-note")).toHaveTextContent("may not have changed");
  });

  it("polls a pending command and stops the moment it is terminal", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { api } = renderPortal({
      path: ZONE_URL,
      routes: routes({
        [COMMANDS_URL]: { status: 201, body: commandAcceptance() },
        [VENT_COMMAND_URL]: (attempt) => ({
          body:
            attempt < 2
              ? manualCommand({ acknowledged_at: "2026-01-04T09:06:30Z" })
              : manualCommand({ state: "applied", executed_at: "2026-01-04T09:07:00Z" }),
        }),
      }),
    });

    await chooseVentAction(user);
    await user.click(await screen.findByTestId("command-confirm"));
    await screen.findByTestId("command-progress");
    expect(api.countFor(VENT_COMMAND_URL)).toBe(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(COMMAND_POLL_MS + 100);
    });
    expect(api.countFor(VENT_COMMAND_URL)).toBe(1);
    expect(screen.getByTestId("command-state")).toHaveTextContent("Pending");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(COMMAND_POLL_MS + 100);
    });
    await waitFor(() => {
      expect(screen.getByTestId("command-state")).toHaveTextContent("Applied");
    });
    const settled = api.countFor(VENT_COMMAND_URL);

    // Terminal is terminal: no interval, and no retry, ever asks again.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(COMMAND_POLL_MS * 6);
    });
    expect(api.countFor(VENT_COMMAND_URL)).toBe(settled);
  });

  it("stops checking a command the cloud API says it does not have", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { api } = renderPortal({
      path: ZONE_URL,
      routes: routes({
        [COMMANDS_URL]: { status: 201, body: commandAcceptance() },
        [VENT_COMMAND_URL]: { status: 404, body: NOT_FOUND_BODY },
      }),
    });

    await chooseVentAction(user);
    await user.click(await screen.findByTestId("command-confirm"));
    await screen.findByTestId("command-progress");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(COMMAND_POLL_MS + 100);
    });
    await screen.findByTestId("command-missing");
    const seen = api.countFor(VENT_COMMAND_URL);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(COMMAND_POLL_MS * 6);
    });
    // One `404`, not one retry and one poll a second for the rest of the day.
    expect(api.countFor(VENT_COMMAND_URL)).toBe(seen);
    expect(seen).toBe(1);
  });

  it("keeps the last known command state when a check fails", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { api } = renderPortal({
      path: ZONE_URL,
      routes: routes({
        [COMMANDS_URL]: { status: 201, body: commandAcceptance() },
        [VENT_COMMAND_URL]: { body: manualCommand({ acknowledged_at: "2026-01-04T09:06:30Z" }) },
      }),
    });

    await chooseVentAction(user);
    await user.click(await screen.findByTestId("command-confirm"));
    await screen.findByTestId("command-progress");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(COMMAND_POLL_MS + 100);
    });

    api.setRoutes(
      routes({
        [COMMANDS_URL]: { status: 201, body: commandAcceptance() },
        [VENT_COMMAND_URL]: { networkError: true },
      }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(COMMAND_POLL_MS + 100);
    });

    // The failure is visible and the answer it failed to replace is still there.
    await screen.findByTestId("command-refresh-failure");
    expect(screen.getByTestId("command-state")).toHaveTextContent("Pending");
    expect(screen.getByTestId("command-desired-value")).toHaveTextContent("On");
    expect(screen.getByTestId("command-refresh-retry")).toBeInTheDocument();
  });

  it("calls an unsettled command unconfirmed, never failed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { api } = renderPortal({
      path: ZONE_URL,
      routes: routes({
        [COMMANDS_URL]: { status: 201, body: commandAcceptance() },
        [VENT_COMMAND_URL]: { body: manualCommand() },
      }),
    });

    await chooseVentAction(user);
    await user.click(await screen.findByTestId("command-confirm"));
    await screen.findByTestId("command-progress");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(COMMAND_OBSERVATION_WINDOW_MS + COMMAND_POLL_MS);
    });

    const unconfirmed = await screen.findByTestId("command-unconfirmed");
    expect(unconfirmed).toHaveTextContent("Status is still unconfirmed");
    expect(unconfirmed).toHaveTextContent("stopped checking automatically");
    expect(unconfirmed).not.toHaveTextContent("failed");
    expect(screen.getByTestId("command-state")).toHaveTextContent("Pending");

    // Nothing keeps asking on its own once the window is over.
    const seen = api.countFor(VENT_COMMAND_URL);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(COMMAND_POLL_MS * 8);
    });
    expect(api.countFor(VENT_COMMAND_URL)).toBe(seen);

    // And the customer can resume it deliberately.
    await user.click(screen.getByTestId("command-recheck"));
    await waitFor(() => {
      expect(api.countFor(VENT_COMMAND_URL)).toBeGreaterThan(seen);
    });
  });

  it("shows a rejection with the contract's own reason", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPortal({
      path: ZONE_URL,
      routes: routes({
        [COMMANDS_URL]: { status: 201, body: commandAcceptance() },
        [VENT_COMMAND_URL]: {
          body: manualCommand({
            state: "rejected",
            executed_at: "2026-01-04T09:07:00Z",
            rejection_reason: {
              code: "actuator_unreachable",
              message: "The gateway did not answer.",
            },
          }),
        },
      }),
    });

    await chooseVentAction(user);
    await user.click(await screen.findByTestId("command-confirm"));
    await screen.findByTestId("command-progress");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(COMMAND_POLL_MS + 100);
    });

    await waitFor(() => {
      expect(screen.getByTestId("command-state")).toHaveTextContent("Rejected");
    });
    const rejection = screen.getByTestId("command-rejection");
    expect(rejection).toHaveTextContent("The gateway did not answer.");
    expect(rejection).toHaveTextContent("actuator_unreachable");
  });

  it("says when a request replayed a command instead of creating one", async () => {
    const user = userEvent.setup();
    renderPortal({
      path: ZONE_URL,
      routes: routes({
        [COMMANDS_URL]: { status: 200, body: commandAcceptance(manualCommand(), "existing") },
        [VENT_COMMAND_URL]: { body: manualCommand() },
      }),
    });

    await chooseVentAction(user);
    await user.click(await screen.findByTestId("command-confirm"));

    expect(await screen.findByTestId("command-replayed")).toHaveTextContent(
      "nothing was sent a second time",
    );
  });
});

describe("when a command cannot be created", () => {
  it("keeps the actuators and the measurements when the request is refused", async () => {
    const user = userEvent.setup();
    const { api } = renderPortal({
      path: ZONE_URL,
      routes: routes({
        [COMMANDS_URL]: {
          status: 422,
          body: { error: { code: "validation_error", message: "no", details: {} } },
        },
      }),
    });

    await chooseVentAction(user);
    await user.click(await screen.findByTestId("command-confirm"));

    const refused = await screen.findByTestId("command-refused");
    expect(refused).toHaveTextContent("refused this command as invalid (422)");
    // Nothing is retried, and nothing else on the page is lost.
    expect(api.countFor(COMMANDS_URL)).toBe(1);
    expect(screen.getAllByTestId("measurement-card").length).toBeGreaterThan(0);
    expect(within(actuatorCard(POINT_IDS.vent)).getByTestId("reported-state")).toHaveTextContent(
      "False",
    );
    expect(screen.getByTestId("zone-points")).toBeInTheDocument();
  });

  it("does not retry a conflict, and says nothing was sent again", async () => {
    const user = userEvent.setup();
    const { api } = renderPortal({
      path: ZONE_URL,
      routes: routes({
        [COMMANDS_URL]: {
          status: 409,
          body: { error: { code: "idempotency_key_conflict", message: "no", details: {} } },
        },
      }),
    });

    await chooseVentAction(user);
    await user.click(await screen.findByTestId("command-confirm"));

    expect(await screen.findByTestId("command-refused")).toHaveTextContent(
      "already stored a different command",
    );
    expect(api.countFor(COMMANDS_URL)).toBe(1);
  });

  it("keeps a lost response ambiguous rather than calling it a failure", async () => {
    const user = userEvent.setup();
    const { api } = renderPortal({
      path: ZONE_URL,
      routes: routes({ [COMMANDS_URL]: { networkError: true } }),
    });

    await chooseVentAction(user);
    await user.click(await screen.findByTestId("command-confirm"));

    const ambiguous = await screen.findByTestId("command-ambiguous");
    expect(ambiguous).toHaveTextContent("may or may not have been created");
    expect(ambiguous).not.toHaveTextContent("Command failed");
    // Nothing is sent again on the portal's own initiative.
    expect(api.countFor(COMMANDS_URL)).toBe(1);
    // And the actuator's actions stay closed until it is resolved.
    expect(within(actuatorCard(POINT_IDS.vent)).getByTestId("actuator-on")).toBeDisabled();
  });

  it("resolves a lost response through the contract's idempotency-key lookup", async () => {
    const user = userEvent.setup();
    const { api } = renderPortal({
      path: ZONE_URL,
      routes: routes({
        [COMMANDS_URL]: { networkError: true },
        [commandByKeyUrl(KEY_ONE)]: {
          body: { items: [manualCommand({ idempotency_key: KEY_ONE })] },
        },
        [VENT_COMMAND_URL]: { body: manualCommand({ idempotency_key: KEY_ONE }) },
      }),
    });

    await chooseVentAction(user);
    await user.click(await screen.findByTestId("command-confirm"));
    await screen.findByTestId("command-ambiguous");

    await user.click(screen.getByTestId("command-lookup"));

    // The command it created is adopted, with its real lifecycle.
    expect(await screen.findByTestId("command-state")).toHaveTextContent("Pending");
    expect(api.requestsFor(commandByKeyUrl(KEY_ONE))).toHaveLength(1);
    // The collection was never scanned for something that looked similar.
    expect(api.calls.filter((url) => url === COMMANDS_URL)).toHaveLength(1);
  });

  it("says plainly when the lookup proves nothing was created", async () => {
    const user = userEvent.setup();
    renderPortal({
      path: ZONE_URL,
      routes: routes({
        [COMMANDS_URL]: { networkError: true },
        [commandByKeyUrl(KEY_ONE)]: { body: { items: [] } },
      }),
    });

    await chooseVentAction(user);
    await user.click(await screen.findByTestId("command-confirm"));
    await screen.findByTestId("command-ambiguous");
    await user.click(screen.getByTestId("command-lookup"));

    expect(await screen.findByTestId("command-resolved-absent")).toHaveTextContent(
      "so nothing was created",
    );
  });

  it("replays one ambiguous intent under its original identifier", async () => {
    const user = userEvent.setup();
    const { api } = renderPortal({
      path: ZONE_URL,
      routes: routes({
        [COMMANDS_URL]: (attempt) =>
          attempt === 1
            ? { networkError: true }
            : {
                status: 200,
                body: commandAcceptance(manualCommand({ idempotency_key: KEY_ONE }), "existing"),
              },
        [VENT_COMMAND_URL]: { body: manualCommand({ idempotency_key: KEY_ONE }) },
      }),
    });

    await chooseVentAction(user);
    await user.click(await screen.findByTestId("command-confirm"));
    await screen.findByTestId("command-ambiguous");

    await user.click(screen.getByTestId("command-retry-ambiguous"));
    await screen.findByTestId("command-progress");

    const sent = api.requestsFor(COMMANDS_URL);
    expect(sent).toHaveLength(2);
    // One intent, one key: the replay is the same command, not a second one.
    expect(sent[0]?.headers["idempotency-key"]).toBe(KEY_ONE);
    expect(sent[1]?.headers["idempotency-key"]).toBe(KEY_ONE);
    expect(sent[1]?.body).toEqual(sent[0]?.body);
    expect(screen.getByTestId("command-replayed")).toBeInTheDocument();
  });

  it("refuses to adopt a command for a different target", async () => {
    const user = userEvent.setup();
    renderPortal({
      path: ZONE_URL,
      routes: routes({
        [COMMANDS_URL]: {
          status: 201,
          body: commandAcceptance(
            manualCommand({ target_point_id: POINT_IDS.lamp, id: COMMAND_IDS.lampOff }),
          ),
        },
      }),
    });

    await chooseVentAction(user);
    await user.click(await screen.findByTestId("command-confirm"));

    expect(await screen.findByTestId("command-refused")).toHaveTextContent(
      "a command for a different target",
    );
    expect(screen.queryByTestId("command-progress")).toBeNull();
  });
});

describe("partial availability", () => {
  it("keeps monitoring and topology when the configuration cannot be read", async () => {
    renderPortal({
      path: ZONE_URL,
      routes: routes({ [CONFIG_URL]: { networkError: true } }),
    });

    // The section says so for itself and does not take the page down with it.
    expect(await screen.findByTestId("control-request-error")).toHaveTextContent(
      "Manual controls could not be loaded",
    );
    expect(screen.getByTestId("zone-points")).toBeInTheDocument();
    expect(screen.getByTestId("zone-meta")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
  });

  it("keeps the actuators when a background configuration refresh fails", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { api } = renderPortal({ path: ZONE_URL });
    await screen.findByTestId("actuator-cards");

    api.setRoutes(routes({ [CONFIG_URL]: { networkError: true } }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MONITORING_POLL_MS + 100);
    });

    await screen.findByTestId("control-refresh-failure");
    expect(within(actuatorCard(POINT_IDS.vent)).getByTestId("reported-state")).toHaveTextContent(
      "False",
    );
    expect(within(actuatorCard(POINT_IDS.vent)).getByTestId("actuator-on")).toBeEnabled();
  });

  it("keeps actuators and a command on screen when health fails", async () => {
    const user = userEvent.setup();
    const { api } = renderPortal({
      path: ZONE_URL,
      routes: routes({
        [COMMANDS_URL]: { status: 201, body: commandAcceptance() },
        [VENT_COMMAND_URL]: { body: manualCommand() },
      }),
    });

    await chooseVentAction(user);
    await user.click(await screen.findByTestId("command-confirm"));
    await screen.findByTestId("command-progress");

    api.setRoutes(
      routes({
        [HEALTH_URL]: { networkError: true },
        [COMMANDS_URL]: { status: 201, body: commandAcceptance() },
        [VENT_COMMAND_URL]: { body: manualCommand() },
      }),
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId("command-state")).toHaveTextContent("Pending");
    expect(screen.getByTestId("actuator-cards")).toBeInTheDocument();
  });

  it("leaves an existing history selection exactly where it was", async () => {
    const user = userEvent.setup();
    const { api } = renderPortal({
      path: `${ZONE_URL}?point=${POINT_IDS.airTemp}`,
      routes: routes({
        [COMMANDS_URL]: { status: 201, body: commandAcceptance() },
        [VENT_COMMAND_URL]: { body: manualCommand() },
      }),
    });

    await screen.findByTestId("history-window");
    const before = api.countFor(pointTelemetryUrl(POINT_IDS.airTemp));

    await chooseVentAction(user);
    await user.click(await screen.findByTestId("command-confirm"));
    await screen.findByTestId("command-progress");

    // The selected point is still selected, and its history is still on screen.
    expect(screen.getByTestId("history-window")).toBeInTheDocument();
    expect(
      within(
        document.querySelector(`[data-point-id="${POINT_IDS.airTemp}"]`) as HTMLElement,
      ).getByTestId("select-point"),
    ).toHaveTextContent("Showing history of North air temperature");
    // And nothing re-requested it because of the command.
    expect(api.countFor(pointTelemetryUrl(POINT_IDS.airTemp))).toBe(before);
  });
});

describe("what manual control does not add", () => {
  it("renders no activity feed, schedule, alert or automation control", async () => {
    renderPortal({ path: ZONE_URL });
    const control = await screen.findByTestId("manual-control");
    await within(control).findByTestId("actuator-cards");

    // Command history lives on the Activity route. The workspace shows the one
    // command the customer created here and nothing resembling a feed.
    expect(screen.queryByTestId("activity-list")).toBeNull();

    const page = screen.getByTestId("control-zone-page").textContent ?? "";
    for (const forbidden of [
      "Schedule",
      "Alert",
      "Automation",
      "Control loop",
      "Threshold",
      "Recipe",
      "Grow cycle",
      "Simulation",
    ]) {
      expect(page).not.toContain(forbidden);
    }
  });

  it("adds no navigation entry of its own", async () => {
    renderPortal({ path: ZONE_URL });
    await screen.findByTestId("actuator-cards");

    // Dashboard, Greenhouses and Activity. Manual control is a section of a
    // zone's workspace and is reached through the topology, never from the
    // primary navigation.
    const navigation = screen.getByRole("navigation", { name: "Primary" });
    expect(within(navigation).getAllByRole("link")).toHaveLength(3);
    expect(within(navigation).queryByRole("link", { name: /control/i })).toBeNull();
  });
});
