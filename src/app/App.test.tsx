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
    renderPortal({ path: "/facilities/does-not-exist" });

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

  it("offers only working routes in the primary navigation", async () => {
    renderPortal();

    const navigation = screen.getByRole("navigation", { name: "Primary" });
    const links = within(navigation).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Dashboard"]);

    // Nothing unbuilt is advertised anywhere in the shell.
    for (const absent of ["Sites", "Facilities", "Activity", "Settings", "Users", "Billing"]) {
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
    const { api } = renderPortal({ routes: { [HEALTH_URL]: { networkError: true } } });

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
    api.setRoutes({ [HEALTH_URL]: { body: HEALTHY_BODY } });
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

    api.setRoutes({ [HEALTH_URL]: { networkError: true } });
    await userEvent.click(screen.getByRole("button", { name: "Check again" }));

    await waitFor(() => {
      expect(region).toHaveTextContent("The portal could not reach the cloud API.");
    });

    await userEvent.click(within(region).getByRole("button", { name: "Dismiss" }));
    expect(region).toBeEmptyDOMElement();
  });
});

describe("truthfulness of the landing page", () => {
  it("renders no greenhouse, telemetry or command data", async () => {
    renderPortal();
    await screen.findByTestId("dashboard-page");

    const text = document.body.textContent ?? "";

    // No invented domain vocabulary or fixture names.
    for (const forbidden of ["Basil", "Growbox", "Facility 1", "Zone", "Command", "Actuator"]) {
      expect(text).not.toContain(forbidden);
    }
    // No readings: a number with a unit would have to have come from somewhere.
    expect(text).not.toMatch(/\d+(\.\d+)?\s?(°C|°F|%RH|lx|ppm|kPa)/);
    // No fabricated counters.
    expect(text).not.toMatch(/\d+\s+(facilities|sites|zones|points|commands|samples)/i);

    // The page says so plainly instead.
    expect(
      screen.getByRole("heading", { name: "Nothing has been loaded yet" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Nothing on this page is sample data/)).toBeInTheDocument();
  });

  it("asks the backend for nothing but its health endpoint", async () => {
    const { api } = renderPortal();
    await screen.findByTestId("dashboard-page");

    await waitFor(() => {
      expect(api.calls.length).toBeGreaterThan(0);
    });
    expect(new Set(api.calls)).toEqual(new Set([HEALTH_URL]));
  });
});
