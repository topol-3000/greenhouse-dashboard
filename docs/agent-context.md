# greenhouse-dashboard context

Short, stable context for anyone — human or agent — changing this repository.

## What this is

A single-screen, read-only owner monitoring dashboard for the AI Greenhouse
cloud backend. It answers one question: _what is my greenhouse reading right
now, and what has it been reading recently?_

It is a separate repository from `greenhouse` and ships as its own container.

## Stack

React 19 + TypeScript (strict) + Vite. TanStack Query v5 owns server state and
polling. Recharts draws the charts. Vitest and Testing Library cover units
and components; Playwright covers the browser. Nginx serves the built assets and
reverse-proxies `/api/v1`.

## Integration boundary

The dashboard is an ordinary HTTP client of the `greenhouse` public API. It uses
three read endpoints:

| Purpose                                        | Endpoint                                             |
| ---------------------------------------------- | ---------------------------------------------------- |
| Facility list                                  | `GET /api/v1/facilities?status=active&limit=200`     |
| Facility configuration and current point state | `GET /api/v1/facilities/{facility_id}/configuration` |
| Point telemetry history                        | `GET /api/v1/points/{point_id}/telemetry?limit=100`  |

Rules that follow from that:

- Requests are same-origin and relative. The backend host lives only in the
  container's `GREENHOUSE_API_UPSTREAM`, never in the bundle.
- No dashboard-specific backend endpoint exists or may be requested. If a screen
  seems to need one, that is a backend conversation, not a client workaround.
- Response fields are consumed as published. The client invents no field, no
  aggregate contract and no domain vocabulary.
- Unknown additive fields are ignored rather than rejected.
- Active measurement points are derived from `status` and `point_kind`; chart
  eligibility from `data_type`. No point code is special-cased.
- The history endpoint answers newest-first (`observed_at DESC, id DESC`). The
  chart reverses it; the transport layer does not.
- Every eligible numeric point is charted at once, in a responsive grid. There
  is no chart selector; a point with no samples yet keeps its card and says so.

## Polling

| Resource                        | Interval |
| ------------------------------- | -------- |
| Facility list                   | 30s      |
| Selected facility configuration | 5s       |
| Each numeric point's history    | 10s      |

One fetch per resource at a time. Every numeric point is charted, so history is
one query per point on its own key and its own interval — a facility with four
numeric points makes four history requests per tick. Selection changes abort
superseded requests.

## Failure model

- **First load fails** — full error state with Retry.
- **Refresh fails** — the last successful snapshot stays on screen, marked
  stale, with Retry.
- **Malformed item** — dropped and counted, surfaced as a partial-data notice.
- **Malformed document** — controlled error state, never a blank screen.
- **No current state** — an explicit no-data value, never a zero.

## Out of scope

Authentication and RBAC, WebSocket/SSE, notifications, PWA/offline, any write or
control action (create, edit, archive, commands, actuators, simulation
lifecycle), grow journal and planting lifecycle, production hosting, and a
reusable organisation-wide design system.

Changing the `greenhouse` backend, its API, CORS policy, schema or migrations is
out of scope for this repository.
