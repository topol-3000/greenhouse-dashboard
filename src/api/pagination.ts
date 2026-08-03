/**
 * Paginated collections, read to completeness or reported as incomplete.
 *
 * Every collection endpoint in the contract answers `Page[T]` — `items`,
 * `total`, `limit`, `offset` — with `limit` capped at 200. A client that reads
 * one page and calls it "the topology" would silently under-report a customer's
 * greenhouses, so the portal walks the pages instead.
 *
 * The walk is bounded twice over: it stops when it has as many items as the
 * backend's own `total`, and it stops after {@link MAX_PAGES} pages whatever
 * happens. A page that returns nothing also ends the walk, so a backend that
 * stops making progress cannot turn into a request loop. When the walk ends
 * before `total` is reached the result says so, and the screens that render it
 * say so too rather than presenting a partial list as the whole.
 */

import type { Page } from "./contract";
import { MAX_PAGE_LIMIT } from "./contract";
import { asRecord, requireArray, requireNumber } from "./decode";

/** Page size requested, which is the largest the contract allows. */
export const PAGE_LIMIT = MAX_PAGE_LIMIT;

/** Hard stop on pages per collection: 10 × 200 items. */
export const MAX_PAGES = 10;

/** The window of a collection to request. */
export interface PageWindow {
  readonly limit: number;
  readonly offset: number;
}

/** Everything the portal managed to read from one collection. */
export interface Collection<T> {
  readonly items: readonly T[];
  /** The backend's own count of matching rows, from `Page.total`. */
  readonly total: number;
  /** Whether {@link items} is the whole collection the backend counted. */
  readonly complete: boolean;
}

/**
 * Decode one `Page[T]` envelope.
 *
 * @param body The decoded response body.
 * @param parseItem Decoder for one item.
 * @param context What was being read, for the error message.
 * @returns The page.
 * @throws {ParseError} When the envelope does not match the contract.
 */
export function parsePage<T>(
  body: unknown,
  parseItem: (item: unknown) => T,
  context: string,
): Page<T> {
  const record = asRecord(body, context);
  return {
    items: requireArray(record, "items", context).map(parseItem),
    total: requireNumber(record, "total", context),
    limit: requireNumber(record, "limit", context),
    offset: requireNumber(record, "offset", context),
  };
}

/**
 * Read a collection page by page until it is complete or the bound is reached.
 *
 * @param load Request one window of the collection.
 * @returns The items read, the backend's total, and whether they agree.
 */
export async function collectPages<T>(
  load: (window: PageWindow) => Promise<Page<T>>,
): Promise<Collection<T>> {
  const items: T[] = [];
  let total = 0;
  let offset = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const received = await load({ limit: PAGE_LIMIT, offset });
    total = received.total;
    items.push(...received.items);

    // No progress ends the walk: without this, a backend answering an empty
    // page while reporting a larger total would be requested MAX_PAGES times
    // for nothing, and a buggy one could be requested forever.
    if (received.items.length === 0) {
      break;
    }
    offset += received.items.length;
    if (items.length >= total) {
      break;
    }
  }

  return { items, total, complete: items.length >= total };
}
