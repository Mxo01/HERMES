# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

HERMES: three ESP8266 sensor nodes post readings over HTTP to a Flask server
on a Raspberry Pi, which stores them in SQLite, raises alarms, notifies over
Telegram, and serves a React dashboard on the same origin. See
[README.md](README.md) for the full system explanation (data flow, alarm
engine, retention, deployment model) — read it before making non-trivial
changes, it documents *why* the system works the way it does, not just what
the code does.

## Commands

Everything goes through the root `Makefile`; it installs missing dependencies
on first use, so `make dev` works from a fresh clone.

```bash
make dev              # backend :5001 + dashboard :5173, hot reload, Ctrl-C stops both
make demo             # same, seeded with 21 days of generated data
make serve            # production build, exactly as the Pi runs it (gunicorn, no Vite)
make check            # tests + typecheck + lint + format check, both sides — run before committing
make format           # reformat the dashboard with Prettier
make build            # compile the dashboard into frontend/dist
make firmware         # compile firmware for all three NODE_TYPE values
make seed             # regenerate the demo database
```

`make dev API_PORT=5002 DASH_PORT=5174` if the default ports are taken — `make`
checks first and tells you what's holding them.

### Backend only (from `backend/`, venv active)

```bash
python -m pytest                          # all tests
python -m pytest tests/test_alarms.py     # one file
python -m pytest tests/test_alarms.py -k test_name  # one test
python -m mypy hermes app.py wsgi.py      # type check
```

### Frontend only (from `frontend/`)

```bash
npm run dev           # Vite, proxied to :5001
npm run typecheck     # tsc -b --noEmit
npm run lint          # oxlint
npm run format        # prettier --write .
npm run format:check  # prettier --check . — what CI and `make check` run
npm run build         # tsc -b && vite build
```

### Firmware (from `firmware/`, needs PlatformIO)

`src/main.cpp` is shared by all three boards; `#define NODE_TYPE` at the top
selects behavior at compile time. `make firmware` compiles it as node 1, 2 and
3 in turn and restores the original file after — that's the only way to catch
a change that breaks one node type but not the others (CI does the same).

## Architecture

### Backend: hexagonal, one composition root

`domain/` never imports Flask, SQLite, or an HTTP client — it depends only on
`Protocol`s declared in [backend/hermes/domain/ports.py](backend/hermes/domain/ports.py)
(`Clock`, `EventPublisher`, `Notifier`, `WeatherProvider`, repositories).
`infrastructure/` implements those ports (SQLite repos, Telegram, Socket.IO,
Open-Meteo). Everything is wired together in exactly one place,
[backend/hermes/container.py](backend/hermes/container.py) — `build_services()`
takes a `Settings` plus optional `Clock`/`EventPublisher`/`WeatherProvider`
overrides and returns a `Services` dataclass. This is why tests can exercise
real services against a temp SQLite file and a clock they control
(`FrozenClock`/`RecordingPublisher` in
[backend/tests/conftest.py](backend/tests/conftest.py)) instead of mocking
internals. When adding a new external dependency, add a port + adapter and
wire it in `container.py`, not inline in a service.

`domain/catalog.py` is the single source of truth for the physical
installation — which rooms, sensors, and metrics exist, and the plausible
range for each. Ingestion validation, the API's `/api/meta` response, and the
frontend's metric formatting all trace back to it; add a metric or room there
first, not in scattered conditionals.

`app.py`/`wsgi.py` → `factory.create_app()` builds the Flask app, runs
`services.database.migrate()` (versioned, automatic, no manual migration
step), registers the API blueprints and the SPA static handler, and starts the
`JobScheduler` (`infrastructure/jobs/scheduler.py`) with four daemon-thread
jobs: `downsampling` (hourly rollup, see retention below), `node-watchdog`
(per-minute liveness check), `weather-sync`, `weather-backfill`. Each job
swallows its own exceptions so one failing job can't kill the others or the
web server — preserve that when touching `scheduler.py` or adding a job.

Under the Werkzeug reloader in debug mode, jobs only start in the reloader's
child process (`_is_primary_process` in `factory.py`) — don't remove that
check or dev mode double-runs every job.

