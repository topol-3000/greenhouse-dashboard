/**
 * The topology experience, end to end, over contract-valid fixtures.
 *
 * These assert what a customer can do — see their greenhouses, open a facility,
 * open a control zone, switch facility, arrive by deep link — and what the
 * portal must refuse to do: show a zone under a facility the API did not put it
 * in, present a partial list as the whole topology, or render a single value
 * the contract does not contain.
 */

import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  backendRoutes,
  climateZone,
  controlZonePointsUrl,
  controlZoneUrl,
  DEFAULT_DATASET,
  EMPTY_DATASET,
  facilitiesUrl,
  facilityUrl,
  facilityZonesUrl,
  harbourSite,
  IDS,
  irrigationZone,
  northGreenhouse,
  NOT_FOUND_BODY,
  page,
  riversideSite,
  seedlingClimateZone,
  seedlingRoom,
  sitesUrl,
} from "../../test/fixtures";
import { renderPortal } from "../../test/harness";
import { controlZonePath, facilityPath, GREENHOUSES_PATH } from "../../routes/routes";

const FACILITY_URL = facilityPath(IDS.northGreenhouse);
const ZONE_URL = controlZonePath(IDS.northGreenhouse, IDS.climateZone);

describe("the Greenhouses overview", () => {
  it("renders every site the cloud API returns, with its facilities", async () => {
    renderPortal({ path: GREENHOUSES_PATH });

    const cards = await screen.findAllByTestId("site-card");
    expect(cards).toHaveLength(2);

    const riverside = cards[0]!;
    expect(
      within(riverside).getByRole("heading", { name: riversideSite.name }),
    ).toBeInTheDocument();
    expect(within(riverside).getByText(riversideSite.code)).toBeInTheDocument();
    expect(within(riverside).getByText(riversideSite.timezone)).toBeInTheDocument();

    // Facilities are grouped by the site_id the API published, and each links
    // to its own workspace.
    expect(within(riverside).getByRole("link", { name: northGreenhouse.name })).toHaveAttribute(
      "href",
      FACILITY_URL,
    );
    expect(within(riverside).getByRole("link", { name: seedlingRoom.name })).toHaveAttribute(
      "href",
      facilityPath(IDS.seedlingRoom),
    );
    // The backend's own vocabulary, presented as a label rather than renamed.
    expect(within(riverside).getByText("Seedling room")).toBeInTheDocument();
  });

  it("represents a site with no facilities truthfully", async () => {
    renderPortal({ path: GREENHOUSES_PATH });

    const cards = await screen.findAllByTestId("site-card");
    const harbour = cards.find((card) => within(card).queryByText(harbourSite.name) !== null);
    expect(harbour).toBeDefined();
    expect(within(harbour!).getByTestId("site-without-facilities")).toHaveTextContent(
      "The cloud API returns no facilities for this site",
    );
    expect(within(harbour!).queryByRole("link")).toBeNull();
  });

  it("says plainly when the cloud API has no topology at all", async () => {
    renderPortal({ path: GREENHOUSES_PATH, routes: backendRoutes(EMPTY_DATASET) });

    const empty = await screen.findByTestId("topology-empty");
    expect(empty).toHaveTextContent("No greenhouse topology is available through the API");

    // No invented resource, and no action that does not exist.
    expect(screen.queryAllByTestId("site-card")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /add|create|new/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /add|create|new/i })).toBeNull();
  });

  it("does not claim an incomplete page of facilities is the whole list", async () => {
    // The backend counts more facilities than it hands over.
    renderPortal({
      path: GREENHOUSES_PATH,
      routes: backendRoutes(DEFAULT_DATASET, {
        [facilitiesUrl()]: {
          body: { items: [northGreenhouse], total: 40, limit: 200, offset: 0 },
        },
        [facilitiesUrl(1)]: { body: { items: [], total: 40, limit: 200, offset: 1 } },
      }),
    });

    const notice = await screen.findByTestId("incomplete-collection");
    expect(notice).toHaveTextContent("Showing 1 of the 40 facilities");
    expect(notice).toHaveTextContent("This is not the complete list");
  });

  it("follows pagination until the collection is complete", async () => {
    const { api } = renderPortal({
      path: GREENHOUSES_PATH,
      routes: backendRoutes(DEFAULT_DATASET, {
        [sitesUrl()]: { body: { items: [riversideSite], total: 2, limit: 200, offset: 0 } },
        [sitesUrl(1)]: { body: { items: [harbourSite], total: 2, limit: 200, offset: 1 } },
      }),
    });

    expect(await screen.findAllByTestId("site-card")).toHaveLength(2);
    expect(api.countFor(sitesUrl(0))).toBe(1);
    expect(api.countFor(sitesUrl(1))).toBe(1);
    expect(screen.queryByTestId("incomplete-collection")).toBeNull();
  });

  it("keeps the shell usable when the topology request fails", async () => {
    renderPortal({
      path: GREENHOUSES_PATH,
      routes: backendRoutes(DEFAULT_DATASET, { [sitesUrl()]: { networkError: true } }),
    });

    const error = await screen.findByTestId("request-error");
    expect(error).toHaveTextContent("The portal could not reach the cloud API.");

    // A failed query is a state of the page, not a replacement for the portal.
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Greenhouses" })).toBeInTheDocument();

    // And it can be left: the rest of the portal still navigates.
    await userEvent.click(
      within(screen.getByRole("navigation", { name: "Primary" })).getByRole("link", {
        name: "Dashboard",
      }),
    );
    expect(await screen.findByTestId("dashboard-page")).toBeInTheDocument();
  });

  it("keeps usable data on screen when a background refresh fails", async () => {
    const { api, client } = renderPortal({ path: GREENHOUSES_PATH });
    expect(await screen.findAllByTestId("site-card")).toHaveLength(2);

    api.setRoutes(backendRoutes(DEFAULT_DATASET, { [sitesUrl()]: { networkError: true } }));
    await act(async () => {
      await client.refetchQueries({ queryKey: ["topology", "sites", "list"] });
    });

    // The failure is visible…
    expect(await screen.findByTestId("refresh-failure")).toHaveTextContent(
      "Showing the last data the cloud API returned",
    );
    // …and the topology that was already loaded is still there and still linked.
    expect(screen.getAllByTestId("site-card")).toHaveLength(2);
    expect(screen.getByRole("link", { name: northGreenhouse.name })).toHaveAttribute(
      "href",
      FACILITY_URL,
    );
  });
});

