# greenhouse-dashboard agent guide

This repository is the **AI Greenhouse Customer Portal**: the customer-facing web
application for monitoring and manually operating one or more greenhouse
facilities. It is a browser application and nothing else.

The directory and the GitHub repository keep the name `greenhouse-dashboard`.
Inside the application, Dashboard is one feature and one route, not the product.

## Required reading order

1. This file.
2. [`docs/agent-context.md`](docs/agent-context.md).
3. The relevant code and tests.

## Boundaries

- **HTTP client only.** The portal consumes the `greenhouse` public HTTP API. It
  adds no endpoint, and it never asks for a portal-specific aggregate.
- **No backend imports.** There is no shared package or build step that reaches
  into the `greenhouse` repository. The contract is HTTP, and
  [`openapi.json`](openapi.json) is the published copy of it.
- **Same-origin by default.** The default build requests relative URLs, and the
  reverse proxy owns the backend host at runtime through
  `GREENHOUSE_API_UPSTREAM`. `VITE_API_BASE_URL` exists for deployments that
  cannot proxy; it is configuration, never a host hard-coded in source.
- The `greenhouse` repository is authoritative for endpoint paths and response
  shapes. Read its code, tests and OpenAPI document rather than guessing.
- Changing `greenhouse` or `greenhouse-simulation-lab` is out of scope here.

## Commands

```bash
npm ci
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
npm run e2e

docker compose up --build
docker compose run --rm test
docker compose run --rm e2e
```

## Rules

- TypeScript strict mode; no `any` in application code.
- One API boundary. Every request goes through `src/api/http.ts`, which owns URL
  construction, error normalisation and cancellation. Presentational components
  make no requests.
- Transport DTOs stay separate from display formatting.
- **Nothing is invented.** No sample facility, no placeholder reading, no
  synthetic zero, no statistic that the backend did not produce. Missing data
  renders as an explicit not-available state.
- Routes are data in `src/routes/routes.tsx`. The router, the navigation, the
  page heading, the breadcrumbs and the document title all read that one table,
  so navigation cannot offer a route that does not work.
- No visible entry point for a feature that has not been built.
- The shell stays usable when the API is unavailable. API failure is a state the
  portal displays, never a replacement for the application.
- Polling is bounded and per-resource through TanStack Query. No global interval
  loop.
- Accessibility is part of the definition of done: semantic landmarks, visible
  focus, keyboard operability, no meaning carried by colour alone.
- Authentication is not implemented. Do not add fake tokens, fake users, a local
  login or route-only security.
- Tests assert user-visible behaviour and the API contract, not implementation
  details.
