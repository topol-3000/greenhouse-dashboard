import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";
import { installColourScheme } from "./colourScheme";
import { installLocalStorage } from "./localStorage";
import { THEME_ATTRIBUTE } from "../layouts/appearance";

// The environment publishes neither `matchMedia` nor a working `localStorage`,
// and the shell's appearance preference reads both. Every test starts with a
// light system preference and an empty store; a test about appearance installs
// its own on top.
beforeEach(() => {
  installColourScheme(false);
  installLocalStorage();
});

// Every suite installs its own `fetch`; removing it between tests keeps one
// test's routing table from leaking into the next one's assertions. The same
// call takes away the stubbed storage and colour scheme, and the theme the
// shell painted on the document is removed with them.
afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute(THEME_ATTRIBUTE);
});
