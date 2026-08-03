# AI Greenhouse Customer Portal

The customer-facing web application for AI Greenhouse: the place a customer
monitors and manually operates one or more greenhouse facilities.

This repository is the portal, not a single screen. **Dashboard** is one feature
inside it and owns the `/` route; **Greenhouses**, the Facility workspace and the
ControlZone workspace sit alongside it.

## What this release contains

The portal foundation, **read-only greenhouse topology**, and **read-only
monitoring inside a control zone**. On top of the application shell — identity,
routing, navigation, breadcrumbs, notifications, the responsive layout, the
shared UI states and the API boundary — it loads the customer's real
Site → Facility → ControlZone structure from the cloud API, lets them navigate
it, and inside a control zone shows what its measurement points last reported
and the telemetry history of the one they select.

Everything on screen came from the cloud API. There are no sample facilities, no
placeholder readings and no invented statistics; when the API returns nothing,
the portal says so rather than filling the page.

The portal stays **read-only**. Nothing in it creates, edits or deletes a site,
a facility, a control zone or a point, and nothing in it operates a greenhouse:
there is no actuator state, no control, no command, no Activity history, no
alert and no automation. Authentication is not part of this release either — see
[Not implemented yet](#not-implemented-yet).

## Repository boundaries

Three repositories, meeting only at published HTTP contracts:

| Repository                  | Responsibility                                                        |
| --------------------------- | --------------------------------------------------------------------- |
| `greenhouse`                | The cloud API. Owns the domain, the database and every endpoint.      |
| `greenhouse-dashboard`      | **This repository.** The Customer Portal web application.             |
| `greenhouse-simulation-lab` | Executable environment simulation. A producer, like a real edge site. |

The portal is an ordinary HTTP client of the `greenhouse` public API. It adds no
endpoint of its own, changes nothing in the backend, and knows nothing about the
Simulation Lab beyond the fact that a producer may have provisioned the data the
API serves.

## Prerequisites

- Node 24 LTS and npm, to run the portal and its tooling directly.
- Docker with Compose v2, to run the production container or the reproducible
  check suites.
- A reachable `greenhouse` backend, if you want the portal to report the cloud
  API as available. It is not started by this repository, and the portal stays
  usable without it.

## Local development

```bash
npm ci
npm run dev
```

Then open <http://localhost:5173>.

The dev server proxies the backend surface the portal uses — `/api/v1` and
`/health` — to `http://127.0.0.1:8000`. Point it somewhere else with
`GREENHOUSE_API_UPSTREAM`:

```bash
GREENHOUSE_API_UPSTREAM=http://192.168.1.10:8000 npm run dev
```

## Configuration

| Variable                  | Where it applies                | Default                       |
| ------------------------- | ------------------------------- | ----------------------------- |
| `VITE_API_BASE_URL`       | frontend bundle, at build time  | empty — same origin           |
| `GREENHOUSE_API_UPSTREAM` | dev/preview proxy and container | `http://127.0.0.1:8000` (dev) |
| `PORTAL_PORT`             | published port of the container | `3000`                        |

### Pointing the portal at the backend

There are two ways, and the default is the first.

**Through a same-origin proxy (recommended).** Leave `VITE_API_BASE_URL` empty.
The bundle then requests relative URLs, and whatever serves it decides where the
backend is: the Vite dev server, `vite preview`, or the Nginx runtime container.
No backend host is compiled into application JavaScript, and repointing the
container needs no rebuild:

```bash
GREENHOUSE_API_UPSTREAM=http://192.168.1.10:8000 docker compose up --build
```

`GREENHOUSE_API_UPSTREAM` must be a scheme, host and port with **no path**
(`http://host:8000`, not `http://host:8000/api/v1`).

**Directly, at build time.** Set `VITE_API_BASE_URL` to an absolute URL when a
deployment cannot proxy. This makes the portal a cross-origin client, which the
backend must be willing to accept:

```bash
VITE_API_BASE_URL=https://api.example.com npm run build
```

`VITE_API_BASE_URL` is one base URL for the whole backend. Both `/api/v1` and the
unversioned `/health` are derived from it, so they cannot drift apart. It accepts
an empty value, an absolute path (`/greenhouse-api`) or an absolute `http(s)`
URL, always without a query string or fragment. Anything else is rejected, and
the portal says so in place of the availability state instead of failing
silently. See [`.env.example`](.env.example).

## Running the production container

```bash
docker compose up --build
```

Then open <http://localhost:3000>.

The runtime image is a current unprivileged Nginx (`nginxinc/nginx-unprivileged`)
containing only the built static assets and the runtime Nginx configuration — no
Node runtime, no source, no dev dependencies and no secrets. It runs as a
non-root user on port 8080 inside the container and has its own `/healthz`
liveness endpoint, which is distinct from the backend's proxied `/health`.

It also owns the SPA fallback, so **a browser refresh on any portal route serves
the application** rather than a 404. Hashed assets under `/assets/` are served
with a one-year immutable cache; `index.html` is served `no-cache`, so a new
deployment is picked up immediately.

### Running against a local `greenhouse` checkout

1. Start the backend in its own repository:

   ```bash
   cd ../greenhouse
   docker compose up --build     # serves the API on host port 8000
   ```

2. Start the portal here:

   ```bash
   docker compose up --build
   ```

The default upstream (`http://host.docker.internal:8000`) already matches the
backend's default published port, so no configuration is needed.

The greenhouse backend creates no demo data. A clean database serves empty domain
tables, and this portal invents nothing to fill them.

## Commands

```bash
npm run format:check         # Prettier check
npm run format               # Prettier write
npm run lint                 # ESLint
npm run typecheck            # strict TypeScript, no emit
npm run test                 # Vitest unit and component suite
npm run test:coverage        # the same, with a coverage summary
npm run build                # production Vite build
npm run preview              # serve the production build on :4173
npm run e2e                  # Playwright desktop + narrow viewport
npm run dev                  # Vite dev server on :5173
npm run generate:api-types   # regenerate src/api/schema.ts from openapi.json
```

Reproducibly, in Docker:

```bash
docker compose run --rm test   # format, lint, typecheck, unit/component tests
docker compose run --rm e2e    # Playwright, in the official browser image
```

The browser suite serves the real production build and answers `/health`, the
topology endpoints, the facility configuration document and point telemetry from
contract-faithful fixtures inside the browser, so it needs no backend, no
sibling repository and no shared mutable state. Use the Docker command when the
local machine lacks the browser's system libraries.

Nested routes and the `?point=` selection are client-side addresses, so
**whatever serves the bundle must answer every path with `index.html`**. The
repository's Nginx runtime and `vite preview` both do; a host that does not will
404 on a refresh of `/facilities/…/zones/…`.

## Application structure

```text
src/
  app/         bootstrap, providers, router mounting, route tree
  api/         base URL, HTTP boundary, generated + narrowed contract types,
               decoding, pagination, health and topology requests, queries
  components/  reusable presentational UI (panels, status, notifications)
  features/
    dashboard/  the Dashboard feature and its route component
    topology/   Greenhouses, Facility and ControlZone screens, the facility
                switcher and their view models
    monitoring/ the ControlZone workspace's monitoring section: measurement
                discovery, current-state cards, telemetry series and chart
  layouts/     the portal shell: header, navigation, breadcrumbs, main region
  routes/      the route table and the 404 page
  shared/      cross-feature utilities (notifications channel, formatting)
  test/        test support only: the render harness and contract-valid fixtures
```

Routes are described as data in `src/routes/routes.tsx`. The router, the primary
navigation, the page heading, the breadcrumbs and the document title all read
that one table, so navigation can only ever offer a route that exists.

Every request goes through `src/api/http.ts`: one base URL, one place for error
normalisation, one place where cancellation is honoured, and one place a token
will be attached when authentication exists. Presentational components make no
requests.

`src/test/fixtures.ts` and `e2e/fixtures.ts` are **test support only**. Nothing
under `src/` outside the tests imports them, there is no demo or seed mode, and
production code never falls back to a fixture: a request the cloud API does not
answer is an error state on screen, not sample data.

## Routes

| Route                                   | What it is                                                                                    |
| --------------------------------------- | --------------------------------------------------------------------------------------------- |
| `/`                                     | Dashboard — cloud API availability and the API's own topology counts                          |
| `/sites`                                | Greenhouses — every site and the facilities inside it                                         |
| `/facilities/:facilityId`               | Facility workspace — the facility, its site and its control zones                             |
| `/facilities/:facilityId/zones/:zoneId` | ControlZone workspace — the zone, its parents, its point inventory and its monitoring section |
| `*`                                     | The portal's 404 page, rendered inside the shell with a way back                              |

The primary navigation offers **Dashboard** and **Greenhouses** only: the two
routes that work without a resource. The nested routes are reached by link, by
the facility switcher, or by their own address — they are shareable, they
survive a refresh, and browser back and forward behave normally, because the URL
is the only source of the selected facility and control zone.

There is no placeholder entry for a feature that has not been built.

### How the portal presents the topology

```text
Site            → a card on /sites, with its code, time zone and status
└── Facility    → a link into /facilities/:facilityId
    └── ControlZone → a link into /facilities/:facilityId/zones/:zoneId
```

The parentage shown is the parentage the API states — `FacilityRead.site_id` and
`ControlZoneRead.facility_id`. Nothing is inferred from a name, a code or the
shape of an address, and a control zone whose `facility_id` is not the facility
in the URL is refused rather than drawn under the wrong parent.

A site with no facilities, a facility with no control zones and a cloud API with
no topology at all are each stated in words. So is an incomplete read: if a
collection is larger than the portal's bounded pagination walk, the screen says
how much of it is being shown instead of presenting a partial list as the whole.

### Monitoring inside a control zone

Monitoring is a section of the ControlZone workspace, not a route of its own and
not an entry in the primary navigation. `/sites` and `/facilities/:facilityId`
stay free of readings: there is no facility-wide aggregate, no global freshness
and no cross-zone telemetry, because a truthful one cannot be assembled from a
partial read.

**Which points appear.** A point is a measurement when the API says
`point_kind: "measurement"` and `status: "active"`, and never otherwise. Nothing
is classified by a name, a code or a `metric_type`: a control point called
"North air temperature vent" is a control point. Control and status points stay
visible in the zone's composition table above — that is the zone's _inventory_ —
and never receive a card, a value, a chart or a button.

**Current state.** Each measurement card carries the value, the unit, the
quality and the observation time the API published, and nothing else.

- `0` and `false` are readings and render as readings. A point that has never
  reported carries `value: null` with `quality: "no_data"`, and reads
  **No data yet**;
- a point the API published without a unit reads **Unit not provided**. No unit
  is guessed, and no value is converted between units;
- `quality` is shown as the backend's own vocabulary — `Good`, `Uncertain`,
  `Stale` — never re-interpreted. There is **no invented freshness threshold**:
  the portal shows the real `observed_at` and lets the backend's `DataQuality`
  say whether a value is stale. Nothing is labelled normal, high, low, safe or
  out of range, because the contract defines no range for the portal to compare
  against;
- "Refreshing…" and "Showing the last data the cloud API returned" describe the
  _request_, never the age of a measurement.

**Telemetry history.** Selecting a measurement point loads one bounded window of
its history. The selection lives in the URL as `?point=<point_id>`, so a link to
one point's history is shareable and survives a refresh; it is validated against
the zone's loaded measurements, and an identifier that names none of them
selects nothing without invalidating the facility or the zone in the address.

- the window is **200 samples**, requested with the operation's own `limit`. The
  contract publishes no total and no cursor for telemetry, so there is no page
  to follow and no completeness to reach — the screen says it is a bounded
  window, and says so more loudly when the response comes back full;
- samples are ordered by `observed_at` in the browser, with the sample
  identifier as a tie-break. The operation documents no ordering, so arrival
  order is not trusted;
- `observed_at` (when a greenhouse measured it) and `received_at` (when the
  cloud heard about it) are shown as two separate columns and are never
  substituted for one another;
- **charts are numeric only.** A point is charted when the contract types it
  `float` or `integer` _and_ the sample's value is a finite number at a readable
  instant. A string is never parsed into a number, `NaN` and infinity are not
  plotted, and nothing invalid becomes `0`. Samples that cannot be plotted stay
  in the table and are counted in a notice above the chart;
- a run of plottable samples is one line, and an unplottable sample **breaks**
  it, so a gap is drawn as a gap rather than interpolated through;
- a `boolean` or `string` measurement keeps its history and is shown as a table
  with an explanation instead of a fabricated numeric chart;
- if the loaded samples carry **more than one unit**, they are not drawn as one
  continuous series and are not converted: the screen says the window mixes
  units and shows the samples with their own units.

**Refreshing and failing.** The configuration document is re-read every 30
seconds and the selected point's window every 60; both are TanStack Query
intervals, cancelled on unmount and paused while the tab is in the background,
never a hand-rolled timer. A failure is retried once and then left to the
interval; a `404` or a rejected identifier stops the interval entirely, because
repeating it cannot change the answer. A failed refresh never empties the
screen — the last successful values and the last successful chart stay exactly
where they were, with a note saying they may be out of date — and monitoring
degrades at the smallest scope there is: a history that fails leaves the current
values, a monitoring request that fails leaves the topology, the breadcrumbs and
the navigation working.

## Backend integration

[`openapi.json`](openapi.json) is the backend contract this repository is built
against, and the only contract it is built against. It is checked in, and the
TypeScript types at the API boundary are generated from it:

```bash
npm run generate:api-types   # openapi.json → src/api/schema.ts, formatted
```

`src/api/schema.ts` is generated and committed; do not edit it by hand. Refresh
`openapi.json`, re-run the command, and a field the backend renamed becomes a
TypeScript error rather than an empty space on a screen.
`src/api/contract.ts` narrows that output to the schemas this portal consumes and
documents the mapping.

| Purpose                             | Operation                                    | Schema                          |
| ----------------------------------- | -------------------------------------------- | ------------------------------- |
| Cloud API availability              | `GET /health`                                | `HealthResponse`                |
| List sites                          | `GET /api/v1/sites`                          | `Page[SiteRead]`                |
| Resolve one site                    | `GET /api/v1/sites/{site_id}`                | `SiteRead`                      |
| List facilities, optionally by site | `GET /api/v1/facilities?site_id=`            | `Page[FacilityRead]`            |
| Resolve one facility                | `GET /api/v1/facilities/{facility_id}`       | `FacilityRead`                  |
| List a facility's control zones     | `GET /api/v1/control-zones?facility_id=`     | `Page[ControlZoneRead]`         |
| Resolve one control zone            | `GET /api/v1/control-zones/{zone_id}`        | `ControlZoneRead`               |
| A control zone's point composition  | `GET /api/v1/control-zones/{zone_id}/points` | `Page[ZonePointAssignmentRead]` |

The two operations monitoring adds:

| Purpose                                        | Operation                                            | Schema                      |
| ---------------------------------------------- | ---------------------------------------------------- | --------------------------- |
| Zone membership, point metadata, current state | `GET /api/v1/facilities/{facility_id}/configuration` | `FacilityConfigurationRead` |
| One point's bounded telemetry window           | `GET /api/v1/points/{point_id}/telemetry?limit=200`  | `TelemetryHistoryRead`      |

**Why the configuration document.** It is the only published operation that
answers all three monitoring questions in one request: which points a zone
contains (`ConfigurationZone.points`), what each point _is_
(`ConfigurationPoint.point_kind`, `data_type`, `unit`, `status`) and what it
last read (`ConfigurationPoint.state`). Its own description says it is assembled
from a fixed number of queries. The alternative —
`GET /api/v1/control-zones/{zone_id}/points` followed by
`GET /api/v1/points/{point_id}/state` per point — costs one request per
measurement point per poll, and `ZonePointAssignmentRead` still does not publish
the point's `status`, so an archived point could not be recognised without yet
another request each. `include_archived` is not sent, so the contract's own
default applies and archived zones and points are left out by the backend.

What that costs, stated rather than hidden: `ConfigurationPointState` carries
`value`, `quality` and `observed_at` only. `received_at` and `revision` exist on
`PointStateRead` alone, and the portal does not spend a request per point per
poll to fetch them. Telemetry samples publish both timestamps, so `received_at`
appears where the contract already supplies it — in the history table.

Notes that follow from the contract:

- every collection answers the `Page` envelope — `items`, `total`, `limit`,
  `offset` — with `limit` capped at 200. The portal walks the pages up to a hard
  bound and reports an incomplete read rather than guessing;
- counts shown on the Dashboard are the backend's own `Page.total`, not a number
  this portal added up from the pages it happened to receive;
- a deep link resolves its resource with the contract's direct lookup, so
  opening `/facilities/{id}` does not list every facility first;
- filtering is done by the backend through `site_id` and `facility_id`, not by
  the browser after the fact;
- a `404` — and a `422` for an identifier that is not the UUID the contract
  requires — is a resource-level "not in the cloud API" state on the page, never
  a full-page outage;
- `TelemetryHistoryRead` is `items` and nothing else — no `total`, no cursor, no
  page number — and the telemetry operation documents no ordering and does not
  say which samples a `limit` keeps when more match. So there is no pagination
  to implement, the portal sorts the window itself, and no screen claims a
  history is complete, is the latest _N_ samples, or covers a fixed period;
- `value` has no schema on `ConfigurationPointState` and `TelemetrySampleRead`:
  the backend stores measurements in one `jsonb` column. It is carried as
  `unknown` and narrowed where it is displayed, never coerced at the boundary;
- an entry of a telemetry response that does not match `TelemetrySampleRead` is
  counted and left out rather than allowed to discard the whole window;
- `GET /api/v1/points/{point_id}/state` is **not** used — see the note above —
  and neither is any control-plane operation: commands, control loops, gateways,
  the edge surface, and every `POST`, `PATCH` and `DELETE`. The portal reads.

## Accessibility and responsiveness

- Semantic landmarks, a skip link to the main region, and focus moved to the page
  heading on navigation.
- A visible focus indicator on every interactive element.
- Primary navigation that collapses at narrow widths behind a toggle with
  `aria-expanded`/`aria-controls`, closes on `Escape` and returns focus to it.
- No state signalled by colour alone: every status carries its own words. A
  reading, a missing reading, a quality and a failed refresh are each readable in
  monochrome, and the chart encodes nothing in colour that is not also in text.
- Light and dark palettes with held contrast, and a reduced-motion rule. The
  chart animates nothing.
- Desktop, tablet and phone layouts without horizontal page overflow. The chart
  is drawn at the pixel width its container actually has — rather than scaled
  from a fixed `viewBox`, which would shrink its labels along with it — and a
  wide sample table scrolls inside its own box, never the page.
- Monitoring is a labelled region with an ordered heading hierarchy
  (`Monitoring` → `Measurement points` / `Telemetry history` → each point), and
  the chart has an accessible name plus a text summary of the loaded series. The
  full sample table is always available underneath it, so no value is only
  available by looking at, or hovering over, a drawing.
- Point selection is a set of ordinary buttons with `aria-pressed`: keyboard
  operable, with no custom combobox to re-learn and no keyboard trap. A
  background poll is shown but not announced, so a screen reader is not
  interrupted every thirty seconds by a request nobody asked for.

## Not implemented yet

Named here so nothing above is mistaken for a promise that has been kept:

- **Authentication.** There is no sign-in, no token, no user and no role. The
  portal shows whatever the cloud API it is configured against reports, and the
  API boundary carries a place to attach a token rather than a fake one.
- **Topology and point editing.** Sites, facilities, control zones and points are
  read-only here. There is no create, edit or delete, and no button that pretends
  there is.
- **Manual control.** No actuator reported state, no actuator desired state, no
  control button, no command submission, no command polling and no command
  history. Monitoring reads measurement points and nothing else.
- Activity history, alerts and notifications about greenhouse conditions,
  threshold evaluation and "normal/warning/critical" classification.
- Agronomic recommendations, target ranges, recipes, grow cycles, runtime
  targets, automation, schedules and control-loop visualisation.
- Users, tenants, billing and settings screens.
- Live transports: monitoring refreshes on a bounded poll, and this release adds
  no WebSocket and no server-sent events.

## Troubleshooting

**The portal loads but says the cloud API is unavailable.**

That is a real state, not a crash — the shell stays usable. Check what the proxy
is configured with and whether the backend is up:

```bash
docker compose exec portal printenv GREENHOUSE_API_UPSTREAM
curl -i http://localhost:3000/healthz   # the portal container itself
curl -i http://localhost:3000/health    # the backend, through the proxy
curl -i http://localhost:8000/health    # the backend, directly
```

- `/healthz` returns `ok` but `/health` returns **502** — the container cannot
  reach the upstream. Confirm the backend is running and that
  `GREENHOUSE_API_UPSTREAM` names a host the _container_ can resolve. Inside a
  container, `localhost` is the container itself, which is why the default is
  `host.docker.internal`.
- The container **fails to start** with an Nginx host-not-found error — the
  upstream hostname does not resolve at all. Fix the value or add the appropriate
  `extra_hosts` entry.
- `/health` returns **503** — the proxy works and the backend is reporting itself
  or its database unavailable. The portal shows that as `Degraded`.
- Requests to a **different origin** — only if `VITE_API_BASE_URL` was set to an
  absolute URL at build time. The default build is same-origin only.

## Repository context

See [`AGENTS.md`](AGENTS.md) and [`docs/agent-context.md`](docs/agent-context.md)
for the durable boundaries this repository is maintained under.
