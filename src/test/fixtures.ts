/**
 * Contract-valid topology for the test suite.
 *
 * Every object here is shaped by a schema in `openapi.json` —  `SiteRead`,
 * `FacilityRead`, `ControlZoneRead`, `ZonePointAssignmentRead` — and every
 * collection is wrapped in the `Page` envelope the collection endpoints
 * publish, with a real `total`, `limit` and `offset`.
 *
 * This file is test support and nothing else. It is not imported by any
 * production module, there is no demo mode behind it, and the portal has no
 * path that falls back to it: a request that is not answered by the backend is
 * an error state on screen, never one of these objects.
 *
 * The default dataset is deliberately awkward on purpose. It has two sites, one
 * of which has no facilities; a facility with two control zones and a facility
 * with none; and a control zone belonging to a facility other than the one a
 * misleading URL might name. A portal that quietly assumes "one greenhouse"
 * fails against it.
 */

import type {
  ControlZoneRead,
  FacilityRead,
  Page,
  SiteRead,
  ZonePointAssignmentRead,
} from "../api/contract";
import type { Router } from "./harness";

/** The URL the portal builds for the backend's health endpoint. */
export const HEALTH_URL = "/health";

/** A healthy answer from the backend's published `HealthResponse`. */
export const HEALTHY_BODY = { status: "ok", service: "greenhouse", database: "ok" } as const;

/** Identifiers are UUIDs in the contract, so the fixtures use real ones. */
export const IDS = {
  riversideSite: "6f1c9f3a-6b1e-4f27-9b6d-5f2b1c9d0001",
  harbourSite: "6f1c9f3a-6b1e-4f27-9b6d-5f2b1c9d0002",
  northGreenhouse: "8a2d0e4b-7c2f-4a38-8c7e-6a3c2d0e0001",
  seedlingRoom: "8a2d0e4b-7c2f-4a38-8c7e-6a3c2d0e0002",
  climateZone: "9b3e1f5c-8d30-4b49-9d8f-7b4d3e1f0001",
  irrigationZone: "9b3e1f5c-8d30-4b49-9d8f-7b4d3e1f0002",
  seedlingClimateZone: "9b3e1f5c-8d30-4b49-9d8f-7b4d3e1f0003",
  unknownFacility: "00000000-0000-4000-8000-000000000404",
  unknownZone: "00000000-0000-4000-8000-000000000405",
} as const;

const T0 = "2026-01-04T09:00:00Z";

export const riversideSite: SiteRead = {
  id: IDS.riversideSite,
  name: "Riverside Growing Site",
  code: "riverside",
  timezone: "Europe/Kyiv",
  status: "active",
  created_at: T0,
  updated_at: T0,
};

export const harbourSite: SiteRead = {
  id: IDS.harbourSite,
  name: "Harbour Research Site",
  code: "harbour",
  timezone: "Europe/Amsterdam",
  status: "active",
  created_at: T0,
  updated_at: T0,
};

export const northGreenhouse: FacilityRead = {
  id: IDS.northGreenhouse,
  site_id: IDS.riversideSite,
  name: "North Greenhouse",
  code: "north-gh",
  facility_type: "greenhouse",
  status: "active",
  created_at: T0,
  updated_at: T0,
};

export const seedlingRoom: FacilityRead = {
  id: IDS.seedlingRoom,
  site_id: IDS.riversideSite,
  name: "Seedling Room",
  code: "seedling-1",
  facility_type: "seedling_room",
  status: "active",
  created_at: T0,
  updated_at: T0,
};

export const climateZone: ControlZoneRead = {
  id: IDS.climateZone,
  facility_id: IDS.northGreenhouse,
  name: "North Climate",
  code: "north-climate",
  zone_type: "climate",
  status: "active",
  created_at: T0,
  updated_at: T0,
};

export const irrigationZone: ControlZoneRead = {
  id: IDS.irrigationZone,
  facility_id: IDS.northGreenhouse,
  name: "North Irrigation",
  code: "north-irrigation",
  zone_type: "irrigation",
  status: "active",
  created_at: T0,
  updated_at: T0,
};

/** A zone of the Seedling Room, used to prove it cannot be shown elsewhere. */
export const seedlingClimateZone: ControlZoneRead = {
  id: IDS.seedlingClimateZone,
  facility_id: IDS.seedlingRoom,
  name: "Seedling Climate",
  code: "seedling-climate",
  zone_type: "climate",
  status: "active",
  created_at: T0,
  updated_at: T0,
};

