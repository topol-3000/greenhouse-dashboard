/**
 * Pagination is the difference between "your greenhouses" and "some of your
 * greenhouses", so it is tested as behaviour rather than as an implementation
 * detail: how many pages are requested, with which windows, and whether the
 * result admits to being incomplete.
 */

import { describe, expect, it, vi } from "vitest";
import type { Page } from "./contract";
import { ParseError } from "./errors";
import { collectPages, MAX_PAGES, PAGE_LIMIT, parsePage } from "./pagination";
import type { PageWindow } from "./pagination";

function pageOf(items: readonly number[], total: number, offset: number): Page<number> {
  return { items, total, limit: PAGE_LIMIT, offset };
}

describe("parsePage", () => {
  it("decodes the contract's Page envelope", () => {
    const decoded = parsePage(
      { items: [1, 2], total: 2, limit: 200, offset: 0 },
      (item) => item as number,
      "test page",
    );
    expect(decoded).toEqual({ items: [1, 2], total: 2, limit: 200, offset: 0 });
  });

  it("rejects a body that is not the published envelope", () => {
    expect(() => parsePage({ results: [] }, (item) => item, "test page")).toThrow(ParseError);
    expect(() => parsePage([1, 2], (item) => item, "test page")).toThrow(ParseError);
    expect(() => parsePage({ items: [], total: "many" }, (item) => item, "test page")).toThrow(
      ParseError,
    );
  });
});

describe("collectPages", () => {
  it("reads a single complete page with one request", async () => {
    const load = vi.fn((window: PageWindow) =>
      Promise.resolve(pageOf([1, 2, 3], 3, window.offset)),
    );

    const collection = await collectPages(load);

    expect(collection).toEqual({ items: [1, 2, 3], total: 3, complete: true });
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith({ limit: PAGE_LIMIT, offset: 0 });
  });

  it("follows pages until it has as many items as the backend counted", async () => {
    const windows: PageWindow[] = [];
    const load = vi.fn((window: PageWindow) => {
      windows.push(window);
      const items = window.offset === 0 ? [1, 2] : [3];
      return Promise.resolve(pageOf(items, 3, window.offset));
    });

    const collection = await collectPages(load);

    expect(collection).toEqual({ items: [1, 2, 3], total: 3, complete: true });
    expect(windows).toEqual([
      { limit: PAGE_LIMIT, offset: 0 },
      { limit: PAGE_LIMIT, offset: 2 },
    ]);
  });

  it("reports an incomplete read rather than claiming a partial list is whole", async () => {
    // The backend counts more rows than it will hand over.
    const load = vi.fn((window: PageWindow) =>
      Promise.resolve(pageOf(window.offset === 0 ? [1, 2] : [], 9, window.offset)),
    );

    const collection = await collectPages(load);

    expect(collection).toEqual({ items: [1, 2], total: 9, complete: false });
    // The empty page ends the walk: no progress means no further requests.
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("stops at the page bound instead of looping without end", async () => {
    // A backend that always reports more than it has sent would otherwise be
    // requested for ever.
    const load = vi.fn((window: PageWindow) =>
      Promise.resolve(
        pageOf(
          Array.from({ length: PAGE_LIMIT }, (_, i) => i),
          1_000_000,
          window.offset,
        ),
      ),
    );

    const collection = await collectPages(load);

    expect(load).toHaveBeenCalledTimes(MAX_PAGES);
    expect(collection.complete).toBe(false);
    expect(collection.total).toBe(1_000_000);
    expect(collection.items).toHaveLength(MAX_PAGES * PAGE_LIMIT);
  });

  it("propagates a failure instead of returning a half-read collection", async () => {
    const load = vi.fn(() => Promise.reject(new Error("upstream failed")));
    await expect(collectPages(load)).rejects.toThrow("upstream failed");
  });
});
