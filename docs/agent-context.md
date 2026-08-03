# greenhouse-dashboard context

Short, stable context for anyone — human or agent — changing this repository.

## What this is

The **AI Greenhouse Customer Portal**: the customer-facing web application for
monitoring and manually operating one or more greenhouse facilities. It is a
separate repository from `greenhouse` and ships as its own container.

Dashboard is a feature of the portal, owning the `/` route. It is not the
product, and the application is not a standalone monitoring dashboard.

## Current state

The portal foundation. Delivered:

- product identity, page and document titles;
- a real client-side routing layer with an extensible route table;
- the portal shell — brand, primary navigation, breadcrumb infrastructure,
  location-aware page heading, global notification region, accessible mobile
  navigation, responsive layout, focus handling;
- a centralised API boundary with one configurable base URL;
- cloud API availability from the backend's `/health`;
- the Dashboard route as a truthful landing page;
- reusable loading, empty, error, not-found and notification states.

Not delivered, and not to be implied by any screen: topology loading or editing,
sensor monitoring, telemetry history, actuator control, manual commands, command
polling, activity history, recipes, grow cycles, automation, schedules,
authentication, users, roles, tenants, billing and settings.

## Stack

React 19 + TypeScript (strict) + Vite. React Router owns client-side routing.
TanStack Query v5 owns server state and polling. Vitest and Testing Library cover
units and components; Playwright covers the browser. Nginx serves the built
assets, reverse-proxies the backend surface and owns the SPA fallback.

## Integration boundary

The portal is an ordinary HTTP client of the `greenhouse` public API. In this
unit it uses exactly one endpoint:

| Purpose                | Endpoint      |
| ---------------------- | ------------- |
| Cloud API availability | `GET /health` |

Rules that follow from that:

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
- **No data** — an explicit not-available state, never a synthetic value.

## Out of scope

Changing the `greenhouse` backend, its API, CORS policy, schema or migrations.
Changing `greenhouse-simulation-lab`. Serving this application from the backend's
origin is a deployment concern owned here, not there.
