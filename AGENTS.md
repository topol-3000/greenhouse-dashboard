# greenhouse-dashboard agent guide

This repository is the standalone owner monitoring UI for AI Greenhouse. It is
a browser application and nothing else.

## Required reading order

1. This file.
2. [`docs/agent-context.md`](docs/agent-context.md).
3. The relevant code and tests.

## Boundaries

- **Read-only.** The dashboard consumes the `greenhouse` public HTTP read API.
  It creates, updates, archives and commands nothing.
- **No backend imports.** There is no shared package, generated client or build
  step that reaches into the `greenhouse` repository. The contract is HTTP.
- **Same-origin only.** Browser requests go to relative `/api/v1` URLs. A
  backend host never appears in application JavaScript; the reverse proxy owns
  it at runtime through `GREENHOUSE_API_UPSTREAM`.
- **No domain writes.** No create/edit/archive control, no command button, no
  simulation lifecycle, no actuator control.
- The `greenhouse` repository is authoritative for endpoint paths and response
  shapes. Read its code and tests rather than guessing or inventing fields.

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
- Transport DTOs stay separate from display formatting.
- Missing data renders as an explicit no-data value, never a synthetic zero.
- Only numeric points are chart-eligible, decided from `data_type`, never from a
  hard-coded point code.
- Polling is bounded and per-resource through TanStack Query. No global interval
  loop.
- A refresh failure keeps the last successful snapshot and marks it stale.
- Tests assert user-visible behaviour and the API contract, not implementation
  details.
