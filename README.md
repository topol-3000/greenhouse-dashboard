# AI Greenhouse Customer Portal

The customer-facing web application for AI Greenhouse: the place a customer
monitors and manually operates one or more greenhouse facilities.

This repository is the portal, not a single screen. **Dashboard** is one feature
inside it and owns the `/` route; **Greenhouses**, **Activity**, the Facility
workspace and the ControlZone workspace sit alongside it.

## What this release contains

The portal foundation, **read-only greenhouse topology**, **read-only monitoring
inside a control zone**, **limited manual control of that zone's actuators**, and
**read-only command activity** for it. On top of the application shell — a
CoreUI sidebar, header, breadcrumbs, content region and footer, with identity,
routing, notifications, a light/dark/auto appearance preference, the responsive
layout, the shared UI states and the API boundary — it loads the customer's real
Site → Facility → ControlZone structure from the cloud API, lets them navigate
it, and inside a control zone shows what its measurement points last reported,
the telemetry history of the one they select, and the control points they may
switch on or off. Activity then shows what has been asked of that zone's
equipment — by a person and by the greenhouse's own control system — and what
became of each request.

Everything on screen came from the cloud API. There are no sample facilities, no
placeholder readings and no invented statistics; when the API returns nothing,
the portal says so rather than filling the page.

