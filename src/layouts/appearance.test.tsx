/**
 * The shell's appearance preference, as a customer experiences it.
 *
 * These tests assert what the portal paints and what it remembers — not how the
 * preference is stored or which CoreUI class ends up on which element. The
 * observable facts are the attribute the stylesheets key off, the pressed state
 * of the three controls, and the value written to this device.
 *
 * The environment's storage and colour scheme are installed per test and taken
 * away again by the suite-wide teardown, so nothing here leaks into the next
 * test.
 */

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { installColourScheme } from "../test/colourScheme";
import { installLocalStorage } from "../test/localStorage";
import { renderPortal } from "../test/harness";
import { APPEARANCE_STORAGE_KEY, THEME_ATTRIBUTE } from "./appearance";

/** The theme the portal has actually painted. */
function paintedTheme(): string | null {
  return document.documentElement.getAttribute(THEME_ATTRIBUTE);
}

describe("the appearance selector", () => {
  it("offers exactly light, dark and auto, and says which one is in effect", async () => {
    renderPortal();

    const group = screen.getByRole("group", { name: "Appearance" });
    const options = within(group).getAllByRole("button");
    expect(options.map((option) => option.textContent)).toEqual(["Light", "Dark", "Auto"]);

    // Nothing is stored yet, so the portal is following the system.
    expect(within(group).getByRole("button", { name: "Auto" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await waitFor(() => {
      expect(paintedTheme()).toBe("light");
    });
  });

  it("paints the light theme when light is selected", async () => {
    renderPortal();

    await userEvent.click(screen.getByRole("button", { name: "Light" }));

    expect(paintedTheme()).toBe("light");
    expect(screen.getByRole("button", { name: "Light" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Auto" })).toHaveAttribute("aria-pressed", "false");
  });

  it("paints the dark theme when dark is selected", async () => {
    renderPortal();

    await userEvent.click(screen.getByRole("button", { name: "Dark" }));

    expect(paintedTheme()).toBe("dark");
    expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
  });

  it("is operable from the keyboard alone", async () => {
    renderPortal();

    const dark = screen.getByRole("button", { name: "Dark" });
    dark.focus();
    expect(dark).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    expect(paintedTheme()).toBe("dark");

    screen.getByRole("button", { name: "Light" }).focus();
    await userEvent.keyboard(" ");
    expect(paintedTheme()).toBe("light");
  });

  it("remembers the selection on this device", async () => {
    const storage = installLocalStorage();
    renderPortal();

    await userEvent.click(screen.getByRole("button", { name: "Dark" }));

    expect(storage.getItem(APPEARANCE_STORAGE_KEY)).toBe("dark");
  });

  it("starts from the preference this device already stored", async () => {
    installLocalStorage({ [APPEARANCE_STORAGE_KEY]: "dark" });
    renderPortal();

    await waitFor(() => {
      expect(paintedTheme()).toBe("dark");
    });
    expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
  });

  it("falls back to auto when the stored preference is not one the portal offers", async () => {
    installLocalStorage({ [APPEARANCE_STORAGE_KEY]: "midnight-purple" });
    installColourScheme(true);
    renderPortal();

    // Auto is in effect, so the invalid value produced the system's theme
    // rather than a broken shell.
    expect(screen.getByRole("button", { name: "Auto" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => {
      expect(paintedTheme()).toBe("dark");
    });
  });

  it("follows the system while auto is selected", async () => {
    const system = installColourScheme(false);
    renderPortal();

    await waitFor(() => {
      expect(paintedTheme()).toBe("light");
    });

    system.setPrefersDark(true);
    await waitFor(() => {
      expect(paintedTheme()).toBe("dark");
    });

    system.setPrefersDark(false);
    await waitFor(() => {
      expect(paintedTheme()).toBe("light");
    });
  });

  it("stops following the system once a theme is chosen explicitly", async () => {
    const system = installColourScheme(false);
    renderPortal();

    await userEvent.click(screen.getByRole("button", { name: "Light" }));
    expect(paintedTheme()).toBe("light");

    system.setPrefersDark(true);
    // A system change is not an instruction when the customer has chosen.
    await waitFor(() => {
      expect(paintedTheme()).toBe("light");
    });

    // Handing control back resumes following it.
    await userEvent.click(screen.getByRole("button", { name: "Auto" }));
    await waitFor(() => {
      expect(paintedTheme()).toBe("dark");
    });
  });

  it("keeps working when the device refuses to store anything", async () => {
    renderPortal();

    // The suite-wide storage is replaced with one that throws on both ends,
    // which is what a browser with storage disabled does.
    const hostile = {
      getItem: () => {
        throw new Error("storage is disabled");
      },
      setItem: () => {
        throw new Error("storage is disabled");
      },
    };
    Object.defineProperty(window, "localStorage", { value: hostile, configurable: true });

    await userEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(paintedTheme()).toBe("dark");
  });
});