`gunicorn.conf.py` deliberately pins `workers = 1`: the process owns the
in-memory job scheduler and the Socket.IO client registry, so a second worker
would duplicate jobs and split broadcasts. Concurrency comes from threads
(`worker_class = 'gthread'`), matching Socket.IO's threading async mode.

Storage is deliberately narrow: one `readings` row per `(domain, room, metric,
value, timestamp)`, not a column per sensor — adding a metric never needs a
schema migration. Raw samples live 7 days; a background job rolls anything
older into `hourly_aggregates` (avg/min/max/count) and deletes what it
summarized. Queries merge both tables transparently, preferring raw rows where
both cover the same hour — see README §4.2 before touching
`infrastructure/db/reading_repository.py` or `domain/services/retention.py`.

Alarms are **stateful**, not one row per breaching sample: a rule opens an
alarm when a metric crosses its threshold, tracks the peak while it holds, and
closes it only once the value drops back under `threshold * release` (default
90%) — this hysteresis is what stops a sensor hovering near its threshold from
spamming Telegram. See `domain/services/alarms.py` (`AlarmRule`,
`AlarmService._apply`) before changing threshold or notification behavior.

Every API response uses one JSON envelope (`{"status": "success", "data": …}`
or `{"status": "error", "message": …, "errors": {...}}`); domain errors are
translated centrally into HTTP status codes rather than per-endpoint —
[backend/hermes/api/responses.py](backend/hermes/api/responses.py) and
`domain/errors.py` are where that mapping lives.

`Settings` (`config.py`) is resolved once from the environment via
`Settings.from_env()`; defaults are documented in
[backend/.env.example](backend/.env.example). Add new configuration there,
not as a bare `os.environ.get()` scattered in code.

`mypy` runs with `disallow_untyped_defs`, `warn_return_any`, and
`check_untyped_defs` — new code needs full type annotations. It's pinned to
Python 3.11 to match Raspberry Pi OS Bookworm (the actual deploy target), not
the dev machine's interpreter — see [backend/pyproject.toml](backend/pyproject.toml).

### Frontend: domain folders, a `shared/` for everything else

```
frontend/src/
├── App.tsx        State + data fetching + derived values; picks a layout and renders it
├── live/          The Live domain — HeroMetric, RoomComparison, only used from here
│   ├── LiveView.tsx
│   ├── components/
│   └── models/
├── history/       The History domain — the one domain with an exclusive service + utils
│   ├── HistoryView.tsx
│   ├── history.service.ts   useDaily — the only fetch no other domain needs
│   ├── history.utils.ts     buildDayRows, paginate, halfPeriodStats, dayDeltaColor
│   ├── components/          CompareStats, DayTable/DayRows, RangeBar
│   └── models/
├── alarms/        The Alarms domain — thin: its cross-domain parts live in shared/
│   ├── AlarmsView.tsx
│   └── models/
├── shared/        Anything used by 2+ domains, or by no domain at all (app shell)
│   ├── components/{charts,controls,panels,shell,common}/
│   ├── models/{charts,controls,panels,shell,common}/  types.ts, dates.model.ts, pagination.model.ts
│   ├── utils/     format.ts, dates.ts, metrics.ts, series.ts, svg.ts, cn.ts
│   ├── const/     view.ts
│   └── services/  api.ts (HTTP client), socket.ts, dashboard.service.ts
└── hooks/         Reusable React hooks, free of domain logic — useResource,
                   useChartPointer, useElementSize, useMediaQuery, useInView, …
                   (useRoute/useSocketEvent are typed against the app's own
                   View and ServerEvent unions, so they do import from shared/)
```

**A domain folder (`live/`, `history/`, `alarms/`) owns only what nothing else
needs.** Apply this literally, not aspirationally: a component, model, util, or
service moves to `shared/` the moment a second domain needs it — it does not stay
"morally" owned by the domain it started in. This is why `live/` and `alarms/` are
thin today: `GasPanel` and `AlarmTable`/`AlarmCards` are rendered from more than one
domain, so they live in `shared/components/panels/`, not inside either domain. Only
`history/` currently has an exclusive service and utils file, because nothing else
calls `useDaily`, `buildDayRows`, or `halfPeriodStats`. Don't force a domain to have
a non-empty `components/`, `models/`, `utils`, or `service` file it doesn't need —
an empty category is the honest result of the real dependency graph, not a gap to
fill in.

