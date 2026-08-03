# Greenhouse Monitor

A standalone, read-only monitoring dashboard for the AI Greenhouse cloud
backend. Pick a facility, see every active measurement point with its current
reading, and inspect the last 100 samples of a numeric point on a chart. New
telemetry appears on its own through bounded polling.

**Read-only boundary.** This application only reads the `greenhouse` public HTTP
API. It creates, updates, archives and commands nothing — there is no way to
change greenhouse state from this UI, by design.

## Prerequisites

- Docker with Compose v2 (the only requirement for running the dashboard).
- A reachable `greenhouse` backend. It is not started by this repository.
- Node 24 LTS and npm, only if you want to run the tooling outside Docker.

## Quick start

```bash
docker compose up --build
```

Then open <http://localhost:3000>.

The container serves the built assets and reverse-proxies `/api/v1` to the
backend. By default it looks for the greenhouse API on the **host** at port
8000, through `host.docker.internal` (mapped to the host gateway so this also
works on Linux).

## Pointing at a different backend

The upstream is read at container start, so changing it needs **no frontend
rebuild**:

```bash
GREENHOUSE_API_UPSTREAM=http://192.168.1.10:8000 docker compose up
```

`GREENHOUSE_API_UPSTREAM` must be a scheme, host and port with **no path**
(`http://host:8000`, not `http://host:8000/api/v1`). Nginx forwards the original
request URI unchanged, so the path and query string reach the backend as sent.

To change the published port, set `DASHBOARD_PORT` (default `3000`).

## Running against a local `greenhouse` checkout

1. Start the backend in its own repository:

   ```bash
   cd ../greenhouse
   docker compose up --build     # serves the API on host port 8000
   ```

2. Start the dashboard here:

   ```bash
   docker compose up --build
   ```

The default upstream (`http://host.docker.internal:8000`) already matches the
backend's default published port, so no configuration is needed.

The greenhouse backend creates no demo data. A clean database serves empty
domain tables, so provision a facility, points and telemetry through the public
management APIs — for example with the Simulation Lab — before expecting
readings.

## Clean-start behaviour

Each empty state is deliberate and visible, never a blank screen:

| Situation                                 | What you see                                               |
| ----------------------------------------- | ---------------------------------------------------------- |
| Backend has no active facilities          | "No facilities yet", explaining that producers create them |
| Facility has no active measurement points | "No measurement points"                                    |
| Facility has only non-numeric points      | "No numeric measurements"                                  |
| Numeric point has no samples yet          | "No numeric samples have been recorded…"                   |
| Point has never reported                  | An em dash `—` and quality `No data` — never `0`           |

## Polling and stale data

| Resource                                          | Interval |
| ------------------------------------------------- | -------- |
| Facility list                                     | 30 s     |
| Selected facility configuration and current state | 5 s      |
| Selected point telemetry history                  | 10 s     |

Polling is per-resource through TanStack Query; there is no global interval loop
and only one request per resource is ever in flight. Changing facility or point
aborts the superseded request.

If a **refresh** fails, the last successful snapshot stays on screen and the
header marks it `Stale` with a Retry button. If the **first** load fails, you get
a full error state with Retry. Retry genuinely refetches.

## Commands

Outside Docker, with dependencies installed via `npm ci`:

```bash
npm run format:check   # Prettier check
npm run lint           # ESLint
npm run typecheck      # strict TypeScript, no emit
npm run test           # Vitest unit and component suite
npm run test:coverage  # the same, with a coverage summary
npm run build          # production Vite build
npm run e2e            # Playwright desktop + narrow viewport
npm run dev            # Vite dev server on :5173, proxying /api/v1
```

`npm run dev` proxies to `http://127.0.0.1:8000` by default; override with
`GREENHOUSE_API_UPSTREAM`.

Reproducibly, in Docker:

```bash
docker compose run --rm test   # format, lint, typecheck, unit/component tests
docker compose run --rm e2e    # Playwright, in the official browser image
```

The e2e suite serves the real production build and answers `/api/v1` from
fixtures, so it needs no backend and no shared mutable state.

## Container

The runtime image is a current unprivileged Nginx (`nginxinc/nginx-unprivileged`)
containing only the built static assets and the runtime Nginx configuration — no
Node runtime, no source, no dev dependencies and no secrets. It runs as a
non-root user on port 8080 inside the container and has a `/healthz` health
check.

Hashed assets under `/assets/` are served with a one-year immutable cache;
`index.html` is served `no-cache`, so a new deployment is picked up immediately.

## Limitations and excluded features

Deliberately not part of this dashboard:

- any write, command or control action — create, edit, archive, actuator
  control, fan or lighting control, simulation start/stop;
- authentication, RBAC or multi-tenancy;
- WebSocket/SSE live push, notifications, PWA or offline mode;
- a grow journal, planting lifecycle, photos or manual events;
- a dashboard-specific backend endpoint or aggregate contract;
- production hosting.

Known limitations:

- The JavaScript bundle is around 594 kB (≈177 kB gzipped), dominated by the
  charting library; it is not code-split.
- Only one numeric point is charted at a time.
- Facility selection is local UI state and is not persisted across reloads.
- The connectivity indicator is derived from the API queries themselves; the
  backend's `/health` endpoint is outside the proxied `/api/v1` surface and is
  not consulted.

## Troubleshooting

**The page loads but everything shows an error, or the banner says the API is
unreachable.**

Check what the proxy is actually configured with and whether the backend is up:

```bash
docker compose exec dashboard printenv GREENHOUSE_API_UPSTREAM
curl -i http://localhost:3000/healthz              # the dashboard itself
curl -i http://localhost:3000/api/v1/facilities    # through the proxy
curl -i http://localhost:8000/api/v1/facilities    # the backend directly
```

- `/healthz` returns `ok` but `/api/v1/...` returns **502** — the container
  cannot reach the upstream. Confirm the backend is running and that
  `GREENHOUSE_API_UPSTREAM` names a host the _container_ can resolve. From
  inside a container, `localhost` is the container itself, which is why the
  default is `host.docker.internal`.
- The container **fails to start** with an Nginx host-not-found error — the
  upstream hostname does not resolve at all. Fix the value or add the
  appropriate `extra_hosts` entry.
- `/api/v1/facilities` returns **200 with an empty `items` list** — the proxy
  works and the backend is simply empty. Provision data through the public
  management APIs.
- Requests to a **different origin** — this application never does that. All
  browser requests are same-origin `/api/v1`; if you see cross-origin calls,
  something other than this bundle is making them.

## Repository context

See [`AGENTS.md`](AGENTS.md) and [`docs/agent-context.md`](docs/agent-context.md)
for the durable boundaries this repository is maintained under.
