/**
 * Activity, tested through the portal a customer actually uses.
 *
 * The whole application is rendered at a real address over a stubbed backend
 * whose routing table is keyed on the exact URL the API boundary is expected to
 * build. That is deliberate: it is what proves the zone-scoped query is the
 * contract's own operation with the contract's own filters, and a client that
 * quietly changes a parameter fails here rather than silently 404ing in
 * production.
 *
 * The assertions are about what a customer can see and what the portal asked
 * for. What they are mostly about is the difference between three facts the
 * contract keeps apart — what was requested, what is reported, and how far the
 * command got — and the several ways a screen could blur them into a lie.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  COMMAND_IDS,
  controlLoopsUrl,
  CONTROL_LOOP_IDS,
  IDS,
  POINT_IDS,
  backendRoutes,
  climateZoneCommands,
  commandAcceptance,
  commandList,
  commandListUrl,
  commandsUrl,
  commandUrl,
  facilityConfigurationUrl,
  irrigationZoneCommand,
  manualCommand,
  NOT_FOUND_BODY,
} from "../../test/fixtures";
import { controlZonePath } from "../../routes/routes";
import type { Router, RouteReply } from "../../test/harness";
import { renderPortal } from "../../test/harness";
import { COMMAND_OBSERVATION_WINDOW_MS, COMMAND_POLL_MS } from "../../api/queries";

/** The Activity address for the climate zone of the North Greenhouse. */
const ZONE_ACTIVITY = `/activity?site=${IDS.riversideSite}&facility=${IDS.northGreenhouse}&zone=${IDS.climateZone}`;

/** Routes that answer the default window, plus whatever a test adds. */
function activityRoutes(extra: Router = {}): Router {
  return backendRoutes(undefined, {
    [commandListUrl(IDS.climateZone)]: { body: commandList(climateZoneCommands) },
    ...extra,
  });
}

