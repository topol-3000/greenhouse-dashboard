/**
 * The shell's appearance state.
 *
 * The selected preference lives here; the system's own colour scheme is read
 * from `matchMedia` as an external store, so `auto` follows a system change
 * while it is selected without the customer touching anything.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { Appearance, ResolvedAppearance } from "./appearance";
import {
  applyResolvedAppearance,
  DARK_SCHEME_QUERY,
  readStoredAppearance,
  resolveAppearance,
  storeAppearance,
} from "./appearance";

/** Subscribe to the system's colour scheme changing under us. */
function subscribeToColourScheme(onChange: () => void): () => void {
  const query = window.matchMedia(DARK_SCHEME_QUERY);
  query.addEventListener("change", onChange);
  return () => {
    query.removeEventListener("change", onChange);
  };
}

/** What the system currently asks for. */
function readColourScheme(): boolean {
  return window.matchMedia(DARK_SCHEME_QUERY).matches;
}

export interface AppearanceControl {
  /** What the customer selected: `light`, `dark` or `auto`. */
  readonly appearance: Appearance;
  /** What that currently paints as. */
  readonly resolved: ResolvedAppearance;
  /** Select a preference and remember it on this device. */
  readonly select: (next: Appearance) => void;
}

/**
 * The appearance preference, resolved and applied to the document.
 *
 * @returns The selection, the theme it resolves to, and the way to change it.
 */
export function useAppearance(): AppearanceControl {
  const [appearance, setAppearance] = useState<Appearance>(readStoredAppearance);
  const systemPrefersDark = useSyncExternalStore(
    subscribeToColourScheme,
    readColourScheme,
    () => false,
  );
  const resolved = resolveAppearance(appearance, systemPrefersDark);

  useEffect(() => {
    applyResolvedAppearance(resolved);
  }, [resolved]);

  const select = useCallback((next: Appearance) => {
    setAppearance(next);
    storeAppearance(next);
  }, []);

  return { appearance, resolved, select };
}
