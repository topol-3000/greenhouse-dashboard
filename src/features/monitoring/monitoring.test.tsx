/**
 * The monitoring experience, end to end, over contract-valid fixtures.
 *
 * The tests are written as claims a customer could check: I can see the points
 * this zone measures, I can tell a reading of zero from no reading, I can open
 * one point's history, and none of it disappears because a background request
 * failed. The negative claims matter as much: a control point is never a
 * measurement, a string is never coerced onto a numeric axis, and a bounded
 * window is never described as a complete history.
 */

import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MONITORING_POLL_MS, TELEMETRY_HISTORY_LIMIT } from "../../api/queries";
import { controlZonePath } from "../../routes/routes";
import {
  airTemperatureHistory,
  backendRoutes,
  climateZone,
  co2History,
  DEFAULT_DATASET,
  facilityConfigurationUrl,
  IDS,
  irrigationZone,
  northConfiguration,
  northGreenhouse,
  NOT_FOUND_BODY,
  POINT_IDS,
  pointTelemetryUrl,
  riversideSite,
  seedlingClimateZone,
  telemetrySample,
} from "../../test/fixtures";
import { renderPortal } from "../../test/harness";

const ZONE_URL = controlZonePath(IDS.northGreenhouse, IDS.climateZone);
const IRRIGATION_URL = controlZonePath(IDS.northGreenhouse, IDS.irrigationZone);
const CONFIG_URL = facilityConfigurationUrl(IDS.northGreenhouse);
const AIR_TEMP_URL = pointTelemetryUrl(POINT_IDS.airTemp);
const CO2_URL = pointTelemetryUrl(POINT_IDS.co2);

