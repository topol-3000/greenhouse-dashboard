/**
 * The portal shell, end to end, over a stubbed backend.
 *
 * These tests assert what a customer sees — identity, navigation, routing,
 * availability and the absence of invented data — rather than how any of it is
 * implemented.
 */

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  backendRoutes,
  DEFAULT_DATASET,
  EMPTY_DATASET,
  facilityConfigurationUrl,
  IDS,
  northGreenhouse,
  POINT_IDS,
} from "../test/fixtures";
import { HEALTH_URL, HEALTHY_BODY, renderPortal } from "../test/harness";
import { DASHBOARD_FACILITY_LIMIT } from "../api/queries";

const PORTAL_NAME = "AI Greenhouse Customer Portal";

describe("the Customer Portal shell", () => {
  it("presents itself as the Customer Portal, not as a standalone dashboard", async () => {
    renderPortal();

    const brand = screen.getByRole("link", { name: PORTAL_NAME });
    expect(brand).toHaveAttribute("href", "/");
    expect(brand).toHaveTextContent("AI Greenhouse");
    expect(brand).toHaveTextContent("Customer Portal");

    await waitFor(() => {
      expect(document.title).toBe(`Dashboard · ${PORTAL_NAME}`);
    });
  });

  it("renders the dashboard feature at / inside the shell", async () => {
    renderPortal({ path: "/" });

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();

    expect(screen.getByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
    const dashboard = await screen.findByTestId("dashboard-page");
    expect(
      within(dashboard).getByRole("heading", {
        name: "Monitor and operate your greenhouse facilities",
      }),
    ).toBeInTheDocument();
  });

  it("renders a portal-styled 404 for an unknown address", async () => {
    // An address the route table does not publish at all — distinct from a
    // published route whose resource the cloud API does not have.
    renderPortal({ path: "/no-such-section" });

    expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "This address does not exist in the portal" }),
    ).toBeInTheDocument();

    // Still the portal: identity, navigation and the way back are all present.
    expect(screen.getByRole("link", { name: PORTAL_NAME })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();

    const breadcrumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(breadcrumbs).getByRole("link", { name: "Dashboard" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("link", { name: "Go to the Dashboard" }));
    expect(await screen.findByTestId("dashboard-page")).toBeInTheDocument();
  });

  it("offers exactly the working Dashboard, Greenhouses and Activity routes", async () => {
    renderPortal();

    const navigation = screen.getByRole("navigation", { name: "Primary" });
    const links = within(navigation).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Dashboard", "Greenhouses", "Activity"]);

    // Nothing unbuilt is advertised anywhere in the shell.
    for (const absent of ["Monitoring", "Control", "Settings", "Users", "Billing"]) {
      expect(within(navigation).queryByText(absent)).toBeNull();
    }

    // Every offered route resolves to a real page rather than the 404.
    for (const link of links) {
      await userEvent.click(link);
      expect(screen.queryByRole("heading", { level: 1, name: "Page not found" })).toBeNull();
    }
  });

  it("marks the current route in the navigation, and only the current route", async () => {
    renderPortal({ path: "/sites" });

    const navigation = screen.getByRole("navigation", { name: "Primary" });
    expect(within(navigation).getByRole("link", { name: "Greenhouses" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // A nested route is not the Dashboard, and the landing entry must not claim
    // to be active underneath everything else.
    expect(within(navigation).getByRole("link", { name: "Dashboard" })).not.toHaveAttribute(
      "aria-current",
    );

    await userEvent.click(within(navigation).getByRole("link", { name: "Activity" }));
    expect(within(navigation).getByRole("link", { name: "Activity" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(navigation).getByRole("link", { name: "Greenhouses" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("moves focus to the new page heading after a navigation", async () => {
    renderPortal();

    await userEvent.click(
      within(screen.getByRole("navigation", { name: "Primary" })).getByRole("link", {
        name: "Activity",
      }),
    );

    const heading = screen.getByRole("heading", { level: 1, name: "Activity" });
    expect(heading).toHaveFocus();
  });

  it("keeps the mobile navigation accessible from the keyboard", async () => {
    renderPortal();

    const toggle = screen.getByRole("button", { name: "Menu" });
    const navigation = screen.getByRole("navigation", { name: "Primary" });
    // The collapsible region is the sidebar the navigation sits in; the
    // stylesheet takes it out of the layout, and its links out of the tab
    // order, whenever it is closed at a narrow width.
    const sidebar = navigation.closest("[data-open]");

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", navigation.id);
    expect(sidebar).toHaveAttribute("data-open", "false");

    await userEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Close menu" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(sidebar).toHaveAttribute("data-open", "true");

    // Escape closes the menu and hands focus back to the control that opened it.
    await userEvent.keyboard("{Escape}");
    const reopened = screen.getByRole("button", { name: "Menu" });
    expect(reopened).toHaveAttribute("aria-expanded", "false");
    expect(reopened).toHaveFocus();
    expect(sidebar).toHaveAttribute("data-open", "false");
  });

  it("closes the open menu when a navigation happens inside it", async () => {
    renderPortal();

    await userEvent.click(screen.getByRole("button", { name: "Menu" }));
    const navigation = screen.getByRole("navigation", { name: "Primary" });
    expect(navigation.closest("[data-open]")).toHaveAttribute("data-open", "true");

    await userEvent.click(within(navigation).getByRole("link", { name: "Greenhouses" }));

    expect(await screen.findByTestId("greenhouses-page")).toBeInTheDocument();
    expect(navigation.closest("[data-open]")).toHaveAttribute("data-open", "false");
  });

  it("reaches the main region with the skip link", () => {
    renderPortal();

    const skip = screen.getByRole("link", { name: "Skip to main content" });
    expect(skip).toHaveAttribute("href", "#portal-main");
    expect(screen.getByRole("main").id).toBe("portal-main");
  });
});

describe("cloud API availability", () => {
  it("shows the loading state while the first health check is in flight", async () => {
    renderPortal({ routes: { [HEALTH_URL]: { pending: true } } });

    expect(await screen.findByText("Contacting the cloud API…")).toBeInTheDocument();
    expect(screen.getByTestId("api-status")).toHaveTextContent("Cloud API: Checking");
    expect(screen.getByTestId("api-status")).toHaveAttribute("data-state", "checking");
    expect(screen.getByRole("heading", { name: "Checking the cloud API" })).toBeInTheDocument();
  });

  it("shows that the API is available when the backend reports it healthy", async () => {
    renderPortal();

    await waitFor(() => {
      expect(screen.getByTestId("api-status")).toHaveTextContent("Cloud API: Available");
    });
    expect(screen.getByTestId("api-status")).toHaveAttribute("data-state", "available");
    expect(screen.getByRole("heading", { name: "The cloud API is available" })).toBeInTheDocument();
    expect(screen.getByTestId("api-checked-at")).toHaveTextContent("Last checked");
  });

  it("reports a reachable but degraded backend as degraded, not as available", async () => {
    renderPortal({
      routes: {
        [HEALTH_URL]: {
          status: 503,
          body: { status: "unavailable", service: "greenhouse", database: "unavailable" },
        },
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId("api-status")).toHaveTextContent("Cloud API: Degraded");
    });
    expect(screen.getByRole("heading", { name: "The cloud API is degraded" })).toBeInTheDocument();
  });

  it("stays usable when the cloud API cannot be reached", async () => {
    const { api } = renderPortal({
      routes: backendRoutes(DEFAULT_DATASET, { [HEALTH_URL]: { networkError: true } }),
    });

    await waitFor(() => {
      expect(screen.getByTestId("api-status")).toHaveTextContent("Cloud API: Unavailable");
    });

    // The shell is intact: identity, navigation, heading and page content.
    expect(screen.getByRole("link", { name: PORTAL_NAME })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-page")).toBeInTheDocument();
    expect(
      screen.getByText("The portal could not reach the cloud API.", { exact: false }),
    ).toBeInTheDocument();

    // And the user can act on it: rechecking really issues another request.
    api.setRoutes(backendRoutes(DEFAULT_DATASET, { [HEALTH_URL]: { body: HEALTHY_BODY } }));
    await userEvent.click(screen.getByRole("button", { name: "Check again" }));

    await waitFor(() => {
      expect(screen.getByTestId("api-status")).toHaveTextContent("Cloud API: Available");
    });
    expect(api.countFor(HEALTH_URL)).toBeGreaterThan(1);
  });

  it("announces an availability change in the global notification region", async () => {
    const { api } = renderPortal();

    await waitFor(() => {
      expect(screen.getByTestId("api-status")).toHaveTextContent("Cloud API: Available");
    });
    const region = screen.getByTestId("notification-region");
    expect(region).toBeEmptyDOMElement();

    api.setRoutes(backendRoutes(DEFAULT_DATASET, { [HEALTH_URL]: { networkError: true } }));
    await userEvent.click(screen.getByRole("button", { name: "Check again" }));

    await waitFor(() => {
      expect(region).toHaveTextContent("The portal could not reach the cloud API.");
    });

    await userEvent.click(within(region).getByRole("button", { name: "Dismiss" }));
    expect(region).toBeEmptyDOMElement();
  });
});

describe("truthfulness of the landing page", () => {
  it("shows only readings the cloud API published, under the facility that owns them", async () => {
    renderPortal();
    await screen.findByTestId("dashboard-topology");
    const sections = await screen.findAllByTestId("dashboard-facility-readings");

    // A reading is on the landing page because a facility's configuration
    // document carried it. Every one of them is inside the section named for
    // that facility, never loose on the page.
    const airTemperature = screen
      .getAllByTestId("measurement-card")
      .find((card) => card.getAttribute("data-point-id") === POINT_IDS.airTemp);
    expect(airTemperature).toBeDefined();
    expect(sections.some((section) => section.contains(airTemperature ?? null))).toBe(true);

    // Everything the portal still does not have stays absent.
    const text = document.body.textContent ?? "";
    for (const forbidden of ["Setpoint", "Actuator", "Command", "Automation", "Simulation"]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("adds nothing up across the facilities it shows", async () => {
    renderPortal();
    await screen.findAllByTestId("dashboard-facility-readings");

    const text = document.body.textContent ?? "";
    // The counts on this page are the backend's own row totals. An average, a
    // minimum, a maximum or a "3 of 8 healthy" would be the portal's arithmetic
    // over several facilities' readings, which is a claim the API never made.
    for (const forbidden of ["Average", "Total readings", "Overall", "Healthy", "Normal"]) {
      expect(text).not.toContain(forbidden);
    }
    expect(text).not.toMatch(
      /\d+\s+of\s+\d+\s+(zones|points|facilities)\s+\w*(ok|healthy|normal)/i,
    );
  });

  it("shows no count and no readings at all when the cloud API reports no topology", async () => {
    renderPortal({ routes: backendRoutes(EMPTY_DATASET) });
    await screen.findByTestId("dashboard-topology-empty");

    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/\d+\s+(facilities|sites|zones|points|commands|samples)/i);
    expect(screen.getByText(/Nothing is invented to fill the gap/)).toBeInTheDocument();
    // No facility means nothing to read, so there is no empty readings card
    // sitting there implying one is coming.
    expect(screen.queryByTestId("dashboard-facility-readings")).toBeNull();
  });

  it("asks the backend for health, the topology collections and one document per facility", async () => {
    const { api } = renderPortal();
    await screen.findAllByTestId("dashboard-facility-readings");

    await waitFor(() => {
      expect(api.calls.length).toBeGreaterThan(0);
    });
    expect(new Set(api.calls)).toEqual(
      new Set([
        HEALTH_URL,
        "/api/v1/sites?limit=200&offset=0",
        "/api/v1/facilities?limit=200&offset=0",
        facilityConfigurationUrl(IDS.northGreenhouse),
        facilityConfigurationUrl(IDS.seedlingRoom),
      ]),
    );
  });

  it("reads a facility's zones and readings out of the one configuration document", async () => {
    const { api } = renderPortal();
    await screen.findAllByTestId("dashboard-facility-readings");

    // The configuration document already describes every zone and every point
    // of the facility, so the landing page needs no zone list and no per-point
    // state request. That economy is the whole reason readings can be here at
    // all, so it is asserted rather than assumed.
    expect(api.calls.some((url) => url.includes("/control-zones"))).toBe(false);
    expect(api.calls.some((url) => url.includes("/telemetry"))).toBe(false);
    expect(api.calls.some((url) => url.includes("/state"))).toBe(false);
    expect(api.calls.some((url) => url.includes("/commands"))).toBe(false);
  });

  it("keeps one facility's readings when another facility cannot be read", async () => {
    renderPortal({
      routes: backendRoutes(DEFAULT_DATASET, {
        [facilityConfigurationUrl(IDS.seedlingRoom)]: { networkError: true },
      }),
    });
    await screen.findAllByTestId("dashboard-facility-readings");

    // Each facility is its own request and its own state. A customer whose
    // second greenhouse is unreachable can still read the first one.
    const airTemperature = await screen.findByText("21.4");
    expect(airTemperature).toBeInTheDocument();
    expect(await screen.findByTestId("request-error")).toBeInTheDocument();
    // And the shell is untouched by either.
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
  });

  it("reads no more facilities than the landing page's own bound", async () => {
    const facilities = Array.from({ length: DASHBOARD_FACILITY_LIMIT + 3 }, (_, index) => ({
      ...northGreenhouse,
      id: `1f7c8a90-0000-4000-8000-00000000000${String(index)}`,
      name: `Facility ${String(index)}`,
      code: `facility-${String(index)}`,
    }));

    const { api } = renderPortal({
      routes: backendRoutes({ ...DEFAULT_DATASET, facilities, configurations: [] }),
    });
    await screen.findByTestId("dashboard-readings-bound");

    const configurationCalls = api.calls.filter((url) => url.includes("/configuration"));
    expect(new Set(configurationCalls).size).toBe(DASHBOARD_FACILITY_LIMIT);
    expect(screen.getByTestId("dashboard-readings-bound")).toHaveTextContent(
      `first ${String(DASHBOARD_FACILITY_LIMIT)} of the ${String(facilities.length)} facilities`,
    );
  });
});
