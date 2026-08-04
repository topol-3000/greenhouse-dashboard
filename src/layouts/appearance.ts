/**
 * The portal's appearance preference.
 *
 * Three choices and no more: `light`, `dark` and `auto`. It is local UI state —
 * a browser preference belonging to this device, not a customer setting the
 * cloud API knows or should know about. Nothing here talks to the backend.
 *
 * The resolved theme is published as `data-coreui-theme` on the document
 * element, which is the attribute CoreUI's stylesheet reads and which the
 * portal's own token layer reads too, so one switch repaints both.
 *
 * `index.html` carries a very small copy of the read-and-resolve logic that
 * runs before the first paint. That duplication is deliberate: a React effect
 * cannot run early enough to prevent a flash of the wrong theme, and the
 * constants below are the contract the two copies share.
 */

/** The appearance choices the portal offers, in the order it offers them. */
export const APPEARANCES = ["light", "dark", "auto"] as const;

/** A stored or selected appearance preference. */
export type Appearance = (typeof APPEARANCES)[number];

/** The two themes a preference can actually resolve to. */
export type ResolvedAppearance = "light" | "dark";

/** Where the preference is kept. Shared with the pre-paint script. */
export const APPEARANCE_STORAGE_KEY = "greenhouse-portal-appearance";

/** What an absent or unrecognised stored value falls back to. */
export const DEFAULT_APPEARANCE: Appearance = "auto";

/** The media query `auto` follows. */
export const DARK_SCHEME_QUERY = "(prefers-color-scheme: dark)";

/** The attribute CoreUI and the portal's token layer both read. */
export const THEME_ATTRIBUTE = "data-coreui-theme";

/**
 * Whether a value is one of the three appearances.
 *
 * @param value The candidate, typically read back from storage.
 * @returns Whether the portal recognises it.
 */
export function isAppearance(value: unknown): value is Appearance {
  return typeof value === "string" && (APPEARANCES as readonly string[]).includes(value);
}

/**
 * Read the stored preference.
 *
 * Anything the portal does not recognise — a missing entry, a stale value, a
 * hand-edited one, or storage that throws because the browser has disabled it —
 * is `auto`. An invalid preference is never a broken portal.
 *
 * @returns The stored appearance, or `auto`.
 */
export function readStoredAppearance(): Appearance {
  let stored: string | null;
  try {
    stored = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
  } catch {
    // Storage can be unavailable or blocked. The default still applies.
    return DEFAULT_APPEARANCE;
  }
  return isAppearance(stored) ? stored : DEFAULT_APPEARANCE;
}

/**
 * Persist the selected preference on this device.
 *
 * A browser that refuses to store it is not an error the customer can act on,
 * so the choice still applies for this session and nothing is reported.
 *
 * @param appearance The appearance the customer selected.
 */
export function storeAppearance(appearance: Appearance): void {
  try {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, appearance);
  } catch {
    // Storage can be unavailable or blocked; the selection still applies.
  }
}

/**
 * Resolve a preference to the theme that should actually be painted.
 *
 * @param appearance The selected preference.
 * @param systemPrefersDark What `prefers-color-scheme` currently reports.
 * @returns The theme to paint.
 */
export function resolveAppearance(
  appearance: Appearance,
  systemPrefersDark: boolean,
): ResolvedAppearance {
  if (appearance === "auto") {
    return systemPrefersDark ? "dark" : "light";
  }
  return appearance;
}

/**
 * Publish the resolved theme on the document element.
 *
 * @param resolved The theme to paint.
 */
export function applyResolvedAppearance(resolved: ResolvedAppearance): void {
  document.documentElement.setAttribute(THEME_ATTRIBUTE, resolved);
}