/** The card for one point, found by the identifier the API published. */
function cardFor(pointId: string): HTMLElement {
  const card = document.querySelector(`[data-point-id="${pointId}"]`);
  if (card === null) {
    throw new Error(`No measurement card for ${pointId}`);
  }
  return card as HTMLElement;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("the measurement inventory", () => {
  it("shows the zone in its site and facility, with its measurements", async () => {
    renderPortal({ path: ZONE_URL });

    // Unit 2's context is untouched: the zone still says where it sits.
    expect(await screen.findByTestId("zone-relationship")).toHaveTextContent(
      `${climateZone.name} is a control zone of the facility ${northGreenhouse.name}, which belongs to the site ${riversideSite.name}`,
    );

    const monitoring = await screen.findByTestId("monitoring");
    expect(within(monitoring).getByRole("heading", { name: "Monitoring" })).toBeInTheDocument();

    const cards = await screen.findAllByTestId("measurement-card");
    expect(cards.map((card) => within(card).getByRole("heading").textContent)).toEqual([
      "North air temperature",
      "North CO2",
      "North soil moisture",
      "North leaf wetness",
    ]);
  });

  it("never shows a control or status point as a measurement", async () => {
    renderPortal({ path: ZONE_URL });
    await screen.findByTestId("measurement-cards");

    const monitoring = screen.getByTestId("monitoring");
    // Both are named to read like measurements. `point_kind` says otherwise.
    expect(within(monitoring).queryByText("North air temperature vent")).toBeNull();
    expect(within(monitoring).queryByText("North humidity sensor")).toBeNull();
    expect(document.querySelector(`[data-point-id="${POINT_IDS.vent}"]`)).toBeNull();
    expect(
      document.querySelector(`[data-point-id="${POINT_IDS.humiditySensorStatus}"]`),
    ).toBeNull();

    // Their state was in the response and reaches no screen.
    expect(within(monitoring).queryByText("online")).toBeNull();
    expect(within(monitoring).queryByText("True")).toBeNull();

    // They remain visible as the zone's composition, which is what Unit 2 shows.
    const composition = screen.getByTestId("zone-points");
    expect(within(composition).getByText("North air temperature vent")).toBeInTheDocument();
    expect(within(composition).getByText("North humidity sensor")).toBeInTheDocument();
  });

  it("says truthfully that a zone has no measurement points", async () => {
    renderPortal({ path: IRRIGATION_URL });

    const empty = await screen.findByTestId("monitoring-empty");
    expect(empty).toHaveTextContent("No measurement points are assigned to this control zone");
    expect(screen.queryByTestId("measurement-card")).toBeNull();
    // A successful empty answer is not an error and offers no retry.
    expect(screen.queryByTestId("request-error")).toBeNull();
  });

  it("explains a zone the configuration document leaves out", async () => {
    renderPortal({
      path: IRRIGATION_URL,
      routes: backendRoutes(DEFAULT_DATASET, {
        [CONFIG_URL]: {
          body: {
            ...northConfiguration,
            control_zones: northConfiguration.control_zones.filter(
              (zone) => zone.id !== IDS.irrigationZone,
            ),
          },
        },
      }),
    });

    const absent = await screen.findByTestId("monitoring-zone-absent");
    expect(absent).toHaveTextContent("leaves archived zones out");
  });
});

describe("a measurement's current state", () => {
  it("shows the value, unit, quality and observation time the API published", async () => {
    renderPortal({ path: ZONE_URL });
    await screen.findByTestId("measurement-cards");

    const card = cardFor(POINT_IDS.airTemp);
    expect(within(card).getByTestId("measurement-value")).toHaveTextContent("21.4 degC");

    const meta = within(card).getByTestId("measurement-meta");
    expect(meta).toHaveTextContent("Unit");
    expect(meta).toHaveTextContent("degC");
    expect(meta).toHaveTextContent("Good");
    // The instant is the one the API sent, carried in the machine-readable
    // attribute whatever locale the reader's browser formats it in.
    expect(within(card).getByText(/2026/)).toHaveAttribute("datetime", "2026-01-04T09:05:00Z");
  });

  it("renders a measured zero as a reading rather than as missing data", async () => {
    renderPortal({ path: ZONE_URL });
    await screen.findByTestId("measurement-cards");

    const card = cardFor(POINT_IDS.co2);
    const value = within(card).getByTestId("measurement-value");
    expect(value).toHaveTextContent("0 ppm");
    expect(value).not.toHaveTextContent("No data yet");
  });

  it("renders a measured false as a reading rather than as missing data", async () => {
    renderPortal({ path: ZONE_URL });
    await screen.findByTestId("measurement-cards");

    const value = within(cardFor(POINT_IDS.leafWetness)).getByTestId("measurement-value");
    expect(value).toHaveTextContent("False");
    expect(value).not.toHaveTextContent("No data yet");
  });

  it("says No data yet for a point that has never reported", async () => {
    renderPortal({ path: ZONE_URL });
    await screen.findByTestId("measurement-cards");

    const card = cardFor(POINT_IDS.soilMoisture);
    expect(within(card).getByTestId("measurement-value")).toHaveTextContent("No data yet");
    expect(within(card).getByTestId("measurement-value")).not.toHaveTextContent("0");
    expect(within(card).getByTestId("measurement-meta")).toHaveTextContent("Not observed yet");
  });

  it("invents no unit for a point the API published without one", async () => {
    renderPortal({ path: ZONE_URL });
    await screen.findByTestId("measurement-cards");

    const card = cardFor(POINT_IDS.soilMoisture);
    expect(within(card).getByTestId("measurement-meta")).toHaveTextContent("Unit not provided");
    // Nothing plausible has been filled in.
    expect(card.textContent).not.toMatch(/%|degC|ppm/);
  });

  it("describes no reading as safe, normal, high, low or fresh", async () => {
    renderPortal({ path: ZONE_URL });
    await screen.findByTestId("measurement-cards");

    const text = screen.getByTestId("monitoring").textContent ?? "";
    for (const forbidden of [
      "Normal",
      "Warning",
      "Critical",
      "Optimal",
      "Too high",
      "Too low",
      "Fresh",
      "Out of range",
      "Recommend",
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });
});

describe("telemetry history", () => {
  it("loads the selected point's history and orders it chronologically", async () => {
    const { api } = renderPortal({ path: ZONE_URL });
    await screen.findByTestId("measurement-cards");

    await userEvent.click(
      within(cardFor(POINT_IDS.airTemp)).getByRole("button", {
        name: "Show history of North air temperature",
      }),
    );

    const chart = await screen.findByTestId("history-chart");
    expect(chart).toHaveTextContent("Telemetry history — North air temperature (degC)");
    expect(api.countFor(AIR_TEMP_URL)).toBe(1);

    // The fixture arrives out of order; the table is oldest observation first.
    const rows = within(await screen.findByTestId("sample-table"))
      .getAllByRole("row")
      .slice(1);
    expect(rows.map((row) => within(row).getAllByRole("cell")[0]?.textContent)).toEqual([
      "20.1",
      "21.4",
      "22.9",
    ]);
    expect(within(screen.getByTestId("sample-table")).getAllByText("Uncertain")).toHaveLength(1);
  });

  it("keeps the facility and control zone in the address when a point is picked", async () => {
    renderPortal({ path: ZONE_URL });
    await screen.findByTestId("measurement-cards");

    await userEvent.click(
      within(cardFor(POINT_IDS.airTemp)).getByRole("button", {
        name: "Show history of North air temperature",
      }),
    );
    await screen.findByTestId("history-chart");

    // The workspace is intact: same zone, same facility, same breadcrumbs.
    expect(screen.getByRole("heading", { level: 1, name: climateZone.name })).toBeInTheDocument();
    const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(trail).getByRole("link", { name: northGreenhouse.name })).toBeInTheDocument();
    expect(screen.getByTestId("zone-points")).toBeInTheDocument();
  });

  it("opens a point named in the address and rejects one that is not in the zone", async () => {
    const view = renderPortal({ path: `${ZONE_URL}?point=${POINT_IDS.airTemp}` });
    expect(await screen.findByTestId("history-chart")).toBeInTheDocument();
    view.unmount();

    renderPortal({ path: `${ZONE_URL}?point=${POINT_IDS.vent}` });
    // The control point is not a measurement of this zone, so it selects
    // nothing — and the zone workspace is still the zone workspace.
    expect(await screen.findByTestId("unknown-point-selection")).toBeInTheDocument();
    expect(screen.getByTestId("control-zone-page")).toBeInTheDocument();
    expect(screen.getByTestId("measurement-cards")).toBeInTheDocument();
    expect(screen.queryByTestId("resource-not-found")).toBeNull();
  });

  it("switches history when another point is selected", async () => {
    const { api } = renderPortal({ path: ZONE_URL });
    await screen.findByTestId("measurement-cards");

    await userEvent.click(
      within(cardFor(POINT_IDS.airTemp)).getByRole("button", { name: /Show history/ }),
    );
    await screen.findByTestId("history-chart");

    await userEvent.click(
      within(cardFor(POINT_IDS.co2)).getByRole("button", { name: /Show history/ }),
    );

    await waitFor(() => {
      expect(screen.getByTestId("history-chart")).toHaveTextContent(
        "Telemetry history — North CO2 (ppm)",
      );
    });
    // The superseded window is not mixed into the new one.
    const table = screen.getByTestId("sample-table");
    expect(within(table).queryByText("21.4")).toBeNull();
    expect(within(table).getByText("412")).toBeInTheDocument();
    expect(api.countFor(AIR_TEMP_URL)).toBe(1);
    expect(api.countFor(CO2_URL)).toBe(1);
  });

  it("says the window is bounded rather than complete", async () => {
    renderPortal({ path: `${ZONE_URL}?point=${POINT_IDS.airTemp}` });

    const notice = await screen.findByTestId("history-window");
    expect(notice).toHaveTextContent(`at most ${String(TELEMETRY_HISTORY_LIMIT)} samples`);
    expect(notice).toHaveTextContent("not its complete record");
    expect(notice.textContent).not.toMatch(/all samples|complete history|last \d+ hours/i);
  });

  it("warns that more samples may exist when the window comes back full", async () => {
    const full = Array.from({ length: TELEMETRY_HISTORY_LIMIT }, (_unused, index) =>
      telemetrySample({
        id: `dd${String(index).padStart(6, "0")}`,
        point_id: POINT_IDS.airTemp,
        value: index,
        unit: "degC",
        observed_at: new Date(Date.UTC(2026, 0, 4, 9, 0, index)).toISOString(),
        received_at: new Date(Date.UTC(2026, 0, 4, 9, 0, index)).toISOString(),
      }),
    );
    renderPortal({
      path: `${ZONE_URL}?point=${POINT_IDS.airTemp}`,
      routes: backendRoutes(DEFAULT_DATASET, { [AIR_TEMP_URL]: { body: { items: full } } }),
    });

    expect(await screen.findByTestId("history-window")).toHaveTextContent(
      "so more samples may exist",
    );
  });

  it("distinguishes an empty history from a failed one", async () => {
    const view = renderPortal({ path: `${ZONE_URL}?point=${POINT_IDS.soilMoisture}` });
    const empty = await screen.findByTestId("history-empty");
    expect(empty).toHaveTextContent("No telemetry has been recorded for North soil moisture");
    expect(empty).toHaveTextContent("That is an answer, not a failure");
    expect(screen.queryByTestId("request-error")).toBeNull();
    view.unmount();

    renderPortal({
      path: `${ZONE_URL}?point=${POINT_IDS.airTemp}`,
      routes: backendRoutes(DEFAULT_DATASET, { [AIR_TEMP_URL]: { networkError: true } }),
    });
    const failed = await screen.findByTestId("request-error");
    expect(failed).toHaveTextContent("Telemetry history for North air temperature");
    expect(within(failed).getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByTestId("history-empty")).toBeNull();
  });

  it("reports samples it could not plot instead of drawing them as zero", async () => {
    renderPortal({
      path: `${ZONE_URL}?point=${POINT_IDS.airTemp}`,
      routes: backendRoutes(DEFAULT_DATASET, {
        [AIR_TEMP_URL]: {
          body: {
            items: [
              telemetrySample({
                id: "ee1",
                point_id: POINT_IDS.airTemp,
                value: 21.4,
                unit: "degC",
                observed_at: "2026-01-04T09:00:00Z",
              }),
              telemetrySample({
                id: "ee2",
                point_id: POINT_IDS.airTemp,
                value: null,
                unit: "degC",
                observed_at: "2026-01-04T09:01:00Z",
              }),
              telemetrySample({
                id: "ee3",
                point_id: POINT_IDS.airTemp,
                value: "22.5",
                unit: "degC",
                observed_at: "2026-01-04T09:02:00Z",
              }),
            ],
          },
        },
      }),
    });

    const notice = await screen.findByTestId("history-unplottable");
    expect(notice).toHaveTextContent("2 of the loaded samples could not be plotted");
    expect(notice).toHaveTextContent("never drawn as zero");
    // The samples are still readable, and "22.5" was not parsed into a point.
    const table = await screen.findByTestId("sample-table");
    expect(within(table).getByText("22.5")).toBeInTheDocument();
    expect(within(table).getByText("Value could not be read")).toBeInTheDocument();
  });

  it("refuses to chart a non-numeric measurement", async () => {
    renderPortal({ path: `${ZONE_URL}?point=${POINT_IDS.leafWetness}` });

    const explanation = await screen.findByTestId("history-not-numeric");
    expect(explanation).toHaveTextContent("This measurement cannot be charted");
    expect(explanation).toHaveTextContent("boolean point");
    expect(screen.queryByTestId("history-chart")).toBeNull();

    // The history is still readable, with the booleans shown as booleans.
    const table = await screen.findByTestId("sample-table");
    expect(within(table).getByText("False")).toBeInTheDocument();
    expect(within(table).getByText("True")).toBeInTheDocument();
  });

  it("refuses to draw a mixed-unit window as one continuous series", async () => {
    renderPortal({
      path: `${ZONE_URL}?point=${POINT_IDS.airTemp}`,
      routes: backendRoutes(DEFAULT_DATASET, {
        [AIR_TEMP_URL]: {
          body: {
            items: [
              telemetrySample({
                id: "ff1",
                point_id: POINT_IDS.airTemp,
                value: 21.4,
                unit: "degC",
                observed_at: "2026-01-04T09:00:00Z",
              }),
              telemetrySample({
                id: "ff2",
                point_id: POINT_IDS.airTemp,
                value: 70.5,
                unit: "degF",
                observed_at: "2026-01-04T09:01:00Z",
              }),
            ],
          },
        },
      }),
    });

    const mixed = await screen.findByTestId("history-mixed-units");
    expect(mixed).toHaveTextContent("This window mixes units");
    expect(mixed).toHaveTextContent("degC, degF");
    expect(screen.queryByTestId("history-chart")).toBeNull();

    // Each sample keeps its own unit rather than being converted.
    const table = await screen.findByTestId("sample-table");
    expect(within(table).getByText("degC")).toBeInTheDocument();
    expect(within(table).getByText("degF")).toBeInTheDocument();
  });

  it("keeps observed and received times apart", async () => {
    renderPortal({ path: `${ZONE_URL}?point=${POINT_IDS.airTemp}` });

    const table = await screen.findByTestId("sample-table");
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent);
    expect(headers).toEqual(["Observed at", "Value", "Quality", "Received at"]);

    const first = airTemperatureHistory.find((sample) => sample.value === 20.1);
    const row = within(table).getAllByRole("row")[1];
    const times = row?.querySelectorAll("time") ?? [];
    expect(times[0]).toHaveAttribute("datetime", first?.observed_at);
    expect(times[1]).toHaveAttribute("datetime", first?.received_at);
  });
});

describe("partial availability", () => {
  it("keeps the zone workspace when monitoring fails outright", async () => {
    renderPortal({
      path: ZONE_URL,
      routes: backendRoutes(DEFAULT_DATASET, { [CONFIG_URL]: { networkError: true } }),
    });

    const error = await screen.findByTestId("request-error");
    expect(error).toHaveTextContent("Measurements could not be loaded");

    // Topology, navigation and the shell are untouched.
    expect(screen.getByTestId("zone-points")).toBeInTheDocument();
    expect(screen.getByTestId("zone-meta")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: climateZone.name })).toBeInTheDocument();
  });

  it("keeps current state on screen when history fails", async () => {
    renderPortal({
      path: `${ZONE_URL}?point=${POINT_IDS.airTemp}`,
      routes: backendRoutes(DEFAULT_DATASET, { [AIR_TEMP_URL]: { networkError: true } }),
    });

    await screen.findByTestId("request-error");
    expect(within(cardFor(POINT_IDS.airTemp)).getByTestId("measurement-value")).toHaveTextContent(
      "21.4 degC",
    );
    expect(screen.getAllByTestId("measurement-card")).toHaveLength(4);
  });

  it("keeps the last good measurements when a background refresh fails", async () => {
    const { api, client } = renderPortal({ path: ZONE_URL });
    await screen.findByTestId("measurement-cards");

    api.setRoutes(backendRoutes(DEFAULT_DATASET, { [CONFIG_URL]: { networkError: true } }));
    await act(async () => {
      await client.refetchQueries({ queryKey: ["monitoring", "facility-configuration"] });
    });

    const stale = await screen.findByTestId("refresh-failure");
    expect(stale).toHaveTextContent("Showing the last data the cloud API returned");
    // The values did not vanish, and there is no blank region.
    expect(within(cardFor(POINT_IDS.airTemp)).getByTestId("measurement-value")).toHaveTextContent(
      "21.4 degC",
    );
    expect(screen.queryByTestId("request-error")).toBeNull();
  });

  it("keeps the last good history when its refresh fails", async () => {
    const { api, client } = renderPortal({ path: `${ZONE_URL}?point=${POINT_IDS.airTemp}` });
    await screen.findByTestId("history-chart");

    api.setRoutes(backendRoutes(DEFAULT_DATASET, { [AIR_TEMP_URL]: { networkError: true } }));
    await act(async () => {
      await client.refetchQueries({ queryKey: ["monitoring", "point-telemetry"] });
    });

    expect(await screen.findByTestId("refresh-failure")).toBeInTheDocument();
    expect(screen.getByTestId("history-chart")).toHaveTextContent("North air temperature");
    expect(within(screen.getByTestId("sample-table")).getByText("22.9")).toBeInTheDocument();
  });

  it("keeps monitoring when the health poll fails", async () => {
    const { api, client } = renderPortal({ path: ZONE_URL });
    await screen.findByTestId("measurement-cards");

    api.setRoutes(backendRoutes(DEFAULT_DATASET, { "/health": { networkError: true } }));
    await act(async () => {
      await client.refetchQueries({ queryKey: ["api-health"] });
    });

    await waitFor(() => {
      expect(screen.getByTestId("api-status")).toHaveTextContent("Cloud API: Unavailable");
    });
    expect(screen.getAllByTestId("measurement-card")).toHaveLength(4);
  });

  it("does not read monitoring for a zone the contract puts in another facility", async () => {
    const { api } = renderPortal({
      path: controlZonePath(IDS.seedlingRoom, IDS.climateZone),
    });

    await screen.findByTestId("relationship-mismatch");
    expect(screen.queryByTestId("monitoring")).toBeNull();
    expect(api.calls.some((url) => url.includes("/telemetry"))).toBe(false);
  });

  it("keeps the missing-zone state a resource state, not a monitoring failure", async () => {
    renderPortal({
      path: controlZonePath(IDS.northGreenhouse, IDS.unknownZone),
      routes: backendRoutes(DEFAULT_DATASET, {
        [`/api/v1/control-zones/${IDS.unknownZone}`]: { status: 404, body: NOT_FOUND_BODY },
        [`/api/v1/control-zones/${IDS.unknownZone}/points?limit=200&offset=0`]: {
          status: 404,
          body: NOT_FOUND_BODY,
        },
      }),
    });

    expect(await screen.findByTestId("resource-not-found")).toHaveTextContent(
      "This control zone is not in the cloud API",
    );
    expect(screen.queryByTestId("monitoring")).toBeNull();
  });
});

