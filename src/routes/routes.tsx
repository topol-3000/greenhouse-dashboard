/**
 * The portal's route table.
 *
 * Routes are described as data, not only as JSX, because three things must
 * agree about them: what the router renders, what the primary navigation
 * offers, and what the shell puts in the page heading, the breadcrumbs and the
 * document title. Adding a Facility, ControlZone or Activity route later means
 * adding an entry here — with `parentPath` for anything nested — and nothing
 * else.
 *
 * Only routes that actually work belong in this table. There is no entry for a
 * feature that has not been built.
 */

import type { ReactElement } from "react";
import { matchRoutes } from "react-router";
import { DashboardPage } from "../features/dashboard/DashboardPage";

/** The portal's landing route. */
export const HOME_PATH = "/";

/** Heading used for any address the route table does not match. */
export const NOT_FOUND_TITLE = "Page not found";

/** The product name, used in the shell and in the document title. */
export const PORTAL_NAME = "AI Greenhouse Customer Portal";

export interface PortalRoute {
  /** Router path pattern. */
  readonly path: string;
  /** Page heading, navigation label, breadcrumb label and document title. */
  readonly title: string;
  /** One sentence describing the route, used as the navigation description. */
  readonly description: string;
  readonly element: ReactElement;
  /** Whether the primary navigation offers this route. */
  readonly inPrimaryNavigation: boolean;
  /** The route this one sits under, for breadcrumbs. */
  readonly parentPath?: string;
}

export const portalRoutes: readonly PortalRoute[] = [
  {
    path: HOME_PATH,
    title: "Dashboard",
    description: "Portal overview and cloud API availability.",
    element: <DashboardPage />,
    inPrimaryNavigation: true,
  },
];

/** The routes the primary navigation offers, in order. */
export const primaryNavigationRoutes: readonly PortalRoute[] = portalRoutes.filter(
  (route) => route.inPrimaryNavigation,
);

/**
 * Find the route a pathname resolves to.
 *
 * The router's own matcher is used rather than a hand-rolled comparison, so
 * this cannot disagree with what is actually rendered once routes carry
 * parameters.
 *
 * @param pathname The current location's pathname.
 * @returns The matched route, or `null` for an unknown address.
 */
export function matchPortalRoute(pathname: string): PortalRoute | null {
  const matches = matchRoutes(
    portalRoutes.map((route, index) => ({ path: route.path, id: String(index) })),
    pathname,
  );
  const matched = matches?.at(-1);
  if (matched === undefined) {
    return null;
  }
  return portalRoutes[Number(matched.route.id)] ?? null;
}

/** The heading a pathname should carry. */
export function pageTitleFor(pathname: string): string {
  return matchPortalRoute(pathname)?.title ?? NOT_FOUND_TITLE;
}

/** The document title a pathname should carry. */
export function documentTitleFor(pathname: string): string {
  return `${pageTitleFor(pathname)} · ${PORTAL_NAME}`;
}

/** One step of the breadcrumb trail. `to` is absent on the current page. */
export interface Breadcrumb {
  readonly label: string;
  readonly to?: string;
}

/**
 * Build the breadcrumb trail for a pathname.
 *
 * The trail is walked from the matched route up through `parentPath`, so a
 * nested route added later is described without touching this function. An
 * unknown address is shown as a leaf under the landing route, which is what
 * gives the user a way back.
 *
 * @param pathname The current location's pathname.
 * @returns The trail, outermost first, ending with the current page.
 */
export function buildBreadcrumbs(pathname: string): readonly Breadcrumb[] {
  const matched = matchPortalRoute(pathname);
  const home = portalRoutes.find((route) => route.path === HOME_PATH);

  if (matched === null) {
    const trail: Breadcrumb[] = [];
    if (home !== undefined) {
      trail.push({ label: home.title, to: home.path });
    }
    trail.push({ label: NOT_FOUND_TITLE });
    return trail;
  }

  const trail: Breadcrumb[] = [{ label: matched.title }];
  let parentPath = matched.parentPath;
  while (parentPath !== undefined) {
    const parent: PortalRoute | undefined = portalRoutes.find((route) => route.path === parentPath);
    if (parent === undefined) {
      break;
    }
    trail.unshift({ label: parent.title, to: parent.path });
    parentPath = parent.parentPath;
  }
  return trail;
}