describe("the Facility workspace", () => {
  it("renders the facility, its parent site and its control zones", async () => {
    renderPortal({ path: FACILITY_URL });

    expect(await screen.findByTestId("facility-relationship")).toHaveTextContent(
      `${northGreenhouse.name} is a facility of the site ${riversideSite.name}`,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: northGreenhouse.name }),
    ).toBeInTheDocument();

    const meta = screen.getByTestId("facility-meta");
    expect(within(meta).getByText(northGreenhouse.code)).toBeInTheDocument();
    expect(within(meta).getByText("Greenhouse")).toBeInTheDocument();

    expect(screen.getByRole("link", { name: climateZone.name })).toHaveAttribute("href", ZONE_URL);
    expect(screen.getByRole("link", { name: irrigationZone.name })).toHaveAttribute(
      "href",
      controlZonePath(IDS.northGreenhouse, IDS.irrigationZone),
    );
  });

  it("says truthfully when a facility has no control zones", async () => {
    renderPortal({
      path: facilityPath(IDS.seedlingRoom),
      routes: backendRoutes(DEFAULT_DATASET, {
        [facilityZonesUrl(IDS.seedlingRoom)]: { body: page([]) },
      }),
    });

    const empty = await screen.findByTestId("facility-zones-empty");
    expect(empty).toHaveTextContent("This facility has no control zones");
    expect(screen.queryByRole("link", { name: seedlingClimateZone.name })).toBeNull();
  });

  it("renders a resource-level not-found for a facility the API does not have", async () => {
    renderPortal({
      path: facilityPath(IDS.unknownFacility),
      routes: backendRoutes(DEFAULT_DATASET, {
        [facilityUrl(IDS.unknownFacility)]: { status: 404, body: NOT_FOUND_BODY },
        [facilityZonesUrl(IDS.unknownFacility)]: { body: page([]) },
      }),
    });

    const missing = await screen.findByTestId("resource-not-found");
    expect(missing).toHaveTextContent("This facility is not in the cloud API");
    expect(missing).toHaveTextContent(IDS.unknownFacility);

    // Distinct from the portal's catch-all 404, and still inside the shell.
    expect(screen.queryByRole("heading", { level: 1, name: "Page not found" })).toBeNull();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
    expect(within(missing).getByRole("link", { name: "Back to Greenhouses" })).toBeInTheDocument();
  });

  it("keeps the shell and the heading while the facility is loading", async () => {
    renderPortal({
      path: FACILITY_URL,
      routes: backendRoutes(DEFAULT_DATASET, {
        [facilityUrl(IDS.northGreenhouse)]: { pending: true },
      }),
    });

    expect(await screen.findByText("Loading this facility…")).toBeInTheDocument();
    // The generic route title carries the page until the name resolves.
    expect(screen.getByRole("heading", { level: 1, name: "Facility" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
  });
});

describe("the facility switcher", () => {
  it("is a labelled control listing only facilities the API returned", async () => {
    renderPortal({ path: FACILITY_URL });
    await screen.findByTestId("facility-page");

    const select = await screen.findByRole("combobox", { name: "Switch facility" });
    const options = within(select).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      northGreenhouse.name,
      seedlingRoom.name,
    ]);

    // Site context is preserved by grouping rather than by indentation.
    const group = select.querySelector("optgroup");
    expect(group?.getAttribute("label")).toBe(`${riversideSite.name} (${riversideSite.code})`);
  });

  it("navigates with the keyboard and does not pre-select anything for the user", async () => {
    renderPortal({ path: FACILITY_URL });
    await screen.findByTestId("facility-page");

    const select = await screen.findByRole("combobox", { name: "Switch facility" });
    expect(select).toHaveValue(IDS.northGreenhouse);

    await userEvent.tab();
    await userEvent.selectOptions(select, IDS.seedlingRoom);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 1, name: seedlingRoom.name }),
      ).toBeInTheDocument();
    });
    expect(screen.getByTestId("facility-relationship")).toHaveTextContent(seedlingRoom.name);
  });

  it("drops the control zone in the address when the facility changes", async () => {
    renderPortal({ path: ZONE_URL });
    await screen.findByTestId("control-zone-page");

    const select = await screen.findByRole("combobox", { name: "Switch facility" });
    await userEvent.selectOptions(select, IDS.seedlingRoom);

    // The new facility's workspace, not the old zone carried into it.
    expect(await screen.findByTestId("facility-page")).toBeInTheDocument();
    expect(screen.queryByTestId("control-zone-page")).toBeNull();
    expect(screen.queryByText(climateZone.name)).toBeNull();
  });
});