/** The row element for one command. */
function row(commandId: string): HTMLElement {
  return screen.getByTestId(`activity-row-${commandId}`);
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("reaching Activity", () => {
  it("offers Activity in the primary navigation, after Greenhouses", async () => {
    renderPortal();

    const navigation = screen.getByRole("navigation", { name: "Primary" });
    const links = within(navigation).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Dashboard", "Greenhouses", "Activity"]);

    await userEvent.click(within(navigation).getByRole("link", { name: "Activity" }));
    expect(await screen.findByTestId("activity-page")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Activity" })).toBeInTheDocument();
  });

  it("renders /activity directly, and asks for nothing until a zone is chosen", async () => {
    const { api } = renderPortal({ path: "/activity" });

    expect(await screen.findByTestId("activity-page")).toBeInTheDocument();
    expect(await screen.findByTestId("activity-needs-selection")).toBeInTheDocument();
    expect(screen.queryByTestId("activity-list")).toBeNull();

    // No zone means no command window: the portal does not read one facility's
    // commands to fill a page nobody scoped.
    await waitFor(() => {
      expect(screen.getByTestId("activity-site")).toBeInTheDocument();
    });
    expect(api.calls.some((url) => url.includes("/commands"))).toBe(false);
  });

  it("scopes the window with the contract's own filters", async () => {
    const { api } = renderPortal({ path: ZONE_ACTIVITY, routes: activityRoutes() });

    await screen.findByTestId("activity-list");

    expect(api.countFor(commandListUrl(IDS.climateZone))).toBe(1);
    // One window for four commands: no per-command request of any kind.
    expect(api.calls.filter((url) => url.startsWith("/api/v1/commands"))).toHaveLength(1);
  });

  it("consumes no Edge or write operation, and reads control loops once per zone", async () => {
    const { api } = renderPortal({ path: ZONE_ACTIVITY, routes: activityRoutes() });
    await screen.findByTestId("activity-list");

    await userEvent.click(row(COMMAND_IDS.ventOn));
    await screen.findByTestId("command-details");

    for (const request of api.requests) {
      expect(request.method).toBe("GET");
      expect(request.url).not.toContain("/edge/");
      expect(request.url).not.toContain("acknowledgement");
    }
    // The zone's loops are one read for the whole window, not one per row and
    // not one per command opened. Opening a second command adds nothing.
    expect(new Set(api.calls.filter((url) => url.includes("/control-loops"))).size).toBe(1);
    expect(api.countFor(controlLoopsUrl(IDS.climateZone))).toBe(1);
  });
});

describe("the selection in the address", () => {
  it("restores site, facility and zone from the URL alone", async () => {
    renderPortal({ path: ZONE_ACTIVITY, routes: activityRoutes() });

    await screen.findByTestId("activity-list");
    expect(screen.getByTestId("activity-site")).toHaveValue(IDS.riversideSite);
    expect(screen.getByTestId("activity-facility")).toHaveValue(IDS.northGreenhouse);
    expect(screen.getByTestId("activity-zone")).toHaveValue(IDS.climateZone);
    expect(screen.getByTestId("activity-scope")).toHaveTextContent("North Climate");
  });

  it("restores the selected command too, and reopens its details", async () => {
    renderPortal({
      path: `${ZONE_ACTIVITY}&command=${COMMAND_IDS.lampOnApplied}`,
      routes: activityRoutes({
        [commandUrl(COMMAND_IDS.lampOnApplied)]: {
          body: climateZoneCommands.find((c) => c.id === COMMAND_IDS.lampOnApplied),
        },
      }),
    });

    expect(await screen.findByTestId("command-details-state")).toHaveTextContent("Applied");
    expect(screen.getByTestId("command-details")).toBeInTheDocument();
  });

  it("carries filters and the command through Back and Forward", async () => {
    renderPortal({
      path: ZONE_ACTIVITY,
      history: true,
      routes: activityRoutes({
        [commandListUrl(IDS.climateZone, { source: "manual" })]: {
          body: commandList(climateZoneCommands.filter((c) => c.source === "manual")),
        },
        [commandUrl(COMMAND_IDS.ventOn)]: { body: manualCommand() },
      }),
    });

    await screen.findByTestId("activity-list");

    // Narrow to manual, then open a command: two states worth returning to.
    await userEvent.selectOptions(screen.getByTestId("activity-source"), "manual");
    await waitFor(() => {
      expect(screen.queryByTestId(`activity-row-${COMMAND_IDS.lampOnAutomatic}`)).toBeNull();
    });

    await userEvent.click(row(COMMAND_IDS.ventOn));
    await screen.findByTestId("command-details");

    // Back closes the details and leaves the filter where it was.
    await userEvent.click(screen.getByTestId("history-back"));
    await waitFor(() => {
      expect(screen.queryByTestId("command-details")).toBeNull();
    });
    expect(screen.getByTestId("activity-source")).toHaveValue("manual");

    // Back again drops the filter, and Forward restores it.
    await userEvent.click(screen.getByTestId("history-back"));
    await waitFor(() => {
      expect(screen.getByTestId("activity-source")).toHaveValue("");
    });

    await userEvent.click(screen.getByTestId("history-forward"));
    await waitFor(() => {
      expect(screen.getByTestId("activity-source")).toHaveValue("manual");
    });
  });

  it("closing details removes only the command", async () => {
    renderPortal({
      path: `${ZONE_ACTIVITY}&point=${POINT_IDS.vent}&source=manual&command=${COMMAND_IDS.ventOn}`,
      routes: activityRoutes({
        [commandListUrl(IDS.climateZone, {
          targetPointId: POINT_IDS.vent,
          source: "manual",
        })]: { body: commandList([manualCommand()]) },
        [commandUrl(COMMAND_IDS.ventOn)]: { body: manualCommand() },
      }),
    });

    await screen.findByTestId("command-details");
    await userEvent.click(screen.getByTestId("command-details-close"));

    await waitFor(() => {
      expect(screen.queryByTestId("command-details")).toBeNull();
    });
    expect(screen.getByTestId("activity-source")).toHaveValue("manual");
    expect(screen.getByTestId("activity-point")).toHaveValue(POINT_IDS.vent);
    expect(screen.getByTestId("activity-list")).toBeInTheDocument();
  });

  it("degrades safely for a facility the selected site does not own", async () => {
    renderPortal({
      path: `/activity?site=${IDS.harbourSite}&facility=${IDS.northGreenhouse}`,
      routes: activityRoutes(),
    });

    await screen.findByTestId("activity-facility-note");
    expect(screen.getByTestId("activity-needs-selection")).toBeInTheDocument();
    expect(screen.getByTestId("activity-site")).toHaveValue(IDS.harbourSite);
  });

  it("degrades safely for an unknown zone, source and point", async () => {
    const { api } = renderPortal({
      path: `/activity?facility=${IDS.northGreenhouse}&zone=${IDS.unknownZone}&source=telepathy`,
      routes: activityRoutes(),
    });

    await screen.findByTestId("activity-zone-note");
    expect(screen.getByTestId("activity-source-note")).toBeInTheDocument();
    // An unrecognised zone selects nothing, so nothing is requested for it.
    expect(api.calls.some((url) => url.includes("/commands"))).toBe(false);
  });

  it("shows every command when the point in the address is not of this zone", async () => {
    const { api } = renderPortal({
      path: `${ZONE_ACTIVITY}&point=${POINT_IDS.airTemp}`,
      routes: activityRoutes(),
    });

    await screen.findByTestId("activity-point-note");
    await screen.findByTestId("activity-list");

    // The unrecognised filter is dropped rather than sent: an unfiltered window
    // with a note beats a filtered window the contract cannot justify.
    expect(api.countFor(commandListUrl(IDS.climateZone))).toBe(1);
    expect(api.calls.some((url) => url.includes(`target_point_id=${POINT_IDS.airTemp}`))).toBe(
      false,
    );
  });

  it("filters by actuator through the backend when the zone assigns it", async () => {
    const { api } = renderPortal({
      path: `${ZONE_ACTIVITY}&point=${POINT_IDS.vent}`,
      routes: activityRoutes({
        [commandListUrl(IDS.climateZone, { targetPointId: POINT_IDS.vent })]: {
          body: commandList([manualCommand()]),
        },
      }),
    });

    await screen.findByTestId("activity-list");
    expect(api.countFor(commandListUrl(IDS.climateZone, { targetPointId: POINT_IDS.vent }))).toBe(
      1,
    );
    expect(screen.queryByTestId("activity-point-note")).toBeNull();
  });
});

describe("what a row says", () => {
  it("distinguishes manual from automatic, and On from Off", async () => {
    renderPortal({ path: ZONE_ACTIVITY, routes: activityRoutes() });
    await screen.findByTestId("activity-list");

    const manual = within(row(COMMAND_IDS.ventOn));
    expect(manual.getByTestId("activity-row-source")).toHaveTextContent("Manual");
    expect(manual.getByTestId("activity-row-source")).toHaveTextContent("manual");
    expect(manual.getByTestId("activity-row-desired")).toHaveTextContent("On");

    const automatic = within(row(COMMAND_IDS.lampOnAutomatic));
    expect(automatic.getByTestId("activity-row-source")).toHaveTextContent("Automatic");
    expect(automatic.getByTestId("activity-row-source")).toHaveTextContent("control_loop");

    const off = within(row(COMMAND_IDS.ventOffRejected));
    expect(off.getByTestId("activity-row-desired")).toHaveTextContent("Off");
  });

  it("names the target actuator from configuration, not from the command", async () => {
    renderPortal({ path: ZONE_ACTIVITY, routes: activityRoutes() });
    await screen.findByTestId("activity-list");

    expect(row(COMMAND_IDS.ventOn)).toHaveTextContent("North air temperature vent");
    expect(row(COMMAND_IDS.lampOnApplied)).toHaveTextContent("North lamp");
  });

  it("shows pending without acknowledgement as pending, never as failed", async () => {
    renderPortal({ path: ZONE_ACTIVITY, routes: activityRoutes() });
    await screen.findByTestId("activity-list");

    const pending = within(row(COMMAND_IDS.ventOn));
    expect(pending.getByTestId("activity-row-state")).toHaveTextContent("Pending");
    expect(pending.getByTestId("activity-row-receipt")).toHaveTextContent("Receipt not confirmed");

    const text = row(COMMAND_IDS.ventOn).textContent ?? "";
    for (const forbidden of ["Failed", "Rejected", "offline", "Applied"]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("shows an acknowledged pending command as received, not as applied", async () => {
    renderPortal({ path: ZONE_ACTIVITY, routes: activityRoutes() });
    await screen.findByTestId("activity-list");

    const acknowledged = within(row(COMMAND_IDS.lampOnAutomatic));
    expect(acknowledged.getByTestId("activity-row-state")).toHaveTextContent("Pending");
    expect(acknowledged.getByTestId("activity-row-receipt")).toHaveTextContent(
      "Received by the greenhouse",
    );
    // Receipt is not a fourth state. The row no longer repeats the raw enum
    // beside a badge that is its own case variant — that fact lives in the
    // details dialog's `Command state` row, which is asserted there.
    expect(row(COMMAND_IDS.lampOnAutomatic).textContent ?? "").not.toContain("Applied");
    // The source enum stays, because `Automatic` and `control_loop` are two
    // different facts rather than one word twice.
    expect(acknowledged.getByTestId("activity-row-source")).toHaveTextContent("control_loop");
  });

  it("shows applied as terminal success and rejected with its typed reason", async () => {
    renderPortal({ path: ZONE_ACTIVITY, routes: activityRoutes() });
    await screen.findByTestId("activity-list");

    expect(
      within(row(COMMAND_IDS.lampOnApplied)).getByTestId("activity-row-state"),
    ).toHaveTextContent("Applied");
    expect(
      within(row(COMMAND_IDS.lampOnApplied)).getByTestId("activity-row-executed"),
    ).toBeInTheDocument();

    const rejected = within(row(COMMAND_IDS.ventOffRejected));
    expect(rejected.getByTestId("activity-row-state")).toHaveTextContent("Rejected");
    const reason = rejected.getByTestId("activity-row-rejection");
    expect(reason).toHaveTextContent("A safety interlock is engaged for this actuator.");
    expect(reason).toHaveTextContent("actuator_interlocked");
  });

  it("keeps the backend's newest-first order rather than imposing one", async () => {
    renderPortal({ path: ZONE_ACTIVITY, routes: activityRoutes() });
    const list = await screen.findByTestId("activity-list");

    const ids = within(list)
      .getAllByRole("button")
      .map((button) => button.getAttribute("data-command-id"));
    expect(ids).toEqual(climateZoneCommands.map((command) => command.id));
  });

  it("shows a command whose point the configuration cannot name", async () => {
    renderPortal({
      path: ZONE_ACTIVITY,
      routes: activityRoutes({
        [facilityConfigurationUrl(IDS.northGreenhouse)]: { status: 500, body: {} },
      }),
    });

    await screen.findByTestId("activity-configuration-error");
    await screen.findByTestId("activity-list");
    // The command is history the API published; a label it cannot resolve is
    // not a reason to hide it.
    expect(row(COMMAND_IDS.ventOn)).toHaveTextContent(POINT_IDS.vent);
    expect(row(COMMAND_IDS.ventOn)).toHaveTextContent("Name unavailable");
    expect(within(row(COMMAND_IDS.ventOn)).getByTestId("activity-row-state")).toHaveTextContent(
      "Pending",
    );
  });
});

describe("command details", () => {
  async function openDetails(commandId: string, extra: Router = {}) {
    const command = climateZoneCommands.find((candidate) => candidate.id === commandId);
    const rendered = renderPortal({
      path: ZONE_ACTIVITY,
      routes: activityRoutes({ [commandUrl(commandId)]: { body: command }, ...extra }),
    });
    await screen.findByTestId("activity-list");
    await userEvent.click(row(commandId));
    return { ...rendered, dialog: await screen.findByTestId("command-details") };
  }

  it("reads the authoritative command and shows its whole identity", async () => {
    const { api, dialog } = await openDetails(COMMAND_IDS.ventOffRejected);

    expect(api.countFor(commandUrl(COMMAND_IDS.ventOffRejected))).toBe(1);

    const meta = within(dialog).getByTestId("command-details-meta");
    expect(meta).toHaveTextContent(COMMAND_IDS.ventOffRejected);
    expect(meta).toHaveTextContent("Riverside");
    expect(meta).toHaveTextContent("North Greenhouse");
    expect(meta).toHaveTextContent("North Climate");
    expect(meta).toHaveTextContent("North air temperature vent");
    expect(meta).toHaveTextContent("North vent status");
    expect(within(dialog).getByTestId("command-details-rejection")).toHaveTextContent(
      "actuator_interlocked",
    );
  });

  it("shows a control loop and trigger for an automatic command", async () => {
    const { dialog } = await openDetails(COMMAND_IDS.lampOnAutomatic);

    expect(within(dialog).getByTestId("command-details-meta")).toHaveTextContent(
      CONTROL_LOOP_IDS.lampSchedule,
    );
    expect(within(dialog).getByTestId("command-details-meta")).toHaveTextContent(
      CONTROL_LOOP_IDS.triggerSample,
    );
    expect(within(dialog).getByTestId("command-details-source-meaning")).toHaveTextContent(
      "control system",
    );
    // Explaining automation is not offering to configure it.
    for (const forbidden of ["Edit", "Configure", "Disable", "New control loop"]) {
      expect(dialog.textContent ?? "").not.toContain(forbidden);
    }
    expect(within(dialog).queryAllByRole("button", { name: /loop|automation/i })).toHaveLength(0);
  });

  it("invents no control loop or trigger for a manual command", async () => {
    const { dialog } = await openDetails(COMMAND_IDS.ventOn);

    expect(within(dialog).getByTestId("command-details-loop-absent")).toHaveTextContent(
      "None — a person asked for this command",
    );
    expect(within(dialog).getByTestId("command-details-trigger-absent")).toBeInTheDocument();
    expect(dialog.textContent ?? "").not.toContain(CONTROL_LOOP_IDS.lampSchedule);
  });

  it("keeps requested, reported and lifecycle apart when they disagree", async () => {
    // A rejected request to turn the vent *off*, beside a reported `false` that
    // happens to match it. The reading is not evidence, and the command stays
    // rejected.
    const { dialog } = await openDetails(COMMAND_IDS.ventOffRejected);

    expect(within(dialog).getByTestId("command-details-desired")).toHaveTextContent("Off");
    expect(within(dialog).getByTestId("command-reported-state")).toHaveTextContent("False");
    expect(within(dialog).getByTestId("command-details-state")).toHaveTextContent("Rejected");
  });

  it("renders a reported false as a reading, not as missing data", async () => {
    const { dialog } = await openDetails(COMMAND_IDS.ventOn);

    const reported = within(dialog).getByTestId("command-reported-state");
    expect(reported).toHaveTextContent("False");
    expect(reported.textContent ?? "").not.toContain("No reported state yet");
    // The control point's own projection is `true`. It is neither requested nor
    // reported, and it must not appear as either.
    expect(within(dialog).getByTestId("command-details-desired")).toHaveTextContent("On");
  });

  it("says so explicitly when there is no reported state at all", async () => {
    const { dialog } = await openDetails(COMMAND_IDS.lampOnApplied);

    expect(within(dialog).getByTestId("command-reported-state")).toHaveTextContent(
      "No reported state yet",
    );
    // Applied is still terminal success. It does not manufacture a reading.
    expect(within(dialog).getByTestId("command-details-state")).toHaveTextContent("Applied");
    expect(within(dialog).getByTestId("command-details-terminal")).toBeInTheDocument();
  });

  it("keeps the command when the reported state cannot be loaded", async () => {
    const { dialog } = await openDetails(COMMAND_IDS.ventOn, {
      [facilityConfigurationUrl(IDS.northGreenhouse)]: { networkError: true },
    });

    expect(await within(dialog).findByTestId("command-reported-unavailable")).toBeInTheDocument();
    // One failed supporting request does not erase the command's own facts.
    expect(within(dialog).getByTestId("command-details-meta")).toHaveTextContent(
      COMMAND_IDS.ventOn,
    );
    expect(within(dialog).getByTestId("command-details-desired")).toHaveTextContent("On");
    expect(within(dialog).getByTestId("command-details-state")).toHaveTextContent("Pending");
  });

  it("refuses a command the contract places in another control zone", async () => {
    renderPortal({
      path: `${ZONE_ACTIVITY}&command=${COMMAND_IDS.otherZone}`,
      routes: activityRoutes({
        [commandUrl(COMMAND_IDS.otherZone)]: { body: irrigationZoneCommand },
      }),
    });

    expect(await screen.findByTestId("command-outside-context")).toBeInTheDocument();
    // Not adopted, and nothing of it is drawn as though it belonged here.
    expect(screen.queryByTestId("command-details-meta")).toBeNull();
    expect(screen.getByTestId("activity-list")).toBeInTheDocument();
  });

  it("reports a command the cloud API does not have", async () => {
    renderPortal({
      path: `${ZONE_ACTIVITY}&command=${COMMAND_IDS.ventOn}`,
      routes: activityRoutes({
        [commandUrl(COMMAND_IDS.ventOn)]: { status: 404, body: NOT_FOUND_BODY },
      }),
    });

    expect(await screen.findByTestId("command-details-missing")).toBeInTheDocument();
  });
});

describe("following an open command", () => {
  /** Routes that answer a command with a different state on each attempt. */
  function lifecycle(states: readonly RouteReply[]): Router {
    return activityRoutes({
      [commandUrl(COMMAND_IDS.ventOn)]: (attempt: number) =>
        states[Math.min(attempt, states.length) - 1] ?? {},
    });
  }

  const OPEN_PENDING = `${ZONE_ACTIVITY}&command=${COMMAND_IDS.ventOn}`;

  it("polls a pending command every five seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { api } = renderPortal({
      path: OPEN_PENDING,
      routes: activityRoutes({ [commandUrl(COMMAND_IDS.ventOn)]: { body: manualCommand() } }),
    });

    await screen.findByTestId("command-details-state");
    expect(api.countFor(commandUrl(COMMAND_IDS.ventOn))).toBe(1);

    await vi.advanceTimersByTimeAsync(COMMAND_POLL_MS);
    await waitFor(() => {
      expect(api.countFor(commandUrl(COMMAND_IDS.ventOn))).toBe(2);
    });

    await vi.advanceTimersByTimeAsync(COMMAND_POLL_MS);
    await waitFor(() => {
      expect(api.countFor(commandUrl(COMMAND_IDS.ventOn))).toBe(3);
    });
  });

  it("stops the moment the command is applied", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { api } = renderPortal({
      path: OPEN_PENDING,
      routes: lifecycle([
        { body: manualCommand() },
        { body: manualCommand({ state: "applied", executed_at: "2026-01-04T09:07:00Z" }) },
      ]),
    });

    await screen.findByTestId("command-details-state");
    await vi.advanceTimersByTimeAsync(COMMAND_POLL_MS);
    await waitFor(() => {
      expect(screen.getByTestId("command-details-state")).toHaveTextContent("Applied");
    });

    const settled = api.countFor(commandUrl(COMMAND_IDS.ventOn));
    await vi.advanceTimersByTimeAsync(COMMAND_POLL_MS * 4);
    expect(api.countFor(commandUrl(COMMAND_IDS.ventOn))).toBe(settled);
  });

  it("stops the moment the command is rejected", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { api } = renderPortal({
      path: OPEN_PENDING,
      routes: lifecycle([
        { body: manualCommand() },
        {
          body: manualCommand({
            state: "rejected",
            executed_at: "2026-01-04T09:07:00Z",
            rejection_reason: { code: "gateway_refused", message: "The gateway refused it." },
          }),
        },
      ]),
    });

    await screen.findByTestId("command-details-state");
    await vi.advanceTimersByTimeAsync(COMMAND_POLL_MS);
    await waitFor(() => {
      expect(screen.getByTestId("command-details-state")).toHaveTextContent("Rejected");
    });
    expect(screen.getByTestId("command-details-rejection")).toHaveTextContent("gateway_refused");

    const settled = api.countFor(commandUrl(COMMAND_IDS.ventOn));
    await vi.advanceTimersByTimeAsync(COMMAND_POLL_MS * 4);
    expect(api.countFor(commandUrl(COMMAND_IDS.ventOn))).toBe(settled);
  });

  it("stops on a 404 rather than asking forever", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { api } = renderPortal({
      path: OPEN_PENDING,
      routes: lifecycle([
        { body: manualCommand() },
        { status: 404, body: NOT_FOUND_BODY },
        { status: 404, body: NOT_FOUND_BODY },
      ]),
    });

    await screen.findByTestId("command-details-state");
    await vi.advanceTimersByTimeAsync(COMMAND_POLL_MS);
    await waitFor(() => {
      expect(screen.getByTestId("command-details-missing")).toBeInTheDocument();
    });

    const settled = api.countFor(commandUrl(COMMAND_IDS.ventOn));
    await vi.advanceTimersByTimeAsync(COMMAND_POLL_MS * 4);
    expect(api.countFor(commandUrl(COMMAND_IDS.ventOn))).toBe(settled);
  });

  it("stops after the observation window and says unconfirmed, not failed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { api } = renderPortal({
      path: OPEN_PENDING,
      routes: activityRoutes({ [commandUrl(COMMAND_IDS.ventOn)]: { body: manualCommand() } }),
    });

    await screen.findByTestId("command-details-state");
    await vi.advanceTimersByTimeAsync(COMMAND_OBSERVATION_WINDOW_MS + COMMAND_POLL_MS);

    const panel = await screen.findByTestId("command-details-unconfirmed");
    expect(panel).toHaveTextContent("still unconfirmed");
    expect(panel.textContent ?? "").not.toContain("failed");
    // No claim about a gateway, and no attempt to send anything again.
    expect(panel.textContent ?? "").not.toContain("offline");
    expect(screen.getByTestId("command-details-state")).toHaveTextContent("Pending");

    const settled = api.countFor(commandUrl(COMMAND_IDS.ventOn));
    await vi.advanceTimersByTimeAsync(COMMAND_POLL_MS * 4);
    expect(api.countFor(commandUrl(COMMAND_IDS.ventOn))).toBe(settled);
    expect(api.requests.every((request) => request.method === "GET")).toBe(true);
  });

  it("resumes a new window when the customer asks to check again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { api } = renderPortal({
      path: OPEN_PENDING,
      routes: activityRoutes({ [commandUrl(COMMAND_IDS.ventOn)]: { body: manualCommand() } }),
    });

    await screen.findByTestId("command-details-state");
    await vi.advanceTimersByTimeAsync(COMMAND_OBSERVATION_WINDOW_MS + COMMAND_POLL_MS);
    await screen.findByTestId("command-details-unconfirmed");

    const before = api.countFor(commandUrl(COMMAND_IDS.ventOn));
    await userEvent.click(screen.getByTestId("command-details-recheck"));

    await waitFor(() => {
      expect(api.countFor(commandUrl(COMMAND_IDS.ventOn))).toBeGreaterThan(before);
    });
    await waitFor(() => {
      expect(screen.queryByTestId("command-details-unconfirmed")).toBeNull();
    });
  });
});

