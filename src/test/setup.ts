import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";

// Every suite installs its own `fetch`; removing it between tests keeps one
// test's routing table from leaking into the next one's assertions.
afterEach(() => {
  vi.unstubAllGlobals();
});