describe("the ControlZone workspace", () => {
  it("renders the zone with its facility and site, reached by a deep link", async () => {
    renderPortal({ path: ZONE_URL });

    expect(await screen.findByTestId("zone-relationship")).toHaveTextContent(
      `${climateZone.name} is a control zone of the facility ${northGreenhouse.name}, which belongs to the site ${riversideSite.name}`,
    );
    expect(screen.getByRole("heading", { level: 1, name: climateZone.name })).toBeInTheDocument();

    const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(trail).getByRole("link", { name: "Greenhouses" })).toHaveAttribute(
      "href",
      GREENHOUSES_PATH,
    );
    expect(within(trail).getByRole("link", { name: northGreenhouse.name })).toHaveAttribute(
      "href",
      FACILITY_URL,
    );
  });

  it("lists the zone's point composition without a single reading", async () => {
    renderPortal({ path: ZONE_URL });

    const table = await screen.findByTestId("zone-points");
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent);
    expect(headers).toEqual([
      "Point name",
      "Point code",
      "Point kind",
      "Role in zone",
      "Data type",
      "Unit",
    ]);

    // Classified by the contract's own fields, never by the point's name.
    expect(within(table).getByText("North air temperature")).toBeInTheDocument();
    expect(within(table).getByText("Primary measurement")).toBeInTheDocument();
    expect(within(table).getByText("Control output")).toBeInTheDocument();
    expect(within(table).getAllByText("Not set").length).toBeGreaterThan(0);

    const text = table.textContent ?? "";
    expect(text).not.toMatch(/\d+(\.\d+)?\s?(°C|°F|%RH|lx|ppm|kPa)/);
    expect(within(table).queryByRole("button")).toBeNull();
  });

  it("refuses to show a control zone under a facility it does not belong to", async () => {
    // Both resources exist; only the relationship is wrong.
    renderPortal({ path: controlZonePath(IDS.seedlingRoom, IDS.climateZone) });

    const mismatch = await screen.findByTestId("relationship-mismatch");
    expect(mismatch).toHaveTextContent("This control zone belongs to a different facility");
    expect(
      within(mismatch).getByRole("link", {
        name: "Open the facility this control zone belongs to",
      }),
    ).toHaveAttribute("href", FACILITY_URL);

    // Nothing about the zone is drawn under the wrong parent.
    expect(screen.queryByTestId("zone-meta")).toBeNull();
    expect(screen.queryByTestId("zone-points")).toBeNull();
    expect(screen.queryByTestId("monitoring")).toBeNull();
    // Nor is its name claimed by the breadcrumb trail.
    const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(trail).queryByText(climateZone.name)).toBeNull();
    expect(within(trail).getByText("Control zone")).toBeInTheDocument();
  });

  it("renders a resource-level not-found for a zone the API does not have", async () => {
    renderPortal({
      path: controlZonePath(IDS.northGreenhouse, IDS.unknownZone),
      routes: backendRoutes(DEFAULT_DATASET, {
        [controlZoneUrl(IDS.unknownZone)]: { status: 404, body: NOT_FOUND_BODY },
        [controlZonePointsUrl(IDS.unknownZone)]: { status: 404, body: NOT_FOUND_BODY },
      }),
    });

    const missing = await screen.findByTestId("resource-not-found");
    expect(missing).toHaveTextContent("This control zone is not in the cloud API");
    expect(screen.queryByRole("heading", { level: 1, name: "Page not found" })).toBeNull();
  });

  it("treats an identifier the contract cannot accept as a missing resource", async () => {
    const badId = "not-a-uuid";
    renderPortal({
      path: controlZonePath(IDS.northGreenhouse, badId),
      routes: backendRoutes(DEFAULT_DATASET, {
        [controlZoneUrl(badId)]: { status: 422, body: { detail: [] } },
        [controlZonePointsUrl(badId)]: { status: 422, body: { detail: [] } },
      }),
    });

    expect(await screen.findByTestId("resource-not-found")).toHaveTextContent(
      "This control zone is not in the cloud API",
    );
  });
});