describe("loading, empty and failure", () => {
  it("tells an empty window apart from a failed one", async () => {
    renderPortal({
      path: ZONE_ACTIVITY,
      routes: backendRoutes(undefined, {
        [commandListUrl(IDS.climateZone)]: { body: commandList([]) },
      }),
    });

    expect(await screen.findByTestId("activity-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("activity-error")).toBeNull();

    cleanup();

    renderPortal({
      path: ZONE_ACTIVITY,
      routes: backendRoutes(undefined, {
        [commandListUrl(IDS.climateZone)]: { networkError: true },
      }),
    });

    expect(await screen.findByTestId("activity-error")).toBeInTheDocument();
    expect(screen.queryByTestId("activity-empty")).toBeNull();
  });

  it("keeps the window on screen when a refresh fails", async () => {
    const { api } = renderPortal({ path: ZONE_ACTIVITY, routes: activityRoutes() });
    await screen.findByTestId("activity-list");

    api.setRoutes(
      backendRoutes(undefined, { [commandListUrl(IDS.climateZone)]: { networkError: true } }),
    );
    await userEvent.click(screen.getByTestId("activity-refresh"));

    expect(await screen.findByTestId("activity-refresh-failure")).toBeInTheDocument();
    // The last good answer stays exactly where it was.
    expect(screen.getByTestId("activity-list")).toBeInTheDocument();
    expect(row(COMMAND_IDS.ventOn)).toBeInTheDocument();
    expect(screen.queryByTestId("activity-error")).toBeNull();
  });

  it("does not poll the window on its own", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { api } = renderPortal({ path: ZONE_ACTIVITY, routes: activityRoutes() });
    await screen.findByTestId("activity-list");

    const before = api.countFor(commandListUrl(IDS.climateZone));
    await vi.advanceTimersByTimeAsync(120_000);
    expect(api.countFor(commandListUrl(IDS.climateZone))).toBe(before);
  });
});

describe("keyboard and structure", () => {
  it("opens a row from the keyboard and returns focus to it on close", async () => {
    renderPortal({
      path: ZONE_ACTIVITY,
      routes: activityRoutes({ [commandUrl(COMMAND_IDS.ventOn)]: { body: manualCommand() } }),
    });
    await screen.findByTestId("activity-list");

    const trigger = row(COMMAND_IDS.ventOn);
    trigger.focus();
    await userEvent.keyboard("{Enter}");

    const dialog = await screen.findByTestId("command-details");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    await waitFor(() => {
      expect(document.activeElement).toBe(dialog);
    });

    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByTestId("command-details")).toBeNull();
    });
    expect(document.activeElement).toBe(row(COMMAND_IDS.ventOn));
  });

  it("labels the filters and the list for assistive technology", async () => {
    renderPortal({ path: ZONE_ACTIVITY, routes: activityRoutes() });
    await screen.findByTestId("activity-list");

    for (const label of ["Site", "Facility", "Control zone", "Source", "Control point"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByRole("list", { name: "Commands for North Climate" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Command activity" })).toBeInTheDocument();
  });

  it("carries lifecycle and source in text, not in colour", async () => {
    renderPortal({ path: ZONE_ACTIVITY, routes: activityRoutes() });
    await screen.findByTestId("activity-list");

    // Every row states its source, its lifecycle and its receipt in words.
    for (const command of climateZoneCommands) {
      const element = within(row(command.id));
      expect(element.getByTestId("activity-row-source").textContent ?? "").not.toBe("");
      expect(element.getByTestId("activity-row-state").textContent ?? "").not.toBe("");
      expect(element.getByTestId("activity-row-receipt").textContent ?? "").not.toBe("");
    }
  });
});

describe("continuing from the control workspace", () => {
  it("opens the Unit 4 command in Activity with its own context", async () => {
    // One manual command, submitted from the zone workspace exactly as Unit 4
    // submits it, then recovered in Activity after that workspace has been left.
    const key: `${string}-${string}-${string}-${string}-${string}` =
      "ee000000-0000-4000-8000-00000000aaa1";
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(key);

    renderPortal({
      path: controlZonePath(IDS.northGreenhouse, IDS.climateZone),
      routes: activityRoutes({
        [commandsUrl()]: { status: 201, body: commandAcceptance(manualCommand()) },
        [commandUrl(COMMAND_IDS.ventOn)]: { body: manualCommand() },
      }),
    });

    await screen.findByTestId("actuator-cards");
    const card = screen
      .getByTestId("manual-control")
      .querySelector(`[data-point-id="${POINT_IDS.vent}"]`);
    await userEvent.click(within(card as HTMLElement).getByTestId("actuator-on"));
    await userEvent.click(await screen.findByTestId("command-confirm"));

    const link = await screen.findByTestId("command-activity-link");
    // The smallest continuation: the facility in the address, and the zone,
    // point and command the cloud API named on the command itself.
    expect(link).toHaveAttribute(
      "href",
      `/activity?facility=${IDS.northGreenhouse}&zone=${IDS.climateZone}&point=${POINT_IDS.vent}&command=${COMMAND_IDS.ventOn}`,
    );

    await userEvent.click(link);

    // The zone is recovered from the facility's zones, the site from the
    // facility's own `site_id`, and the command is verified against that zone.
    expect(await screen.findByTestId("command-details-state")).toHaveTextContent("Pending");
    expect(screen.getByTestId("command-details-meta")).toHaveTextContent("Riverside Growing Site");
    expect(screen.getByTestId("activity-zone")).toHaveValue(IDS.climateZone);
    vi.restoreAllMocks();
  });
});

describe("what Activity does not add", () => {
  it("offers no way to send, cancel, retry or export anything", async () => {
    renderPortal({
      path: `${ZONE_ACTIVITY}&command=${COMMAND_IDS.ventOn}`,
      routes: activityRoutes({ [commandUrl(COMMAND_IDS.ventOn)]: { body: manualCommand() } }),
    });
    await screen.findByTestId("command-details");

    const page = screen.getByTestId("activity-page").textContent ?? "";
    for (const forbidden of [
      "Turn on",
      "Turn off",
      "Cancel command",
      "Send again",
      "Resubmit",
      "Retry command",
      "Export",
      "Schedule",
      "Alert",
      "Recipe",
      "Grow cycle",
      "Simulation",
      "Gateway",
    ]) {
      expect(page).not.toContain(forbidden);
    }
  });
});