Within `shared/`, `components/` and `models/` mirror the same category split
(`charts/controls/panels/shell/common`) so a model is always easy to find next to
the component category it describes — `shared/components/charts/BandChart.tsx`
pairs with `shared/models/charts/BandChart.model.ts`.

Every component file holds exactly one component — never two components (even a
small private one) in the same `.tsx`. Where a desktop and phone variant share the
same data shape (e.g. `AlarmTable`/`AlarmCards`, `DayTable`/`DayRows`), each still
gets its own file; a helper only one of them uses (like `RangeBar`, shared by both
`DayTable` and `DayRows`) gets its own file too, exported so its siblings can import
it. Every component's prop `interface`/`type` lives in its own `ComponentName.model.ts`
under the nearest `models/` folder — never declared inline in the component file —
and the component imports it with
`import type { ComponentNameProps } from '../models/ComponentName.model'` (domain)
or `'../../models/<category>/ComponentName.model'` (shared). When two sibling
components genuinely share one prop shape (the `AlarmTable`/`AlarmCards` case
above), that shape gets one shared model file (`AlarmList.model.ts`) rather than
being duplicated per component. A plain, non-exported constant used by only one
component (a grid-template string, a numeric threshold) is not a "model" and stays
in the component file itself.

**Types and functions are always separate files**, even within one concern —
`shared/utils/series.ts` (functions) pairs with `shared/models/charts/series.model.ts`
(the `HourBucket`/`HourSlot`/`HeatRow` types those functions return), the same way
`history/history.utils.ts` pairs with `history/models/history.model.ts`. Never add a
`type`/`interface` to a `.utils.ts` or `.service.ts` file, and never add a function to
a `.model.ts` file — this is what used to make `lib/` hard to navigate, and it's the
rule that replaced it.

`shared/services/api.ts` is the only place that calls `fetch`; every call goes
through `get<T>()`, which unwraps the envelope and throws `ApiError` on
`status: "error"` or a non-2xx. `shared/services/dashboard.service.ts` — the React
equivalent of an Angular HTTP service — wraps each cross-domain endpoint in a hook
built on `useResource` (loading/error/reload state) and layers live updates on top
by merging Socket.IO events into the fetched state; see `useLiveStatus` for the
merge-not-replace pattern that avoids a stale snapshot overwriting a socket event
that arrived first. A domain-exclusive endpoint gets its own `<domain>.service.ts`
instead (see `history/history.service.ts`). New data needs a method in `api.ts` and
a hook in the right service file, not a raw `fetch` in a component.

Charts are hand-rolled SVG rather than a charting library (no runtime dependency on
a Pi-served bundle, and it enables the dash-based draw-on-load animation). They
measure their container in real pixels rather than stretching a fixed `viewBox` —
stretching distorts strokes and breaks the draw animation. Follow the existing
pattern in `shared/components/charts/` (`useElementSize` + `shared/utils/svg.ts`
geometry helpers) rather than reaching for a new library.

Below 1024px, `App.tsx` switches to a phone layout (bottom tab bar: Live /
History / Alarms) instead of a CSS-only responsive reflow — check both layouts
when changing shell/navigation code. The view switch itself lives in
`shared/components/shell/Body.tsx`; the two page shells are
`shared/components/shell/LayoutMobile.tsx` and `LayoutDesktop.tsx`.

`oxlint` (`.oxlintrc.json`) is the linter, not ESLint; `tsc -b --noEmit` is the
type check; Prettier (`.prettierrc`) is the formatter — run `npm run format`
(or `make format`) rather than hand-wrapping lines or picking quote style
yourself. All three run in CI and via `make check` / `make lint` / `make
typecheck` / `make format`.

### Firmware

