/**
 * The owner screen's behaviour, asserted through what a user sees and does.
 *
 * These tests drive the real component over a stubbed `fetch`, so they cover
 * the states the acceptance criteria name: clean start, facility selection,
 * measurement cards, no-data, numeric-only charting, partial responses, a
 * first-load failure with a working Retry, and a refresh failure that keeps the
 * previous snapshot and marks it stale.
 *
 * Every numeric point is charted at once, so chart assertions are scoped to one
 * card through its `data-point-code` rather than to the page.
 */

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dashboard } from "./Dashboard";
import {
  emptyFacilityConfiguration,
  emptyFacilityPage,
  facilityConfiguration,
  facilityPage,
  FACILITY_ID,
  OTHER_FACILITY_ID,
  POINT_IDS,
  telemetryHistory,
} from "./test/fixtures";
import type { Router } from "./test/harness";
import { installFetchMock, renderWithQuery } from "./test/harness";

const FACILITIES_URL = "/api/v1/facilities?status=active&limit=200";
const CONFIG_URL = `/api/v1/facilities/${FACILITY_ID}/configuration`;
const OTHER_CONFIG_URL = `/api/v1/facilities/${OTHER_FACILITY_ID}/configuration`;
const TEMPERATURE_URL = `/api/v1/points/${POINT_IDS.airTemperature}/telemetry?limit=100`;
const HUMIDITY_URL = `/api/v1/points/${POINT_IDS.airHumidity}/telemetry?limit=100`;
const SOIL_MOISTURE_URL = `/api/v1/points/${POINT_IDS.soilMoisture}/telemetry?limit=100`;

/** The routing table of a healthy backend with producer-created data. */
function healthyRoutes(): Router {
  return {
    [FACILITIES_URL]: { body: facilityPage },
    [CONFIG_URL]: { body: facilityConfiguration },
    [OTHER_CONFIG_URL]: { body: emptyFacilityConfiguration },
    [TEMPERATURE_URL]: { body: telemetryHistory(100) },
    [HUMIDITY_URL]: { body: telemetryHistory(12, POINT_IDS.airHumidity) },
    [SOIL_MOISTURE_URL]: { body: { items: [] } },
  };
}

/**
 * The chart card of one point, once its own history has arrived.
 *
 * Each card polls independently, so they do not appear at the same instant —
 * waiting for "a chart" would hand back whichever one resolved first.
 */
async function findChart(pointCode: string): Promise<HTMLElement> {
  let chart: HTMLElement | undefined;
  await waitFor(() => {
    chart = screen
      .queryAllByTestId("history-chart")
      .find((element) => element.dataset["pointCode"] === pointCode);
    expect(chart).toBeDefined();
  });
  return chart!;
}

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("clean start", () => {
  it("explains an empty backend instead of showing a blank screen", async () => {
    installFetchMock({ [FACILITIES_URL]: { body: emptyFacilityPage } });

    renderWithQuery(<Dashboard />);

    expect(await screen.findByText("No facilities yet")).toBeInTheDocument();
    expect(screen.queryByTestId("measurement-card")).not.toBeInTheDocument();
  });

  it("says a facility has no measurement points when it is empty", async () => {
    installFetchMock({
      [FACILITIES_URL]: {
        body: { ...emptyFacilityPage, items: [facilityPage.items[1]], total: 1 },
      },
      [OTHER_CONFIG_URL]: { body: emptyFacilityConfiguration },
    });

    renderWithQuery(<Dashboard />);

    expect(await screen.findByText("No measurement points")).toBeInTheDocument();
    expect(screen.getByText("No numeric measurements")).toBeInTheDocument();
  });
});

describe("monitoring a facility", () => {
  it("shows the facility and site context", async () => {
    installFetchMock(healthyRoutes());

    renderWithQuery(<Dashboard />);

    const context = await screen.findByTestId("facility-context");
    expect(within(context).getByText("Basil Growbox")).toBeInTheDocument();
    expect(context).toHaveTextContent("Growbox");
    expect(context).toHaveTextContent("Home");
  });

  it("renders a card for every active measurement point and none for control points", async () => {
    installFetchMock(healthyRoutes());

    renderWithQuery(<Dashboard />);

    await screen.findByTestId("facility-context");
    const cards = screen.getAllByTestId("measurement-card");

    expect(cards).toHaveLength(4);
    expect(cards.map((card) => card.dataset["pointCode"])).toEqual([
      "air_temperature",
      "air_humidity",
      "soil_moisture",
      "fan_running",
    ]);
    expect(screen.queryByText("Fan power")).not.toBeInTheDocument();
  });

  it("shows value, unit, quality and observed time on a card", async () => {
    installFetchMock(healthyRoutes());

    renderWithQuery(<Dashboard />);

    await screen.findByTestId("facility-context");
    const card = screen
      .getAllByTestId("measurement-card")
      .find((element) => element.dataset["pointCode"] === "air_temperature")!;

    expect(within(card).getByTestId("card-value")).toHaveTextContent("23.4");
    expect(within(card).getByTestId("card-unit")).toHaveTextContent("°C");
    expect(within(card).getByTestId("card-quality")).toHaveTextContent("Good");
    expect(within(card).getByTestId("card-observed-at").querySelector("time")).toHaveAttribute(
      "datetime",
      "2026-08-01T09:00:00Z",
    );
  });

  it("renders a never-reported point as no-data, never as zero", async () => {
    installFetchMock(healthyRoutes());

    renderWithQuery(<Dashboard />);

    await screen.findByTestId("facility-context");
    const card = screen
      .getAllByTestId("measurement-card")
      .find((element) => element.dataset["pointCode"] === "soil_moisture")!;

    expect(within(card).getByTestId("card-value")).toHaveTextContent("—");
    expect(within(card).getByTestId("card-value")).not.toHaveTextContent("0");
    expect(within(card).getByTestId("card-quality")).toHaveTextContent("No data");
    expect(within(card).getByTestId("card-observed-at")).toHaveTextContent("—");
  });
});