describe("polling", () => {
  it("re-reads the configuration on its interval and never overlaps a request", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { api } = renderPortal({ path: ZONE_URL });
    await screen.findByTestId("measurement-cards");
    expect(api.countFor(CONFIG_URL)).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(MONITORING_POLL_MS + 100);
    });
    expect(api.countFor(CONFIG_URL)).toBe(2);

    // A request that never answers is not joined by a second one, however many
    // intervals pass over it.
    api.setRoutes(backendRoutes(DEFAULT_DATASET, { [CONFIG_URL]: { pending: true } }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MONITORING_POLL_MS * 4);
    });
    expect(api.countFor(CONFIG_URL)).toBe(3);
  });

  it("stops polling a facility the cloud API says it does not have", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderPortal({
      path: ZONE_URL,
      routes: backendRoutes(DEFAULT_DATASET, {
        [CONFIG_URL]: { status: 404, body: NOT_FOUND_BODY },
      }),
    });

    const absent = await screen.findByTestId("monitoring-facility-absent");
    expect(absent).toBeInTheDocument();

    const { api } = renderPortal({
      path: ZONE_URL,
      routes: backendRoutes(DEFAULT_DATASET, {
        [CONFIG_URL]: { status: 404, body: NOT_FOUND_BODY },
      }),
    });
    await screen.findAllByTestId("monitoring-facility-absent");
    const seen = api.countFor(CONFIG_URL);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(MONITORING_POLL_MS * 5);
    });
    expect(api.countFor(CONFIG_URL)).toBe(seen);
  });
});