describe("navigating the topology", () => {
  it("walks Dashboard → Greenhouses → Facility → ControlZone", async () => {
    renderPortal({ path: "/" });
    await screen.findByTestId("dashboard-page");

    await userEvent.click(
      within(screen.getByRole("navigation", { name: "Primary" })).getByRole("link", {
        name: "Greenhouses",
      }),
    );
    await screen.findByTestId("greenhouses-page");

    await userEvent.click(await screen.findByRole("link", { name: northGreenhouse.name }));
    await screen.findByTestId("facility-page");
    expect(
      screen.getByRole("heading", { level: 1, name: northGreenhouse.name }),
    ).toBeInTheDocument();

    await userEvent.click(await screen.findByRole("link", { name: climateZone.name }));
    await screen.findByTestId("control-zone-page");
    expect(screen.getByRole("heading", { level: 1, name: climateZone.name })).toBeInTheDocument();
  });

  it("keeps the document title on the resolved resource name", async () => {
    renderPortal({ path: FACILITY_URL });
    await screen.findByTestId("facility-page");
    await waitFor(() => {
      expect(document.title).toBe(`${northGreenhouse.name} · AI Greenhouse Customer Portal`);
    });
  });

  it("survives leaving a route whose requests have not answered", async () => {
    renderPortal({
      path: FACILITY_URL,
      routes: backendRoutes(DEFAULT_DATASET, {
        [facilityZonesUrl(IDS.northGreenhouse)]: { pending: true },
      }),
    });
    expect(await screen.findByText("Loading this facility…")).toBeInTheDocument();

    await userEvent.click(
      within(screen.getByRole("navigation", { name: "Primary" })).getByRole("link", {
        name: "Dashboard",
      }),
    );
    expect(await screen.findByTestId("dashboard-page")).toBeInTheDocument();
  });

  it("renders the portal 404 for an address the route table does not publish", () => {
    renderPortal({ path: "/facilities" });

    expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeInTheDocument();
    expect(screen.queryByTestId("resource-not-found")).toBeNull();
  });
});