describe("the history charts", () => {
  it("charts a numeric point's 100 samples oldest first", async () => {
    installFetchMock(healthyRoutes());

    renderWithQuery(<Dashboard />);

    const chart = await findChart("air_temperature");
    expect(within(chart).getByTestId("chart-summary")).toHaveTextContent(
      "100 samples for Air temperature",
    );

    const user = userEvent.setup();
    await user.click(within(chart).getByRole("button", { name: "Show sample table" }));

    const rows = within(within(chart).getByRole("table")).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(100);
    const times = rows.map((row) => row.querySelector("time")!.getAttribute("datetime")!);
    const ascending = [...times].sort((left, right) => Date.parse(left) - Date.parse(right));
    expect(times).toEqual(ascending);
  });

  it("charts every numeric measurement point at once and no other point", async () => {
    installFetchMock(healthyRoutes());

    renderWithQuery(<Dashboard />);

    let codes: (string | undefined)[] = [];
    await waitFor(() => {
      codes = screen.getAllByTestId("history-chart").map((element) => element.dataset["pointCode"]);
      expect(codes).toHaveLength(3);
    });

    expect(codes).toEqual(["air_temperature", "air_humidity", "soil_moisture"]);
    // A boolean measurement point has a card but no numeric axis, and a control
    // point is not a measurement at all.
    expect(codes).not.toContain("fan_running");
    expect(codes).not.toContain("fan_power");
  });

  it("names each chart, so nothing has to be selected to tell them apart", async () => {
    installFetchMock(healthyRoutes());

    renderWithQuery(<Dashboard />);

    const chart = await findChart("air_humidity");
    expect(within(chart).getByRole("heading", { level: 3 })).toHaveTextContent("Air humidity (%)");
    expect(screen.queryByLabelText("Charted measurement")).not.toBeInTheDocument();
  });

  it("fetches every numeric point's history without any interaction", async () => {
    const mock = installFetchMock(healthyRoutes());

    renderWithQuery(<Dashboard />);

    const humidity = await findChart("air_humidity");
    await waitFor(() => {
      expect(within(humidity).getByTestId("chart-summary")).toHaveTextContent(
        "12 samples for Air humidity",
      );
    });

    expect(mock.countFor(TEMPERATURE_URL)).toBe(1);
    expect(mock.countFor(HUMIDITY_URL)).toBe(1);
    expect(mock.countFor(SOIL_MOISTURE_URL)).toBe(1);
  });

  it("says so when a numeric point has no samples yet", async () => {
    installFetchMock(healthyRoutes());

    renderWithQuery(<Dashboard />);

    const chart = await findChart("soil_moisture");
    expect(within(chart).getByTestId("chart-empty")).toHaveTextContent("Soil moisture");
  });
});

describe("facility selection", () => {
  it("refetches the configuration for the newly chosen facility", async () => {
    const mock = installFetchMock(healthyRoutes());

    renderWithQuery(<Dashboard />);
    await screen.findByTestId("facility-context");
    expect(mock.countFor(CONFIG_URL)).toBe(1);

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Active facility"), OTHER_FACILITY_ID);

    await waitFor(() => {
      expect(screen.getByText("No measurement points")).toBeInTheDocument();
    });
    expect(mock.countFor(OTHER_CONFIG_URL)).toBe(1);
    expect(mock.countFor(CONFIG_URL)).toBe(1);
  });

  it("does not write anything to the backend when the selection changes", async () => {
    const mock = installFetchMock(healthyRoutes());

    renderWithQuery(<Dashboard />);
    await screen.findByTestId("facility-context");

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Active facility"), OTHER_FACILITY_ID);
    await waitFor(() => {
      expect(screen.getByText("No measurement points")).toBeInTheDocument();
    });

    const fetchStub = globalThis.fetch as unknown as { mock: { calls: [string, RequestInit?][] } };
    for (const [, init] of fetchStub.mock.calls) {
      expect(init?.method ?? "GET").toBe("GET");
    }
    expect(mock.calls.every((url) => url.startsWith("/api/v1"))).toBe(true);
  });
});

