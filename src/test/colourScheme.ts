/**
 * A controllable `prefers-color-scheme` for component tests.
 *
 * jsdom implements no `matchMedia` at all, so the shell's `auto` appearance has
 * nothing to read. This installs one that answers a fixed preference and can be
 * switched mid-test, which is what proves `auto` follows a system change.
 *
 * It is installed through `vi.stubGlobal`, so the suite-wide `unstubAllGlobals`
 * removes it again and no test leaks a colour scheme into the next.
 */

import { vi } from "vitest";

/** The knob a test uses to change the system's colour scheme. */
export interface ColourSchemeControl {
  /** Switch the system preference and notify every subscriber. */
  setPrefersDark: (prefersDark: boolean) => void;
}

/**
 * Install a `matchMedia` that answers `prefers-color-scheme`.
 *
 * @param initialPrefersDark What the system asks for to start with.
 * @returns A handle for changing it.
 */
export function installColourScheme(initialPrefersDark = false): ColourSchemeControl {
  let prefersDark = initialPrefersDark;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();

  const matchMedia = (query: string): MediaQueryList => {
    const isDarkQuery = query.includes("prefers-color-scheme: dark");
    const list = {
      media: query,
      get matches() {
        return isDarkQuery && prefersDark;
      },
      onchange: null,
      addEventListener: (type: string, listener: (event: MediaQueryListEvent) => void) => {
        if (type === "change" && isDarkQuery) {
          listeners.add(listener);
        }
      },
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.delete(listener);
      },
      // Deprecated aliases, present so anything calling them does not throw.
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => true,
    };
    return list as unknown as MediaQueryList;
  };

  vi.stubGlobal("matchMedia", matchMedia);

  return {
    setPrefersDark: (next: boolean) => {
      prefersDark = next;
      const event = { matches: next, media: "(prefers-color-scheme: dark)" };
      for (const listener of listeners) {
        listener(event as MediaQueryListEvent);
      }
    },
  };
}