Single source file, [firmware/src/main.cpp](firmware/src/main.cpp), shared by
all three boards; `#define NODE_TYPE` (1/2/3) gates the sensors read and the
payload sent via `#if`/`switch` on that constant. When editing shared logic,
verify all three node types still compile (`make firmware`), not just the one
you're testing against.

### CI / release (`.github/workflows/ci.yml`)

Three independent jobs (backend, frontend, firmware) must pass before a
`release` job runs (main branch only): it packages `backend/`,
`frontend/dist/`, and `deploy/` into a checksummed tarball and publishes a
GitHub release. The Raspberry Pi's `hermes-update.timer` polls for new
releases, verifies the checksum, and does an atomic symlink-swap deploy with
automatic rollback on a failed health check — see
[deploy/README.md](deploy/README.md) for the full mechanics. There is no push
deploy: the Pi always pulls.

## Conventions worth knowing before editing

- Docstrings and comments explain *why*, not what — match that style; a
  one-line justification for a non-obvious choice (like the `workers = 1` or
  `NODE_TYPE` notes above) is expected, not optional.
- Domain services take their collaborators (repository, clock, publisher,
  notifier) as constructor arguments typed as ports/protocols — never import
  `infrastructure/` from `domain/`.
- `except Exception` is used sparingly and only with an inline `# noqa:
  BLE001` comment explaining why the broad catch is intentional (e.g. "a job
  must never kill its thread") — don't add a bare `except:` or a silent
  broad catch without that justification.

## Coding standards

These are enforced by review, not just convention — the codebase already
follows them; keep it that way rather than let a "quick addition" erode it.

- **Clean architecture, always.** Business logic lives in `domain/` and knows
  nothing about Flask, SQLite, HTTP, or Socket.IO — it depends only on the
  `Protocol`s in `domain/ports.py`. Never import `infrastructure/` (or
  Flask/`flask_*`) from `domain/`. On the frontend, the equivalent boundary is
  `shared/services/` / `hooks/`: components render, service hooks fetch and
  subscribe, `shared/utils/` and each domain's `<domain>.utils.ts` hold pure
  logic — a component should not call `fetch` or touch `localStorage`/`socket`
  directly.
- **Don't reinvent the wheel.** Before writing a formatter, a date helper, an
  SVG geometry calc, or an HTTP wrapper, check `shared/utils/` and
  `shared/services/` — `format.ts`, `dates.ts`, `metrics.ts`, `svg.ts`, `api.ts`
  almost certainly already have it or are where it belongs. If the need is
  specific to one domain, check that domain's `<domain>.utils.ts` first. Same
  on the backend: check `domain/catalog.py` before hardcoding a room, sensor,
  or metric anywhere, and `domain/validation.py` before writing a new payload
  check.
- **Separation of concerns.** One file, one job: a repository talks to
  SQLite and nothing else; a service holds business rules and takes its
  repository as a dependency; an API blueprint parses the request, calls a
  service, and shapes the response — it does not contain business logic. On
  the frontend, a `<domain>/<Domain>View.tsx` composes components and owns
  layout; a `components/*` file renders one concern; a `.service.ts` owns
  fetching/state for its domain (or `shared/services/` for cross-domain data);
  a `.utils.ts` function is pure and has no React or DOM dependency; a
  `.model.ts` file holds only types, never a function.
- **Small components, single responsibility.** If a component needs a comment
  to explain "this part does X, this part does Y", it's probably two
  components. Prefer composition (see `live/LiveView.tsx` composing
  `HeroMetric`, `GasPanel`, `RoomComparison`, `AlarmTable`) over one file that
  branches internally on what it's showing. This is a file-count rule as much
  as a design rule — see "one component per file" below.
- **One React component per file; types live in `.model.ts`, not inline.**
  Covered in full under Frontend architecture above — every `.tsx` exports
  exactly one component, and its props type lives in its own
  `ComponentName.model.ts` under the nearest `models/` folder, never declared
  inline in the component. A file that needs a second component (even a small
  private one) means that second component gets its own file and is imported,
  not defined nested inside the first.
- **No `any`.** TypeScript: never `any` or `as any` — an untyped API boundary
  gets a real interface in `shared/models/types.ts`, and `Envelope<T>` in
  `shared/services/api.ts` is the pattern for a generic-but-typed response
  wrapper. Python: mypy runs with `disallow_untyped_defs` and `warn_return_any`
  — every new function gets full type annotations, and `Any` is a last resort,
  not a shortcut.
- **Reuse the custom components already built** before adding a new one:
  `AnimatedValue` for any numeric readout, `ChartStatus` for a chart canvas's
  loading/error/empty state, `StatusNote` for an inline loading/error/empty
  line inside a panel, `Reveal`/`useInView` for scroll-triggered animation,
  `cn()` (`shared/utils/cn.ts`) for conditional class merging — never
  `clsx`/`twMerge` called directly, never string-concatenated class names. All
  three live in `shared/components/common/`.
- **Don't repeat the same style twice — centralize it.** If you're about to
  write the same Tailwind class combination, the same status-tone ternary
  (`error ? 'text-signal-alert' : …`), or the same formatting logic in a
  second place, stop and extract it instead — to a `.utils.ts` for logic, to
  `shared/components/common/` for a UI fragment reused across otherwise-
  unrelated panels. `StatusNote` exists precisely because that ternary had
  already been copy-pasted across `AlarmTable`, `AlarmCards`, `GasPanel`,
  `RoomComparison`, and `CompareStats`; treat a third occurrence of anything
  as the signal to extract, not the second copy-paste.

### Domain-driven design

- **The domain layer models the business, not the database or the UI.**
  Backend: `domain/models.py` holds entities (`SensorReading`, `Alarm`,
  `NodeStatus`, …) expressed in the installation's own vocabulary — the same
  words the README and the Telegram messages use (room, sensor, metric,
  alarm, threshold, release) — not column names or DTO shapes. `domain/ports.py`
  declares the interfaces the domain needs (repositories, `Clock`,
  `Notifier`); `infrastructure/` supplies the technical implementation behind
  those interfaces. The domain never adapts itself to a technology; the
  technology adapts to the domain.
- **`domain/catalog.py` is the ubiquitous language.** Room ids, sensor ids,
  metric ids, and their labels/units/ranges are defined exactly once there,
  and every layer — validation, persistence, the API, the frontend's
  `shared/utils/metrics.ts` labels — uses those same identifiers rather than
  inventing parallel spellings. If you need a new domain concept (a new
  metric, a new kind of alarm), name it there first and let every layer read
  that name, rather than hardcoding a string in whichever layer you're
  editing. On the frontend, `shared/models/types.ts` mirrors this: it's the
  wire-type contract mirroring `hermes/api/schemas.py`, where the domain
  shapes (`Alarm`, `Room`, `Metric`, `Status`) live — deliberately kept as one
  file rather than split, since it documents the API surface as a single
  contract. `shared/utils/metrics.ts` holds the well-known id constants
  (`KITCHEN`, `BEDROOM`, `OUTSIDE`, mirroring `catalog.py`'s own) — use those
  instead of a bare string literal for a fallback default.
  Do not confuse either of these with a component's `ComponentName.model.ts`
  — those hold view/props types (a UI concern) rather than domain types.
  Domain vocabulary belongs in `domain/models.py` / `shared/models/types.ts`;
  view-shape vocabulary belongs in the `models/` folder next to the component
  that owns it, and domain-exclusive data shapes (e.g. `DayRow` in
  `history/models/history.model.ts`) belong in that domain's own `models/`.
- **Business rules stay in domain services, not in repositories, API
  blueprints, or components.** `AlarmService._apply`'s hysteresis logic (open
  above threshold, close below `threshold * release`) is the rule that
  matters to the business; `SqliteAlarmRepository` only knows how to read and
  write rows. A repository method name describes what's stored (`find_active`,
  `touch_peak`), never a business decision. Keep that split when adding
  anything: if you're tempted to put an `if` that encodes a business rule
  into a repository, an API blueprint, or a `.service.ts` fetcher, it belongs
  in a domain service instead.
