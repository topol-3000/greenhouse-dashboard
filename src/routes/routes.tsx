/**
 * The portal's route table.
 *
 * Routes are described as data, not only as JSX, because four things must agree
 * about them: what the router renders, what the primary navigation offers, what
 * the shell puts in the page heading and the document title, and how the
 * breadcrumb trail is built. Adding a route means adding an entry here — with
 * `parentPath` for anything nested — and nothing else.
 *
 * Only routes that actually work belong in this table. There is no entry for a
 * feature that has not been built.
 *
 * Two routes carry parameters. Their `title` is the generic name of the
 * resource — "Facility", "Control zone" — and is what the shell shows while the
 * resource is still loading, so a nested page is structurally understandable
 * before its name arrives. Once the corresponding query answers, the shell
 * passes the resolved names in as labels and this same table produces the
 * heading, the document title and the trail with real names in them.
 */

import { cilHistory, cilLeaf, cilSpeedometer } from "@coreui/icons";
import type { ReactElement } from "react";
import { matchRoutes } from "react-router";
import { ActivityPage } from "../features/activity/ActivityPage";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { ControlZonePage } from "../features/topology/ControlZonePage";
import { FacilityPage } from "../features/topology/FacilityPage";
import { GreenhousesPage } from "../features/topology/GreenhousesPage";

/** The portal's landing route. */
export const HOME_PATH = "/";

/** The Sites and Facilities overview. */
export const GREENHOUSES_PATH = "/sites";

/** The read-only command activity of one control zone. */
export const ACTIVITY_PATH = "/activity";

/** One facility's read-only workspace. */
export const FACILITY_PATH = "/facilities/:facilityId";

/** One control zone's read-only workspace, inside its facility. */
export const CONTROL_ZONE_PATH = "/facilities/:facilityId/zones/:zoneId";

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
  /**
   * The icon the sidebar draws beside the label, as CoreUI publishes it.
   *
   * Decoration only, and only for a route the navigation offers: the label is
   * always present, so nothing here carries meaning on its own.
   */
  readonly navigationIcon?: string[];
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
    navigationIcon: cilSpeedometer,
  },
  {
    path: GREENHOUSES_PATH,
    title: "Greenhouses",
    description: "Your sites and the facilities inside them.",
    element: <GreenhousesPage />,
    inPrimaryNavigation: true,
    navigationIcon: cilLeaf,
    parentPath: HOME_PATH,
  },
  {
    path: ACTIVITY_PATH,
    title: "Activity",
    description: "The commands a control zone has been sent, and what became of them.",
    element: <ActivityPage />,
    inPrimaryNavigation: true,
    navigationIcon: cilHistory,
    parentPath: HOME_PATH,
  },
  {
    path: FACILITY_PATH,
    title: "Facility",
    description: "One facility and its control zones.",
    element: <FacilityPage />,
    inPrimaryNavigation: false,
    parentPath: GREENHOUSES_PATH,
  },
  {
    path: CONTROL_ZONE_PATH,
    title: "Control zone",
    description: "One control zone inside a facility.",
    element: <ControlZonePage />,
    inPrimaryNavigation: false,
    parentPath: FACILITY_PATH,
  },
];

/** The routes the primary navigation offers, in order. */
export const primaryNavigationRoutes: readonly PortalRoute[] = portalRoutes.filter(
  (route) => route.inPrimaryNavigation,
);

/** The parameters a matched route carries. */
export type RouteParams = Readonly<Partial<Record<string, string>>>;

/** Resolved display names, keyed by the route path pattern they belong to. */
export type RouteLabels = Readonly<Partial<Record<string, string>>>;

/** A matched route and the parameters it was matched with. */
export interface PortalRouteMatch {
  readonly route: PortalRoute;
  readonly params: RouteParams;
}

/**
 * Fill a route pattern's parameters to produce a real address.
 *
 * Identifiers are percent-encoded rather than interpolated raw: they come from
 * the cloud API and from the address bar, and neither is trusted to be free of
 * characters that would change the shape of the URL.
 *
 * @param pattern A route path pattern from this table.
 * @param params The parameters to substitute.
 * @returns The concrete address, or `null` when a parameter is missing.
 */
export function resolveRoutePath(pattern: string, params: RouteParams): string | null {
  const segments: string[] = [];
  for (const segment of pattern.split("/")) {
    if (!segment.startsWith(":")) {
      segments.push(segment);
      continue;
    }
    const value = params[segment.slice(1)];
    if (value === undefined) {
      return null;
    }
    segments.push(encodeURIComponent(value));
  }
  return segments.join("/");
}

/**
 * Attach a selection to an address.
 *
 * Only parameters with a value are written, so an address never claims a
 * selection that was not made, and `?` is omitted entirely when there is none.
 *
 * @param path The address to carry the selection.
 * @param selection The search parameters to write, by name.
 * @returns The address, with a query string only if there is one to write.
 */
function withSearch(path: string, selection: Readonly<Record<string, string | undefined>>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(selection)) {
    const trimmed = value?.trim();
    if (trimmed !== undefined && trimmed !== "") {
      search.set(key, trimmed);
    }
  }
  const suffix = search.toString();
  return suffix === "" ? path : `${path}?${suffix}`;
}