export const climateZonePoints: readonly ZonePointAssignmentRead[] = [
  {
    id: "aa000000-0000-4000-8000-000000000001",
    control_zone_id: IDS.climateZone,
    point_id: "bb000000-0000-4000-8000-000000000001",
    role: "primary_measurement",
    created_at: T0,
    point_code: "north-air-temp",
    point_name: "North air temperature",
    point_kind: "measurement",
    data_type: "float",
    unit: "degC",
  },
  {
    id: "aa000000-0000-4000-8000-000000000002",
    control_zone_id: IDS.climateZone,
    point_id: "bb000000-0000-4000-8000-000000000002",
    role: "control_output",
    created_at: T0,
    point_code: "north-vent",
    point_name: "North vent",
    point_kind: "control",
    data_type: "boolean",
    unit: null,
  },
];

/** Wrap items in the contract's `Page` envelope for a single complete page. */
export function page<T>(items: readonly T[], limit = 200, offset = 0): Page<T> {
  return { items, total: items.length, limit, offset };
}

/** A topology the fake backend will serve. */
export interface Dataset {
  readonly sites: readonly SiteRead[];
  readonly facilities: readonly FacilityRead[];
  readonly zones: readonly ControlZoneRead[];
  readonly points: readonly ZonePointAssignmentRead[];
}

/** Two sites, two facilities, three zones — and one site with nothing in it. */
export const DEFAULT_DATASET: Dataset = {
  sites: [riversideSite, harbourSite],
  facilities: [northGreenhouse, seedlingRoom],
  zones: [climateZone, irrigationZone, seedlingClimateZone],
  points: climateZonePoints,
};

/** A cloud API that has nothing provisioned at all. */
export const EMPTY_DATASET: Dataset = { sites: [], facilities: [], zones: [], points: [] };

const V1 = "/api/v1";

/** The URL the portal builds for one page of the site collection. */
export function sitesUrl(offset = 0): string {
  return `${V1}/sites?limit=200&offset=${String(offset)}`;
}

/** The URL the portal builds for one page of the facility collection. */
export function facilitiesUrl(offset = 0): string {
  return `${V1}/facilities?limit=200&offset=${String(offset)}`;
}

/** The URL the portal builds to resolve one site. */
export function siteUrl(id: string): string {
  return `${V1}/sites/${encodeURIComponent(id)}`;
}

/** The URL the portal builds to resolve one facility. */
export function facilityUrl(id: string): string {
  return `${V1}/facilities/${encodeURIComponent(id)}`;
}

/** The URL the portal builds for one facility's zones, filtered server-side. */
export function facilityZonesUrl(facilityId: string, offset = 0): string {
  return `${V1}/control-zones?limit=200&offset=${String(offset)}&facility_id=${encodeURIComponent(facilityId)}`;
}

/** The URL the portal builds to resolve one control zone. */
export function controlZoneUrl(id: string): string {
  return `${V1}/control-zones/${encodeURIComponent(id)}`;
}

/** The URL the portal builds for one zone's point composition. */
export function controlZonePointsUrl(id: string, offset = 0): string {
  return `${V1}/control-zones/${encodeURIComponent(id)}/points?limit=200&offset=${String(offset)}`;
}

/**
 * Build a routing table that answers every request the dataset supports.
 *
 * Anything the dataset does not contain is deliberately left unrouted, so a
 * test that expects a resource to be missing must say so explicitly through
 * {@link extra} rather than getting a silent empty answer.
 *
 * @param dataset The topology to serve.
 * @param extra Routes merged on top, for failures and missing resources.
 * @returns A routing table for the fetch stub.
 */
export function backendRoutes(dataset: Dataset = DEFAULT_DATASET, extra: Router = {}): Router {
  const routes: Router = {
    [HEALTH_URL]: { body: HEALTHY_BODY },
    [sitesUrl()]: { body: page(dataset.sites) },
    [facilitiesUrl()]: { body: page(dataset.facilities) },
  };

  for (const site of dataset.sites) {
    routes[siteUrl(site.id)] = { body: site };
  }
  for (const facility of dataset.facilities) {
    routes[facilityUrl(facility.id)] = { body: facility };
    routes[facilityZonesUrl(facility.id)] = {
      body: page(dataset.zones.filter((zone) => zone.facility_id === facility.id)),
    };
  }
  for (const zone of dataset.zones) {
    routes[controlZoneUrl(zone.id)] = { body: zone };
    routes[controlZonePointsUrl(zone.id)] = {
      body: page(dataset.points.filter((point) => point.control_zone_id === zone.id)),
    };
  }

  return { ...routes, ...extra };
}

/** The body the backend returns for a request it validated and rejected. */
export const NOT_FOUND_BODY = { error: { code: "not_found", message: "Not found" } };
