# greenhouse-dashboard context

Short, stable context for anyone — human or agent — changing this repository.

## What this is

The **AI Greenhouse Customer Portal**: the customer-facing web application for
monitoring and manually operating one or more greenhouse facilities. It is a
separate repository from `greenhouse` and ships as its own container.

Dashboard is a feature of the portal, owning the `/` route. It is not the
product, and the application is not a standalone monitoring dashboard.

## Current state

The portal foundation, read-only topology, and read-only monitoring inside a
control zone. Delivered:

- product identity, page and document titles;
- a real client-side routing layer with an extensible route table, including
  parameterised Facility and ControlZone routes whose headings, document titles
  and breadcrumbs resolve to real resource names;
- the portal shell — brand, primary navigation, breadcrumbs, location-aware page
  heading, global notification region, accessible mobile navigation, responsive
  layout, focus handling;
- a centralised API boundary with one configurable base URL, generated contract
  types, bounded pagination and normalised errors;
- cloud API availability from the backend's `/health`;
- read-only Site → Facility → ControlZone loading and navigation, a facility
  switcher, and a zone's point inventory;
- the Dashboard route as a truthful landing page, carrying the API's own site
  and facility counts;
- a monitoring section inside the ControlZone workspace: the zone's measurement
  points with their last known value, unit, quality and observation time, and a
  bounded telemetry window for the selected point, charted only when the
  contract and the data are both numeric;
- reusable loading, refresh, empty, error, resource-not-found, relationship-
  mismatch and notification states.

Not delivered, and not to be implied by any screen: topology or point creation,
editing and deletion; actuator reported or desired state; actuator control;
manual commands and command polling; activity history; alerts; thresholds and
"normal/warning/critical" verdicts; agronomic recommendations; target ranges;
recipes; grow cycles; runtime targets; automation and schedules;
control-loop visualisation; authentication, users, roles, tenants, billing and
settings; WebSocket or server-sent events.

## Stack

React 19 + TypeScript (strict) + Vite. React Router owns client-side routing.
TanStack Query v5 owns server state and polling. Vitest and Testing Library cover
units and components; Playwright covers the browser. Nginx serves the built
assets, reverse-proxies the backend surface and owns the SPA fallback.

## Integration boundary

The portal is an ordinary HTTP client of the `greenhouse` public API. The
checked-in `openapi.json` is the contract, and `src/api/schema.ts` is generated
from it by `npm run generate:api-types`. The endpoints in use:

| Purpose                      | Endpoint                                             |
| ---------------------------- | ---------------------------------------------------- |
| Cloud API availability       | `GET /health`                                        |
| Sites                        | `GET /api/v1/sites`, `…/{site_id}`                   |
| Facilities                   | `GET /api/v1/facilities`, `…/{facility_id}`          |
| Control zones                | `GET /api/v1/control-zones`, `…/{zone_id}`           |
| A zone's point composition   | `GET /api/v1/control-zones/{zone_id}/points`         |
| Measurements and their state | `GET /api/v1/facilities/{facility_id}/configuration` |
| One point's telemetry window | `GET /api/v1/points/{point_id}/telemetry?limit=200`  |

Rules that follow from that:

- parentage is `FacilityRead.site_id` and `ControlZoneRead.facility_id`, and
  nothing else. `ControlZoneRead` publishes no `site_id`, so the site is read
  from the zone's facility. A relationship the contract does not state is not
  drawn;
- every collection is the `Page` envelope with `limit` capped at 200. Pages are
  walked to a hard bound, and an incomplete read is reported as incomplete;
- a displayed count is the backend's own `Page.total`, never a local sum of
  whatever pages arrived;
- `404`, and `422` for an identifier the contract's UUID format rejects, are
  resource-level states on one screen, not a global outage;
- monitoring reads the facility configuration document because it is the one
  operation that answers zone membership, point metadata (`point_kind`,
  `data_type`, `unit`, `status`) and current state together. The alternative
  costs a `GET /points/{id}/state` per measurement point per poll and still does
  not publish the point's `status`. `include_archived` is not sent, so the
  contract's default applies;
- `ConfigurationPointState` has no `received_at` and no `revision`. They live on
  `PointStateRead`, which is not requested; telemetry samples carry both
  timestamps, and that is where `received_at` is shown;
- a point is a measurement when `point_kind` is `measurement` and `status` is
  `active`. Never by name, code or `metric_type`. Control and status points stay
  in the zone's composition and get no card, no reading and no chart;
- `TelemetryHistoryRead` is `items` alone — no total, no cursor — and the
  operation documents no ordering and no selection rule for `limit`. So the
  portal sorts by `observed_at` itself, asks for a fixed 200-sample window, and
  never claims a history is complete or is "the latest N";
- `value` is untyped in the contract. It crosses the boundary as `unknown` and
  is narrowed where it is displayed. `0` and `false` are readings; `null` with
  `quality: "no_data"` is not. Only a finite number at a readable instant is
  plotted, and nothing is ever coerced into one;
- `DataQuality` is the backend's own statement about a value, `stale` included.
  The portal shows it verbatim and defines no freshness threshold of its own.
- `/health` is unversioned in the backend and is a sibling of `/api/v1`, so both
  are derived from one configured base URL and cannot drift apart.
- The default base URL is empty, meaning same origin. The backend host lives in
  the proxy's `GREENHOUSE_API_UPSTREAM`, not in the bundle.
- `/health` answers `503` with a full health document. That body is read, not
  discarded: a reachable backend reporting a problem is `Degraded`, which is not
  the same as unreachable.
- Response fields are consumed as published. Unknown additive fields are ignored
  rather than rejected. The client invents no field and no aggregate contract.
- No portal-specific backend endpoint exists or may be requested. If a screen
  seems to need one, that is a backend conversation, not a client workaround.

## Availability model

| State         | Meaning                                                       |
| ------------- | ------------------------------------------------------------- |
| `Checking`    | No answer yet. Never reported as unavailable.                 |
| `Available`   | `status: ok` and `database: ok`.                              |
| `Degraded`    | The backend answered but reported a problem.                  |
| `Unavailable` | The request failed, or the portal's configuration is invalid. |

Availability is polled every 30s and can be rechecked on demand. A change — and
only a change — is announced in the global notification region.

## Failure model

- **The API is unavailable** — the shell stays fully usable and says so. There is
  no blank error screen.
- **The configuration is invalid** — the portal reports a misconfiguration in
  place of the availability state rather than failing silently.
- **A malformed response** — a controlled error state, never a blank screen.
- **Monitoring degrades at the smallest scope.** A monitoring failure leaves the
  zone's topology, breadcrumbs and navigation working; a history failure leaves
  the current values; a failed refresh of either leaves the last good answer on
  screen with a note that it may be out of date. Polling is a TanStack Query
  interval — 30s for current state, 60s for the selected point's window —
  cancelled on unmount, paused in a background tab, and stopped entirely once
  the backend has answered `404` or rejected the identifier.
- **No data** — an explicit not-available state, never a synthetic value.

## Out of scope

Changing the `greenhouse` backend, its API, CORS policy, schema or migrations.
Changing `greenhouse-simulation-lab`. Serving this application from the backend's
origin is a deployment concern owned here, not there.
