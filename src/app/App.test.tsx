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
import { backendRoutes, DEFAULT_DATASET, EMPTY_DATASET } from "../test/fixtures";
import { HEALTH_URL, HEALTHY_BODY, renderPortal } from "../test/harness";

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

  it("offers exactly the working Dashboard and Greenhouses routes", async () => {
    renderPortal();

    const navigation = screen.getByRole("navigation", { name: "Primary" });
    const links = within(navigation).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Dashboard", "Greenhouses"]);

    // Nothing unbuilt is advertised anywhere in the shell.
    for (const absent of ["Monitoring", "Control", "Activity", "Settings", "Users", "Billing"]) {
      expect(within(navigation).queryByText(absent)).toBeNull();
    }

    // Every offered route resolves to a real page rather than the 404.
    for (const link of links) {
      await userEvent.click(link);
      expect(screen.queryByRole("heading", { level: 1, name: "Page not found" })).toBeNull();
    }
  });

  it("keeps the mobile navigation accessible from the keyboard", async () => {
    renderPortal();

    const toggle = screen.getByRole("button", { name: "Menu" });
    const navigation = screen.getByRole("navigation", { name: "Primary" });

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", navigation.id);
    expect(navigation).toHaveAttribute("data-open", "false");

    await userEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Close menu" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(navigation).toHaveAttribute("data-open", "true");

    // Escape closes the menu and hands focus back to the control that opened it.
    await userEvent.keyboard("{Escape}");
    const reopened = screen.getByRole("button", { name: "Menu" });
    expect(reopened).toHaveAttribute("aria-expanded", "false");
    expect(reopened).toHaveFocus();
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
  it("renders no telemetry, actuator state or command data", async () => {
    renderPortal();
    await screen.findByTestId("dashboard-topology");

    const text = document.body.textContent ?? "";

    for (const forbidden of ["Setpoint", "Actuator", "Command", "Automation", "Simulation"]) {
      expect(text).not.toContain(forbidden);
    }
    // No readings: a number with a unit would have to have come from somewhere.
    expect(text).not.toMatch(/\d+(\.\d+)?\s?(°C|°F|%RH|lx|ppm|kPa)/);
  });

  it("shows no count at all when the cloud API reports no topology", async () => {
    renderPortal({ routes: backendRoutes(EMPTY_DATASET) });
    await screen.findByTestId("dashboard-topology-empty");

    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/\d+\s+(facilities|sites|zones|points|commands|samples)/i);
    expect(screen.getByText(/Nothing is invented to fill the gap/)).toBeInTheDocument();
  });

  it("asks the backend only for health and the topology collections", async () => {
    const { api } = renderPortal();
    await screen.findByTestId("dashboard-topology");

    await waitFor(() => {
      expect(api.calls.length).toBeGreaterThan(0);
    });
    expect(new Set(api.calls)).toEqual(
      new Set([
        HEALTH_URL,
        "/api/v1/sites?limit=200&offset=0",
        "/api/v1/facilities?limit=200&offset=0",
      ]),
    );
  });
});