describe("failure behaviour", () => {
  it("shows a full error state and a working Retry on first load", async () => {
    const mock = installFetchMock({
      ...healthyRoutes(),
      [FACILITIES_URL]: (attempt) =>
        attempt === 1 ? { networkError: true } : { body: facilityPage },
    });

    renderWithQuery(<Dashboard />);

    expect(await screen.findByText("Cannot load facilities")).toBeInTheDocument();
    expect(screen.queryByTestId("measurement-card")).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Retry loading facilities" }));

    expect(await screen.findByTestId("facility-context")).toBeInTheDocument();
    expect(mock.countFor(FACILITIES_URL)).toBe(2);
    expect(screen.getAllByTestId("measurement-card")).toHaveLength(4);
  });

  it("keeps the last successful snapshot and marks it stale when a refresh fails", async () => {
    const routes = healthyRoutes();
    const mock = installFetchMock(routes);

    const { client } = renderWithQuery(<Dashboard />);
    await screen.findByTestId("facility-context");
    expect(screen.getAllByTestId("measurement-card")).toHaveLength(4);

    // The backend goes down; the next poll is what fails.
    mock.setRoutes({ ...routes, [CONFIG_URL]: { networkError: true } });
    await client.refetchQueries({ queryKey: ["facility-configuration", FACILITY_ID] });

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Stale");
    });
    expect(screen.getByRole("status")).toHaveTextContent("last successful snapshot");
    // The snapshot is still on screen — this is the whole point of the state.
    expect(screen.getAllByTestId("measurement-card")).toHaveLength(4);
    const card = screen
      .getAllByTestId("measurement-card")
      .find((element) => element.dataset["pointCode"] === "air_temperature")!;
    expect(within(card).getByTestId("card-value")).toHaveTextContent("23.4");
  });

  it("recovers from stale back to live when Retry succeeds", async () => {
    const routes = healthyRoutes();
    const mock = installFetchMock(routes);

    const { client } = renderWithQuery(<Dashboard />);
    await screen.findByTestId("facility-context");

    mock.setRoutes({ ...routes, [CONFIG_URL]: { networkError: true } });
    await client.refetchQueries({ queryKey: ["facility-configuration", FACILITY_ID] });
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Stale");
    });

    mock.setRoutes(routes);
    const user = userEvent.setup();
    await user.click(within(screen.getByRole("status")).getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Live");
    });
  });

  it("reports a partial response instead of silently showing fewer points", async () => {
    installFetchMock({
      ...healthyRoutes(),
      [CONFIG_URL]: {
        body: {
          ...facilityConfiguration,
          points: [...facilityConfiguration.points, { code: "no_identifier" }],
        },
      },
    });

    renderWithQuery(<Dashboard />);

    expect(await screen.findByTestId("partial-points-notice")).toHaveTextContent(
      "1 point could not be read",
    );
    expect(screen.getAllByTestId("measurement-card")).toHaveLength(4);
  });

  it("shows a hard error state when the configuration itself is malformed", async () => {
    installFetchMock({
      ...healthyRoutes(),
      [CONFIG_URL]: { body: { totally: "unexpected" } },
    });

    renderWithQuery(<Dashboard />);

    expect(await screen.findByText("Cannot load this facility")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("unexpected response");
  });
});

describe("accessibility", () => {
  it("labels the facility selector and reaches it by keyboard", async () => {
    installFetchMock(healthyRoutes());

    renderWithQuery(<Dashboard />);
    await findChart("air_temperature");

    const facility = screen.getByLabelText("Active facility");
    expect(facility.tagName).toBe("SELECT");

    const user = userEvent.setup();
    await user.tab();
    expect(facility).toHaveFocus();

    // The next stop is the first chart's own control, because the chart
    // selector it used to sit in front of no longer exists.
    await user.tab();
    expect(screen.getAllByRole("button", { name: "Show sample table" })[0]).toHaveFocus();
  });

  it("selects a facility with the keyboard alone", async () => {
    const mock = installFetchMock(healthyRoutes());

    renderWithQuery(<Dashboard />);
    await screen.findByTestId("facility-context");

    const user = userEvent.setup();
    await user.tab();
    await user.selectOptions(screen.getByLabelText("Active facility"), OTHER_FACILITY_ID);

    await waitFor(() => {
      expect(mock.countFor(OTHER_CONFIG_URL)).toBe(1);
    });
  });

  it("gives the screen one h1 and a heading per section", async () => {
    installFetchMock(healthyRoutes());

    renderWithQuery(<Dashboard />);
    await screen.findByTestId("facility-context");

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 2, name: "Facility" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Measurement points" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Recent history" })).toBeInTheDocument();
  });

  it("exposes each chart's numbers as text, not only as a drawing", async () => {
    installFetchMock(healthyRoutes());

    renderWithQuery(<Dashboard />);

    const chart = await findChart("air_temperature");
    const summary = within(chart).getByTestId("chart-summary");
    expect(summary).toHaveTextContent("Latest");
    expect(summary).toHaveTextContent("ranging");
    expect(within(chart).getByRole("button", { name: "Show sample table" })).toBeInTheDocument();
  });
});
