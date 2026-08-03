# AI Greenhouse Customer Portal

The customer-facing web application for AI Greenhouse: the place a customer
monitors and manually operates one or more greenhouse facilities.

This repository is the portal, not a single screen. **Dashboard** is one feature
inside it and owns the `/` route; **Greenhouses**, the Facility workspace and the
ControlZone workspace sit alongside it.

## What this release contains

The portal foundation, plus **read-only greenhouse topology**. On top of the
application shell — identity, routing, navigation, breadcrumbs, notifications,
the responsive layout, the shared UI states and the API boundary — it loads the
customer's real Site → Facility → ControlZone structure from the cloud API and
lets them navigate it.

Everything on screen came from the cloud API. There are no sample facilities, no
placeholder readings and no invented statistics; when the API returns nothing,
the portal says so rather than filling the page.

Topology is **read-only** here: nothing in the portal creates, edits or deletes
a site, a facility or a control zone. Monitoring, manual control, Activity
history and authentication are not part of this release — see
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

The browser suite serves the real production build and answers `/health` and the
topology endpoints from contract-faithful fixtures inside the browser, so it
needs no backend, no sibling repository and no shared mutable state. Use the
Docker command when the local machine lacks the browser's system libraries.

Nested routes are client-side addresses, so **whatever serves the bundle must
answer every path with `index.html`**. The repository's Nginx runtime and
`vite preview` both do; a host that does not will 404 on a refresh of
`/facilities/…`.

## Application structure

```text
src/
  app/         bootstrap, providers, router mounting, route tree
  api/         base URL, HTTP boundary, generated + narrowed contract types,
               decoding, pagination, health and topology requests, queries
  components/  reusable presentational UI (panels, status, notifications)
  features/
    dashboard/ the Dashboard feature and its route component
    topology/  Greenhouses, Facility and ControlZone screens, the facility
               switcher and their view models
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

| Route                                   | What it is                                                            |
| --------------------------------------- | --------------------------------------------------------------------- |
| `/`                                     | Dashboard — cloud API availability and the API's own topology counts  |
| `/sites`                                | Greenhouses — every site and the facilities inside it                 |
| `/facilities/:facilityId`               | Facility workspace — the facility, its site and its control zones     |
| `/facilities/:facilityId/zones/:zoneId` | ControlZone workspace — the zone, its parents and its point inventory |
| `*`                                     | The portal's 404 page, rendered inside the shell with a way back      |

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
- `GET /api/v1/facilities/{facility_id}/configuration` is deliberately **not**
  used: it carries live point state, and this release is topology only.

## Accessibility and responsiveness

- Semantic landmarks, a skip link to the main region, and focus moved to the page
  heading on navigation.
- A visible focus indicator on every interactive element.
- Primary navigation that collapses at narrow widths behind a toggle with
  `aria-expanded`/`aria-controls`, closes on `Escape` and returns focus to it.
- No state signalled by colour alone: every status carries its own words.
- Light and dark palettes with held contrast, and a reduced-motion rule.
- Desktop, tablet and phone layouts without horizontal page overflow.

## Not implemented yet

Named here so nothing above is mistaken for a promise that has been kept:

- **Authentication.** There is no sign-in, no token, no user and no role. The
  portal shows whatever the cloud API it is configured against reports, and the
  API boundary carries a place to attach a token rather than a fake one.
- **Topology editing.** Sites, facilities and control zones are read-only here.
  There is no create, edit or delete, and no button that pretends there is.
- Sensor monitoring, telemetry history, freshness and charts.
- Actuator state, actuator controls, manual commands and command polling.
- Activity history, recipes, grow cycles, automation and schedules.
- Users, tenants, billing and settings screens.

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