/** The address of one facility's workspace. */
export function facilityPath(facilityId: string): string {
  return `/facilities/${encodeURIComponent(facilityId)}`;
}

/**
 * The address of one control zone's workspace inside a facility.
 *
 * The optional selection is what lets a reading shown outside the zone — on the
 * facility workspace, on the landing page — link to that same point's history
 * inside it, rather than to the top of a workspace the customer then has to
 * search.
 *
 * @param facilityId The facility the zone belongs to.
 * @param zoneId The control zone.
 * @param selection The workspace search parameters to carry, by name.
 * @returns The control zone address.
 */
export function controlZonePath(
  facilityId: string,
  zoneId: string,
  selection: Readonly<Record<string, string | undefined>> = {},
): string {
  return withSearch(`${facilityPath(facilityId)}/zones/${encodeURIComponent(zoneId)}`, selection);
}

/**
 * The address of the Activity route, carrying a selection.
 *
 * @param selection The Activity search parameters to carry, by name.
 * @returns The Activity address.
 */
export function activityPath(selection: Readonly<Record<string, string | undefined>> = {}): string {
  return withSearch(ACTIVITY_PATH, selection);
}

/**
 * Find the route a pathname resolves to, with its parameters.
 *
 * The router's own matcher is used rather than a hand-rolled comparison, so
 * this cannot disagree with what is actually rendered.
 *
 * @param pathname The current location's pathname.
 * @returns The match, or `null` for an unknown address.
 */
export function matchPortalLocation(pathname: string): PortalRouteMatch | null {
  const matches = matchRoutes(
    portalRoutes.map((route, index) => ({ path: route.path, id: String(index) })),
    pathname,
  );
  const matched = matches?.at(-1);
  if (matched === undefined) {
    return null;
  }
  const route = portalRoutes[Number(matched.route.id)];
  if (route === undefined) {
    return null;
  }
  return { route, params: matched.params };
}

/**
 * Find the route a pathname resolves to.
 *
 * @param pathname The current location's pathname.
 * @returns The matched route, or `null` for an unknown address.
 */
export function matchPortalRoute(pathname: string): PortalRoute | null {
  return matchPortalLocation(pathname)?.route ?? null;
}

/**
 * The label a route carries, preferring a resolved resource name.
 *
 * @param route The route.
 * @param labels Resolved names, keyed by route path pattern.
 * @returns The label to show.
 */
function labelFor(route: PortalRoute, labels: RouteLabels): string {
  const resolved = labels[route.path]?.trim();
  return resolved !== undefined && resolved !== "" ? resolved : route.title;
}

/**
 * The heading a pathname should carry.
 *
 * @param pathname The current location's pathname.
 * @param labels Resolved resource names, keyed by route path pattern.
 * @returns The page heading.
 */
export function pageTitleFor(pathname: string, labels: RouteLabels = {}): string {
  const route = matchPortalRoute(pathname);
  return route === null ? NOT_FOUND_TITLE : labelFor(route, labels);
}

/**
 * The document title a pathname should carry.
 *
 * @param pathname The current location's pathname.
 * @param labels Resolved resource names, keyed by route path pattern.
 * @returns The document title.
 */
export function documentTitleFor(pathname: string, labels: RouteLabels = {}): string {
  return `${pageTitleFor(pathname, labels)} · ${PORTAL_NAME}`;
}

/** One step of the breadcrumb trail. `to` is absent on the current page. */
export interface Breadcrumb {
  readonly label: string;
  readonly to?: string;
}

/**
 * Build the breadcrumb trail for a pathname.
 *
 * The trail is walked from the matched route up through `parentPath`, and a
 * parent that carries parameters is resolved with the parameters the current
 * address was matched with — which is what makes `Greenhouses › Facility ›
 * Control zone` a working trail rather than a list of dead patterns.
 *
 * An unknown address is shown as a leaf under the landing route, which is what
 * gives the user a way back.
 *
 * @param pathname The current location's pathname.
 * @param labels Resolved resource names, keyed by route path pattern.
 * @returns The trail, outermost first, ending with the current page.
 */
export function buildBreadcrumbs(
  pathname: string,
  labels: RouteLabels = {},
): readonly Breadcrumb[] {
  const matched = matchPortalLocation(pathname);
  const home = portalRoutes.find((route) => route.path === HOME_PATH);

  if (matched === null) {
    const trail: Breadcrumb[] = [];
    if (home !== undefined) {
      trail.push({ label: home.title, to: home.path });
    }
    trail.push({ label: NOT_FOUND_TITLE });
    return trail;
  }

  const trail: Breadcrumb[] = [{ label: labelFor(matched.route, labels) }];
  let parentPath = matched.route.parentPath;
  while (parentPath !== undefined) {
    const parent: PortalRoute | undefined = portalRoutes.find((route) => route.path === parentPath);
    if (parent === undefined) {
      break;
    }
    const to = resolveRoutePath(parent.path, matched.params);
    const label = labelFor(parent, labels);
    trail.unshift(to === null ? { label } : { label, to });
    parentPath = parent.parentPath;
  }
  return trail;
}