The one thing the portal writes is **one manual command at a time**, through the
public `POST /api/v1/commands` operation, after an explicit confirmation. It
still creates, edits and deletes nothing: no site, no facility, no control zone,
no point, no control loop and no schedule. Activity is read-only: it cancels,
retries and resubmits nothing. There is no alert and no automation, and the
portal never talks to a gateway or a device. What a command _did_ is what the
cloud API says it did — see
[Manual control inside a control zone](#manual-control-inside-a-control-zone) and
[Activity](#activity).
Authentication is not part of this release either — see
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

### Reproducing the browser evidence

`e2e/appearance-evidence.spec.ts` opens every route, the two dialogs and the
API-unavailable shell at a desktop and a phone width in both appearances, checks
that none of them scrolls sideways, and writes a screenshot of each:

```bash
npm run e2e -- appearance-evidence                        # host
docker compose run --rm e2e npx playwright test appearance-evidence   # in Docker
```

The images land in `test-results/appearance-evidence/`, which is an ignored
test-artifact directory — generating the evidence leaves `git status` clean, and
no screenshot is committed. They are review evidence, not assertions: nothing in
the suite compares pixels, so a deliberate design change does not break a test.

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
  components/  the shared component vocabulary: labelled section cards, named
               loading/empty/error states, notes, the availability badge and the
               notification region
  features/
    dashboard/  the Dashboard feature and its route component
    topology/   Greenhouses, Facility and ControlZone screens, the facility
                switcher and their view models
    monitoring/ the ControlZone workspace's monitoring section: measurement
                discovery, current-state cards, telemetry series and chart
    control/    the ControlZone workspace's manual-control section: actuator
                discovery, reported state, confirmation, command submission
                and bounded command-lifecycle observation
    activity/   the Activity route: URL-backed zone selection, one zone's
                bounded command window, command details and their bounded
                lifecycle observation
  layouts/     the portal shell: header, sidebar navigation, breadcrumbs, main
               region, footer and the light/dark/auto appearance preference
  routes/      the route table and the 404 page
  shared/      cross-feature utilities (notifications channel, formatting)
  styles/      coreui.scss, the selective CoreUI build; and theme.css, the
               greenhouse theme: design tokens, the CoreUI variable and
               component mapping, and the shell layout
  test/        test support only: the render harness and contract-valid fixtures
```

The portal is built on **CoreUI Free for React**, shell and screens alike.
`@coreui/react` supplies the sidebar navigation, header, breadcrumb and footer,
and the cards, alerts, callouts, badges, buttons, form controls, tables, list
groups, spinners, grid and modals the feature screens are made of;
`@coreui/coreui` supplies their stylesheet; `@coreui/icons` and
`@coreui/icons-react` supply the icons the sidebar entries and the appearance
selector draw. Nothing else from the CoreUI Free Admin Template is copied in —
no demo page, no sample widget and no chart library.

Two small wrappers exist where CoreUI has no semantic equivalent: `SectionCard`,
a labelled `<section>` landmark rendered as a card, and `MetaList`, a labelled
description list. Everything else on a feature screen is a CoreUI component.

Stylesheets load in one order, set in `src/app/main.tsx`: CoreUI, then
`src/styles/theme.css`, then `src/styles.css`, so where a class name is shared
the portal's own rule is the one that applies.

**CoreUI is compiled selectively.** `src/styles/coreui.scss` is the portal's own
Sass entry: it `@forward`s CoreUI's configuration, foundations, utility API and
the components the application actually renders, and nothing else. It is a list
of imports, not a fork — every rule still comes from `@coreui/coreui`, upgrades
with the package, and is configured by the same variables; no CoreUI source is
copied into this repository. The dropped partials are the components no screen
uses: dropdowns, navbars, accordions, pagination, progress, toasts, tooltips,
popovers, carousels, off-canvas, placeholders, chips, avatars and the narrow
sidebar rail. Each remaining `@forward` carries a comment naming what needs it,
so adding a CoreUI component to a screen means adding its partial here. The
whole utility API is kept deliberately: those classes are chosen per element
across every feature directory, and a hand-pruned list would be a second
inventory to keep in step with the JSX. `sass` is a dev dependency and
`loadPaths` in `vite.config.ts` is what resolves the `@coreui/coreui/scss/…`
specifiers.

`theme.css` holds the design tokens, the CoreUI variable mapping and the shell.
`styles.css` holds only what CoreUI has no component for — the typographic reset
the Bootstrap reboot makes necessary, readable measure and long-value
containment, the visible focus ring and the 44px touch-target minimum, the
telemetry chart's own SVG styling and the reduced-motion guarantee.

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

| Route                                   | What it is                                                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `/`                                     | Dashboard — cloud API availability and the API's own topology counts                                                      |
| `/sites`                                | Greenhouses — every site and the facilities inside it                                                                     |
| `/activity`                             | Activity — one control zone's commands, what was asked for and what became of each                                        |
| `/facilities/:facilityId`               | Facility workspace — the facility, its site and its control zones                                                         |
| `/facilities/:facilityId/zones/:zoneId` | ControlZone workspace — the zone, its parents, its point inventory, its monitoring section and its manual-control section |
| `*`                                     | The portal's 404 page, rendered inside the shell with a way back                                                          |

The primary navigation offers **Dashboard**, **Greenhouses** and **Activity**:
the three routes that work without a resource in their path. The nested routes
are reached by link, by the facility switcher, or by their own address — they are
shareable, they survive a refresh, and browser back and forward behave normally,
because the URL is the only source of the selected facility and control zone.
Activity carries its whole selection in search parameters for the same reason.

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

### Manual control inside a control zone

Manual control is a section of the ControlZone workspace, underneath monitoring.
It is not a route of its own and not an entry in the primary navigation, which
stays **Dashboard** and **Greenhouses**. `/sites` and `/facilities/:facilityId`
gain no global on/off button, no aggregated actuator state and no command data.

**Which points can be commanded.** `POST /api/v1/commands` publishes its own
precondition — the target must be "an active boolean control point that is
assigned to the named zone in the `control_output` role and names a reported
status point" — and every clause of it is an explicit field of the configuration
document. All five are checked before an action is offered:

| Clause                               | Field                                                                              |
| ------------------------------------ | ---------------------------------------------------------------------------------- |
| a control point                      | `ConfigurationPoint.point_kind === "control"`                                      |
| active                               | `ConfigurationPoint.status === "active"`                                           |
| boolean                              | `ConfigurationPoint.data_type === "boolean"`                                       |
| a control output **of this zone**    | `ConfigurationZonePoint.role === "control_output"`                                 |
| names the point that reports it back | `ConfigurationPoint.reported_point_id !== null`, and that point is in the document |

Nothing is classified by a name, a code or a `metric_type`. A control point
called "North air temperature vent" is commandable because of its fields; a
status point called "North lamp power switch" is not, for the same reason. The
role belongs to the _link_, so a control point this zone assigns as a
`safety_interlock` is not a manual target of this zone. A control point that
fails a clause is **listed with the reason** and given no action — a `float`
control point does not grow a slider, because the contract publishes no bounds,
step or unit semantics for one.

A zone with no control outputs reads **No manual controls are available for this
zone**, which is a successful answer and not an outage.

**Which actions are offered.** Two named buttons, `Turn on X` and `Turn off X`,
and nothing else. `ManualCommandCreate.desired_value` is a strict `bool` whose
schema says "true is on"; the contract refuses `1`, `"on"` and `"true"` rather
than coercing them, and publishes no numeric, percentage or free-form command
shape at all. So there is no slider, no dimming, no text field, no JSON editor
and no single unlabelled toggle whose position hides the value being requested.
Neither action is withheld because the reported state appears to match it: that
state has its own timestamp and the contract does not make it authoritative over
what may be commanded.

**Three states, kept apart.** The section never merges these into one "current
state", because the contract does not:

- **Reported state** — the last state of the point `reported_point_id` names,
  and nothing else. `false` and `0` are readings; only a `null` value renders
  **No reported state yet**. It is never replaced by what was asked for, never
  inferred from an HTTP status, and never inferred from a command succeeding.
  The control point's _own_ state projection is deliberately not shown: the
  contract defines it as neither a desired state nor a reported one.
- **Requested state** — `desired_value` on the command that was created. "A
  request, never a reading", in the contract's words.
- **Command state** — `CommandState`, shown with the raw enum beside its label.
  `pending` is the only non-terminal state; `applied` and `rejected` are
  terminal. `acknowledged_at` on a pending command means the Edge received it
  and nothing more, and is worded that way.

When a command reaches `applied` and the reported state has not changed, **both
facts stay on screen** and neither is reconciled into the other.

**Confirmation.** Choosing an action opens a modal confirmation and sends
nothing. It states the site, the facility, the control zone, the control point
with its code, the exact value being requested and the reported state as it
stands, plus a plain sentence that the command is a request to the cloud API and
may not be applied immediately. Submission happens only from the confirm action.
Focus starts on the dialog rather than on a button — so the keystroke that
opened it cannot also press one — stays inside it while it is open, and returns
to the control that opened it on Cancel or `Escape`. Changing zone or facility
closes obsolete confirmation state.

**One command per confirmation.** The confirm action is disabled while its
request is in flight and guarded so that a double click or a repeated `Enter`
cannot produce a second request. Only the affected actuator's actions are
disabled; every other actuator, monitoring and the navigation stay usable.

**Idempotency.** `Idempotency-Key` is required by the contract and is a UUID the
portal generates from `crypto.randomUUID()` (falling back to
`crypto.getRandomValues`, never to a timestamp or `Math.random`) when the
customer confirms **one logical intent**. The same intent keeps its key for a
safe replay; a different action gets a new one. A browser with no secure random
source is told manual control is unavailable rather than given a button that
fails when pressed. The contract's rules are what make this safe: the same key
with the same body answers `200 outcome: "existing"` and writes nothing, and the
same key with a different body answers `409 idempotency_key_conflict`.

**An ambiguous outcome.** If the request never completes — the connection drops,
the response is lost — the portal says the command **may or may not have been
created**. It does not call it a failure, does not retry on its own, and does not
mint a new key. Two safe actions are offered: resolve it with
`GET /api/v1/commands?idempotency_key=` (the contract's own answer, carrying zero
or one command), or send the same request again under the same key. The
actuator's actions stay closed until it is resolved. The command collection is
never scanned for something that merely resembles what was asked for.

**Lifecycle observation.** After a creation response the command is followed by
`GET /api/v1/commands/{command_id}`, keyed by its own identifier, every **5
seconds**, and only while it is non-terminal. It stops at `applied` and
`rejected`, stops on a `404` or a `422`, and never retries on top of the
interval. A command whose `control_zone_id`, `target_point_id` and
`desired_value` are not the ones the intent asked for is refused rather than
adopted.

The contract defines no delivery timeout, so the portal bounds its own watching
at **2 minutes**. When that runs out without a terminal state the screen says
**Status is still unconfirmed. The portal stopped checking automatically** — a
client observation window, explicitly not a failure and explicitly not a
rejection — and offers **Check again**, which resumes the same command under the
same identifier.

**Failing at the smallest scope.** A refused command leaves the actuator, its
reported state, the measurements and the topology exactly where they are. A
failed lifecycle read keeps the last command representation on screen with a
note and a retry. A failed background configuration refresh keeps the actuator
inventory and its reported states. A `/health` failure erases nothing, and a
command is never gated on `/health` answering. `409` and `422` are decisions and
are never retried automatically; a `5xx` or a lost connection is never presented
as proof that a command was rejected. No response body, header, URL or upstream
detail reaches a screen — failures are described by status and by the contract's
own `error.code`.

**What manual control does not add.** No command history in the workspace itself
beyond the one command created in the current interaction, no schedules, no
alerts, no automation or control-loop editing, no thresholds, no recipes, no
grow cycles, no device provisioning, no gateway status, no simulation controls,
and no WebSocket or server-sent events. The one thing it now offers is a single
link — **View this command in Activity** — carrying the facility in the address
and the zone, control point and command the cloud API named. A command the
workspace has stopped following is therefore recoverable rather than lost.

## Activity

**What it is.** `/activity` is one control zone's command history: every command
the cloud API returns for that zone, whether a person asked for it from this
portal or the greenhouse's own control system did. It is command activity, not a
generic event stream — no alert, no schedule, no automation decision, no
telemetry and no audit record appears in it.

**It is read-only.** Commands are created in the ControlZone workspace and
nowhere else. Activity sends, cancels, retries and resubmits nothing.

**Scoped to a control zone, because the contract is.**
`GET /api/v1/commands` filters by `control_zone_id`, `target_point_id` and
`source`. It publishes no facility-wide filter, so the portal does not assemble
one out of a request per zone and call it a facility feed. Nothing is chosen for
the customer: no site, facility or zone is pre-selected, and until one is chosen
Activity says so and asks for nothing.

**The selection is the address.** `site`, `facility`, `zone`, `point`, `source`
and `command` are search parameters, and only the ones with a value are written.
A refresh restores the whole selection including the open command; back and
forward walk through the states the customer actually chose; and a link to one
command is a link they can send. Every one of them is verified against loaded
data before it is believed — a facility the selected site does not own, a zone
the facility does not contain, a control point the zone does not assign, and a
`source` the contract does not publish each select nothing, say so, and leave
the rest of the address working.

**A command in a URL is a claim, not evidence.** A `?command=` is read through
`GET /api/v1/commands/{command_id}` and adopted only if its `control_zone_id` is
the zone selected. A command belonging to another zone is reported as such and
none of it is drawn.

**A bounded, newest-first window.** Unlike telemetry history, the list operation
documents its own order — "a bounded, deterministic newest-first window […]
Ordering is `created_at DESC, id DESC` and is enforced by the query itself" — and
applies it _before_ the limit. So the portal may truthfully call the answer the
most recent commands, and it does not re-sort what the backend already ordered.
`CommandListRead` still carries no total and no cursor, so Activity asks for at
most 100 commands, says that is a window rather than the history, and offers no
page after it. The window is not polled: it is history, and the one thing a
customer waits on is the command they opened.

**What a row says, and what it never says.** The target actuator's name, the
requested value as **On** or **Off**, the source as **Manual** or **Automatic**,
the lifecycle label with the raw `CommandState` beside it, the creation time,
whether the greenhouse has been recorded as receiving it, the completion time of
an applied command, and the typed code and message of a rejected one. A row
carries no reading: a current value beside a command from last week would read
as that command's outcome.

**Three facts, kept apart.** Opening a command shows **Requested** — its
`desired_value`, a request and never a reading — beside **Reported**, the current
state of `reported_point_id` read from the facility configuration, beside the
**command's** own lifecycle. They are never reconciled. An applied command whose
reported value has not changed shows both. A rejected command whose reported
value happens to match what it asked for is still rejected. A reported `false` is
an off reading, not missing data; only `null` reads **No reported state yet**.

**Acknowledgement is not a state.** `CommandState` has three values, and receipt
is not one of them. A pending command with `acknowledged_at` set is shown as
pending and _received by the greenhouse_ — never as a fourth state, never as
applied, and a command without a receipt is never described as failed or as a
gateway being offline.

**Manual and automatic.** A manual command shows no control loop and no trigger
sample, because the contract publishes both as `null` for it and the portal
invents neither. An automatic command names the `control_loop_id` and
`trigger_sample_id` the cloud API published and explains the source in one
sentence — and offers no way to create, edit or disable the control system that
produced it.

**Labels cost no extra request.** `CommandRead` carries identifiers where a
customer needs names. They are resolved through the facility configuration
document the zone workspace already loaded and cached — one request describing
the whole facility, never one per row, and no per-command state read. A label
the document cannot resolve is shown as the identifier the API published; a
command is never hidden because its name is missing.

**Following the command you opened.** A non-terminal command is re-read every 5
seconds. Polling stops at `applied` or `rejected`, stops on the contract's `404`,
and stops after a 2-minute observation window that ends in _status is still
unconfirmed_ — not _failed_, not a statement about a gateway, and never a
resubmission. Asking to check again opens a new window over the same command, and
so does a refresh of an address that names it.

**Failing at the smallest scope.** A failed window is an error with a retry, and
is never rendered as an empty history; an empty window says the cloud API
returned no command for these filters. A failed refresh leaves the last good
window on screen with a note. A configuration failure costs the names, not the
commands. A reported state that cannot be read leaves every fact about the
command itself intact.

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

The three operations manual control adds:

| Purpose                          | Operation                                       | Schema                                                |
| -------------------------------- | ----------------------------------------------- | ----------------------------------------------------- |
| Create one manual command        | `POST /api/v1/commands`                         | `ManualCommandCreate` → `ManualCommandAcceptanceRead` |
| Read one command's lifecycle     | `GET /api/v1/commands/{command_id}`             | `CommandRead`                                         |
| Resolve a lost creation response | `GET /api/v1/commands?idempotency_key=&limit=1` | `CommandListRead`                                     |

The one operation Activity adds:

| Purpose                           | Operation                                                               | Schema            |
| --------------------------------- | ----------------------------------------------------------------------- | ----------------- |
| One control zone's command window | `GET /api/v1/commands?control_zone_id=&target_point_id=&source=&limit=` | `CommandListRead` |

Activity re-reads `GET /api/v1/commands/{command_id}` for the command it opens,
and the facility configuration document for the names and the reported state. It
adds no other request, and in particular no request per row.

The request body is exactly `ManualCommandCreate` — the schema is
`additionalProperties: false`, so there is no field to add:

```http
POST /api/v1/commands
Idempotency-Key: 3f1b8b0e-9c1e-4a5a-9a8f-2b7f0c5d1a42
Content-Type: application/json

{
  "control_zone_id": "9b3e1f5c-8d30-4b49-9d8f-7b4d3e1f0001",
  "target_point_id": "bb000000-0000-4000-8000-000000000002",
  "desired_value": true
}
```

`201` means the command was created and `200` that the key already named it; the
body's own `outcome` (`created` / `existing`) is what the portal reads, because
the contract puts it there for clients behind a proxy that rewrites statuses.
Neither status means the actuator moved.

The controllable inventory and the reported states come from the **same
`FacilityConfigurationRead` request monitoring already makes** — one query key,
one poll, no second read. `reported_point_id` is on `ConfigurationPoint`
precisely so a client can decide whether a control point can be commanded before
any command exists, which is why no extra request is needed to find out.

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
- `GET /api/v1/points/{point_id}/state` is **not** used — see the note above:
  the configuration document already carries every point's last state, including
  the reported points, and one request per actuator per poll would buy only
  `received_at` and `revision`;
- the Cloud ↔ Edge surface — `GET /api/v1/edge/gateways/{gateway_id}/commands`,
  `PUT .../acknowledgement` and `POST /api/v1/edge/telemetry` — is for gateways
  and is **never** called from the browser. Neither is control-loop creation,
  gateway provisioning, direct current-state mutation, or any other `POST`,
  `PATCH` or `DELETE`. The one write this portal makes is a manual command;
- `CommandRead` returns the three sample identifiers rather than embedded
  samples, and the portal does not follow them: a command's result is its
  `state`, and what the equipment reports is the reported point's own state.

## Accessibility and responsiveness

- Semantic landmarks, a skip link to the main region, and focus moved to the page
  heading on navigation.
- A visible focus indicator on every interactive element.
- Primary navigation that collapses at narrow widths behind a toggle with
  `aria-expanded`/`aria-controls`, closes on `Escape` and returns focus to it.
- No state signalled by colour alone: every status carries its own words. A
  reading, a missing reading, a quality and a failed refresh are each readable in
  monochrome, and the chart encodes nothing in colour that is not also in text.
- A **light / dark / auto** appearance selector in the header: three ordinary
  buttons in a labelled group, each reachable by Tab, activated by Enter or
  Space, and carrying `aria-pressed` so the selection is stated rather than only
  highlighted. The preference is local to the browser — it is stored on the
  device, never sent anywhere, and there is no account setting behind it.
  `auto` follows `prefers-color-scheme` and keeps following it while a system
  change happens. The stored value is resolved before the first paint, so the
  portal does not flash the wrong theme, and anything unrecognised falls back to
  `auto`.
- Light and dark palettes with held contrast, and a reduced-motion rule. The
  chart animates nothing.
- A persistent sidebar on a wide screen; below CoreUI's sidebar breakpoint it
  becomes off-canvas behind the same accessible toggle, and a closed menu is
  removed from the layout, so its links leave the tab order rather than sitting
  invisibly in it.
- Desktop, tablet and phone layouts without horizontal page overflow. Each page
  is an intentional responsive grid rather than one column padded out: the
  Dashboard's two answers sit side by side, a facility's identity sits beside its
  control zones, and measurement and actuator cards fill the width the screen
  actually has. Paragraphs stay capped at a readable measure while the workspace
  around them does not. The chart is drawn at the pixel width its container
  actually has — rather than scaled from a fixed `viewBox`, which would shrink
  its labels along with it — and a wide table scrolls inside its own box, never
  the page.
- Every full-size control clears the 44px touch-target minimum, including on a
  phone. The small variants are deliberately smaller: they qualify something
  already on the screen rather than being its action.
- Monitoring is a labelled region with an ordered heading hierarchy
  (`Monitoring` → `Measurement points` / `Telemetry history` → each point), and
  the chart has an accessible name plus a text summary of the loaded series. The
  full sample table is always available underneath it, so no value is only
  available by looking at, or hovering over, a drawing.
- Point selection is a set of ordinary buttons with `aria-pressed`: keyboard
  operable, with no custom combobox to re-learn and no keyboard trap. A
  background poll is shown but not announced, so a screen reader is not
  interrupted every thirty seconds by a request nobody asked for.
- Manual control is a labelled region with its own ordered headings
  (`Manual control` → each control point → `Reported state` / `This command`).
  Every action carries the actuator's name in its accessible name — `Turn on
North lamp`, not `On` — and a disabled action is accompanied by the reason in
  words.
- The confirmation is a real modal — CoreUI's `CModal`: `role="dialog"`,
  `aria-modal`, an accessible name, initial focus on the dialog rather than on a
  button, a contained tab cycle, `Escape` and Cancel both closing it, and focus
  returned to the control that opened it. Its title and actions stay put while
  the detail between them scrolls, so on a phone Cancel and Send are on the
  screen rather than below a fold. Its confirm action names the target and the
  value, so it is specific out of context.
- Reported state, requested state and command state are each readable in
  monochrome and without an icon: a value and its words, never a colour-changing
  switch. Lifecycle transitions are announced through one live region whose text
  changes only when the state changes, so a five-second poll that returns the
  same answer announces nothing.
- Actuator cards reflow into one column at phone width, their actions stay
  comfortably tappable, and the confirmation is sized from the viewport rather
  than a fixed pixel width, scrolling inside itself instead of pushing the page
  sideways. Long point names, identifiers and lifecycle messages wrap.
- Activity is one markup at every viewport, not a desktop table beside a mobile
  card list: each command is a list item containing a button whose fields carry
  their own visible labels, laid into aligned columns on a wide screen and
  stacked on a narrow one. The phone and the desktop therefore cannot drift into
  showing different things, and a row is a real button — reachable by Tab,
  activated by Enter or Space — at both. Its filters are native `<select>`
  elements with their own labels. Command details are a modal dialog that takes
  focus, keeps Tab inside itself, closes on Escape and returns focus to the row
  that opened it; closing removes only the command from the address. Source,
  lifecycle and receipt are always words, never colour alone, and the raw
  `CommandState` stays beside its label.

## Not implemented yet

Named here so nothing above is mistaken for a promise that has been kept:

- **Authentication.** There is no sign-in, no token, no user and no role. The
  portal shows whatever the cloud API it is configured against reports, and the
  API boundary carries a place to attach a token rather than a fake one.
- **Topology and point editing.** Sites, facilities, control zones and points are
  read-only here. There is no create, edit or delete, and no button that pretends
  there is.
- **Command history beyond one zone's bounded window.** Activity shows the
  commands the cloud API returns for one selected control zone, newest first, up
  to 100 of them. There is no facility-wide or customer-wide feed, no paging past
  that window, no export, and no filtering by lifecycle state — the list
  operation publishes no `facility_id` and no `state` parameter, and neither is
  simulated in the browser.
- **Acting on a past command.** Activity is read-only: no cancellation, no
  retry, no resubmission and no bulk control.
- **Generic audit or system events.** Activity is command activity. Nothing else
  is folded into it.
- Alerts and notifications about greenhouse conditions, threshold evaluation and
  "normal/warning/critical" classification.
- Agronomic recommendations, target ranges, recipes, grow cycles, runtime
  targets, automation, schedules, temporary overrides and control-loop creation
  or visualisation. Manual control switches one configured actuator; it
  configures nothing.
- Non-boolean actuator control. The command contract accepts a strict `bool`, so
  there is no dimming, speed, percentage or setpoint control to build.
- Device provisioning, firmware, physical device bindings, gateway status and
  any direct Edge or device communication. The portal calls the public cloud API
  and never the Cloud ↔ Edge surface.
- Users, tenants, billing and settings screens.
- Live transports: monitoring and command lifecycles refresh on bounded polls,
  and this release adds no WebSocket and no server-sent events.

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