describe("accessibility and honesty of the monitoring section", () => {
  it("is a labelled region with an ordered heading hierarchy", async () => {
    renderPortal({ path: `${ZONE_URL}?point=${POINT_IDS.airTemp}` });
    await screen.findByTestId("history-chart");

    expect(screen.getByRole("region", { name: "Monitoring" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Measurement points" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Telemetry history" })).toBeInTheDocument();

    expect(screen.getByRole("heading", { level: 2, name: "Monitoring" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "Measurement points" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 4, name: "North air temperature" }),
    ).toBeInTheDocument();
  });

  it("selects a point with the keyboard and reports the selection without colour", async () => {
    renderPortal({ path: ZONE_URL });
    await screen.findByTestId("measurement-cards");

    const button = within(cardFor(POINT_IDS.airTemp)).getByRole("button", {
      name: "Show history of North air temperature",
    });
    button.focus();
    expect(button).toHaveFocus();
    await userEvent.keyboard("{Enter}");

    await screen.findByTestId("history-chart");
    const pressed = within(cardFor(POINT_IDS.airTemp)).getByRole("button", {
      name: "Showing history of North air temperature",
    });
    expect(pressed).toHaveAttribute("aria-pressed", "true");
  });

  it("gives the chart an accessible name and a summary in words", async () => {
    renderPortal({ path: `${ZONE_URL}?point=${POINT_IDS.airTemp}` });
    await screen.findByTestId("history-chart");

    const image = screen.getByRole("img");
    const name = image.getAttribute("aria-labelledby") ?? "";
    const described = name
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ");

    expect(described).toContain("Telemetry history — North air temperature (degC)");
    expect(described).toContain("3 plotted samples");
    expect(described).toContain("Latest 22.9 degC");
  });

  it("does not call one sample a trend", async () => {
    renderPortal({
      path: `${ZONE_URL}?point=${POINT_IDS.airTemp}`,
      routes: backendRoutes(DEFAULT_DATASET, {
        [AIR_TEMP_URL]: { body: { items: [airTemperatureHistory[0]] } },
      }),
    });

    const summary = await screen.findByTestId("chart-summary");
    expect(summary).toHaveTextContent("1 plotted sample");
    expect(summary).toHaveTextContent("One sample shows a single reading, not a trend");
  });

  it("adds no control, command, alert, activity or automation surface", async () => {
    renderPortal({ path: `${ZONE_URL}?point=${POINT_IDS.co2}` });
    await screen.findByTestId("history-chart");

    const monitoring = screen.getByTestId("monitoring");
    const text = monitoring.textContent ?? "";
    for (const forbidden of [
      "Desired",
      "Setpoint",
      "Turn on",
      "Turn off",
      "Command",
      "Activity",
      "Alert",
      "Automation",
      "Schedule",
      "Recipe",
      "Grow cycle",
      "Simulation",
      "Override",
    ]) {
      expect(text).not.toContain(forbidden);
    }

    // The only controls in the section select a point or open a sample table.
    for (const button of within(monitoring).getAllByRole("button")) {
      expect(button.textContent ?? "").toMatch(/history|sample/i);
    }
    expect(within(monitoring).queryByRole("checkbox")).toBeNull();
    expect(within(monitoring).queryByRole("switch")).toBeNull();
    expect(within(monitoring).queryByRole("slider")).toBeNull();
  });

  it("exposes no internal error detail when a request fails", async () => {
    renderPortal({
      path: ZONE_URL,
      routes: backendRoutes(DEFAULT_DATASET, { [CONFIG_URL]: { status: 500, body: {} } }),
    });

    const error = await screen.findByTestId("request-error");
    expect(error).toHaveTextContent("The cloud API answered 500");
    expect(error.textContent ?? "").not.toContain("/api/v1/");
    expect(error.textContent ?? "").not.toContain("configuration");
  });
});

describe("unused fixtures guard", () => {
  it("keeps the fixtures the monitoring cases depend on", () => {
    expect(co2History.some((sample) => sample.value === 0)).toBe(true);
    expect(seedlingClimateZone.facility_id).toBe(IDS.seedlingRoom);
    expect(irrigationZone.facility_id).toBe(IDS.northGreenhouse);
  });
});