describe("truthfulness of the topology screens", () => {
  it("keeps the overview and the facility workspace free of readings", async () => {
    // Monitoring belongs to the control zone workspace and to nothing above it:
    // these two screens must not grow telemetry cards, aggregate values or
    // facility-wide claims assembled from partial data.
    for (const path of [GREENHOUSES_PATH, FACILITY_URL]) {
      const view = renderPortal({ path });
      await screen.findByRole("heading", { level: 1 });
      await waitFor(() => {
        expect(screen.queryByText(/Loading/)).toBeNull();
      });

      const text = document.body.textContent ?? "";
      for (const forbidden of [
        "Setpoint",
        "Latest reading",
        "Last reading",
        "Actuator",
        "Command",
        "Automation",
        "Schedule",
        "Simulation",
        "Grow cycle",
        "Recipe",
      ]) {
        expect(text).not.toContain(forbidden);
      }
      expect(text).not.toMatch(/\d+(\.\d+)?\s?(°C|°F|%RH|lx|ppm|kPa)/);
      expect(screen.queryByTestId("monitoring")).toBeNull();

      view.unmount();
    }
  });

  it("asks only for the read endpoints the contract publishes", async () => {
    const { api } = renderPortal({ path: ZONE_URL });
    await screen.findByTestId("control-zone-page");
    await screen.findByTestId("measurement-cards");

    for (const url of api.calls) {
      expect(url).toMatch(/^(\/health|\/api\/v1\/(sites|facilities|control-zones|points)(\/|\?))/);
    }
    // No endpoint that would carry a command, an actuator or a device into the
    // portal, and no per-point state request: the configuration document is the
    // one current-state read.
    expect(api.calls.some((url) => url.includes("/state"))).toBe(false);
    expect(api.calls.some((url) => url.includes("/commands"))).toBe(false);
    expect(api.calls.some((url) => url.includes("/control-loops"))).toBe(false);
    expect(api.calls.some((url) => url.includes("/gateways"))).toBe(false);
    expect(api.calls.some((url) => url.includes("/edge/"))).toBe(false);
    // Telemetry is requested only once a point has been selected.
    expect(api.calls.some((url) => url.includes("/telemetry"))).toBe(false);
  });

  it("does not wait for the health check before loading topology", async () => {
    renderPortal({
      path: GREENHOUSES_PATH,
      routes: backendRoutes(DEFAULT_DATASET, { "/health": { pending: true } }),
    });

    expect(await screen.findAllByTestId("site-card")).toHaveLength(2);
    expect(screen.getByTestId("api-status")).toHaveTextContent("Cloud API: Checking");
  });

  it("keeps loaded topology when the health poll fails", async () => {
    const { api, client } = renderPortal({ path: GREENHOUSES_PATH });
    expect(await screen.findAllByTestId("site-card")).toHaveLength(2);

    api.setRoutes(backendRoutes(DEFAULT_DATASET, { "/health": { networkError: true } }));
    await act(async () => {
      await client.refetchQueries({ queryKey: ["api-health"] });
    });

    await waitFor(() => {
      expect(screen.getByTestId("api-status")).toHaveTextContent("Cloud API: Unavailable");
    });
    expect(screen.getAllByTestId("site-card")).toHaveLength(2);
  });
});

describe("the dashboard's topology summary", () => {
  it("shows the counts the cloud API itself reports", async () => {
    renderPortal({ path: "/" });

    const summary = await screen.findByTestId("dashboard-topology");
    expect(summary).toHaveTextContent("Sites reported by the cloud API");
    expect(summary).toHaveTextContent("2");
    expect(within(summary).getByRole("link", { name: "Open Greenhouses" })).toHaveAttribute(
      "href",
      GREENHOUSES_PATH,
    );
  });

  it("says there are no greenhouses rather than inventing one", async () => {
    renderPortal({ path: "/", routes: backendRoutes(EMPTY_DATASET) });

    const empty = await screen.findByTestId("dashboard-topology-empty");
    expect(empty).toHaveTextContent("No greenhouses yet");
    expect(screen.queryByTestId("dashboard-topology")).toBeNull();
  });

  it("keeps the cloud API availability experience intact", async () => {
    renderPortal({ path: "/" });

    await waitFor(() => {
      expect(screen.getByTestId("api-status")).toHaveTextContent("Cloud API: Available");
    });
    expect(screen.getByRole("heading", { name: "The cloud API is available" })).toBeInTheDocument();
  });
});

describe("unused fixtures guard", () => {
  it("keeps the zone that proves relationships are checked", () => {
    // Named so the fixture cannot be deleted as unused: the mismatch test
    // depends on a zone that belongs to the other facility.
    expect(seedlingClimateZone.facility_id).toBe(IDS.seedlingRoom);
  });
});
