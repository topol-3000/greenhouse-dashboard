/**
 * A real, in-memory `localStorage` for component tests.
 *
 * The test environment publishes no working `window.localStorage`, so the
 * shell's appearance preference has nowhere to be written or read back. This
 * installs one per test through `vi.stubGlobal`, which means the suite-wide
 * `unstubAllGlobals` takes it away again and no test inherits another's stored
 * preference.
 */

import { vi } from "vitest";

/**
 * Install an in-memory `localStorage`.
 *
 * @param initial Entries the store should start with.
 * @returns The store, for a test that wants to read what was written.
 */
export function installLocalStorage(initial: Readonly<Record<string, string>> = {}): Storage {
  const entries = new Map<string, string>(Object.entries(initial));

  const storage: Storage = {
    get length() {
      return entries.size;
    },
    clear: () => {
      entries.clear();
    },
    getItem: (key) => entries.get(key) ?? null,
    key: (index) => [...entries.keys()][index] ?? null,
    removeItem: (key) => {
      entries.delete(key);
    },
    setItem: (key, value) => {
      entries.set(key, value);
    },
  };

  vi.stubGlobal("localStorage", storage);
  return storage;
}
