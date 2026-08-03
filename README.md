# AI Greenhouse Customer Portal

The customer-facing web application for AI Greenhouse: the place a customer
monitors and manually operates one or more greenhouse facilities.

This repository is the portal, not a single screen. **Dashboard** is one feature
inside it and owns the `/` route; later units add facility, control-zone and
activity features alongside it.

## What this release contains

This is the portal foundation. It delivers the application shell — identity,
routing, navigation, breadcrumbs, notifications, the responsive layout, the
shared UI states and the API boundary — plus a Dashboard route that reports
whether the cloud API is reachable.

It deliberately contains **no** greenhouse data. The portal reads one endpoint,
the backend's `/health`, and renders nothing that the backend did not say. There
are no sample facilities, no placeholder readings and no invented statistics.

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
npm run format:check   # Prettier check
npm run format         # Prettier write
npm run lint           # ESLint
npm run typecheck      # strict TypeScript, no emit
npm run test           # Vitest unit and component suite
npm run test:coverage  # the same, with a coverage summary
npm run build          # production Vite build
npm run preview        # serve the production build on :4173
npm run e2e            # Playwright desktop + narrow viewport
npm run dev            # Vite dev server on :5173
```

Reproducibly, in Docker:

```bash
docker compose run --rm test   # format, lint, typecheck, unit/component tests
docker compose run --rm e2e    # Playwright, in the official browser image
```

The browser suite serves the real production build and answers the backend's
`/health` from fixtures, so it needs no backend and no shared mutable state.

## Application structure

```text
src/
  app/         bootstrap, providers, router mounting, route tree
  api/         base URL configuration, HTTP boundary, health contract, queries
  components/  reusable presentational UI (panels, status, notifications)
  features/
    dashboard/ the Dashboard feature and its route component
  layouts/     the portal shell: header, navigation, breadcrumbs, main region
  routes/      the route table and the 404 page
  shared/      cross-feature utilities (notifications channel, formatting)
```

Routes are described as data in `src/routes/routes.tsx`. The router, the primary
navigation, the page heading, the breadcrumbs and the document title all read
that one table, so navigation can only ever offer a route that exists.

Every request goes through `src/api/http.ts`: one base URL, one place for error
normalisation, one place where cancellation is honoured, and one place a token
will be attached when authentication exists. Presentational components make no
requests.

[`openapi.json`](openapi.json) is the backend's published contract, kept here for
reference and as the input a generated client or generated types would use in a
later unit.

## Routes

| Route | What it is                                                       |
| ----- | ---------------------------------------------------------------- |
| `/`   | Dashboard — the portal landing page and cloud API availability   |
| `*`   | The portal's 404 page, rendered inside the shell with a way back |

Navigation lists only routes that work. There is no placeholder entry for a
feature that has not been built.

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
- Site, facility and control-zone loading, and topology editing.
- Sensor monitoring, telemetry history and charts.
- Actuator controls, manual commands and command polling.
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
