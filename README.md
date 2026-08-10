# HERMES

**H**ome **E**nvironmental **R**eal-time **M**onitoring & **E**vent **S**ystem

A home environmental monitoring system: three Wi-Fi sensor nodes report
temperature, humidity, air quality and gas to a Raspberry Pi, which stores the
readings, raises alarms, notifies over Telegram and serves a live dashboard.

|  |  |
| :--- | :--- |
| **Sensing** | 3× NodeMCU ESP8266 posting over HTTP every 30s |
| **Server** | Flask + Socket.IO + SQLite on a Raspberry Pi Zero |
| **Dashboard** | React 19 + Vite, served by the same Flask process |
| **Alerting** | Stateful alarm engine, Telegram notifications |
| **Retention** | Raw samples for 7 days, hourly averages forever |
| **Remote access** | Tailscale — no ports open to the internet |
| **Updates** | Push to `main`; the Pi installs the new release by itself |

---

## 1. Bill of Materials

| Component | Quantity | Usage / Notes |
| :--- | :--- | :--- |
| **Raspberry Pi Zero** | 1× | Server, SQLite database, dashboard, Telegram bot |
| **NodeMCU ESP8266 (Type-C)** | 3× | Sensor nodes (Kitchen Gas, Kitchen Environment, Bedroom) |
| **DHT22 PCB Module** | 2× | Temperature and humidity |
| **MQ-2 PCB Module** | 1× | Gas leak / smoke (Kitchen Node A) |
| **MQ-135 PCB Module** | 2× | Air quality / CO2 / VOC (Kitchen Node B & Bedroom) |
| **Dupont Jumpers F-F (20cm)** | 1× (pack of 40) | Female-to-female jumper wires |

---

## 2. Wiring

Each NodeMCU is powered over USB Type-C (5V). No soldering required.

### 🚨 Kitchen Node A — Gas / smoke safety (NodeMCU #1)

* **MQ-2 (gas / smoke)**
  * `VCC` ──► **VIN** / 5V
  * `GND` ──► **GND**
  * `AO` ──► **A0**

### 🍳 Kitchen Node B — Kitchen environment (NodeMCU #2)

* **DHT22 (temperature / humidity)**
  * `+` ──► **3V3**
  * `-` ──► **GND**
  * `out` ──► **D2** / GPIO4
* **MQ-135 (air quality)**
  * `VCC` ──► **VIN** / 5V
  * `GND` ──► **GND**
  * `AO` ──► **A0**

### 🛏️ Bedroom Node — Room environment (NodeMCU #3)

Identical to Kitchen Node B.

> **Two things to check before powering up.**
>
> **The DHT22 data pin must match the firmware.** `firmware/src/main.cpp`
> declares `DHT_PIN D2` (GPIO4). If you wire to D4 (GPIO2) instead, the sensor
> reads `NaN`, the node skips every send, and it will show as offline. D2 is
> the safer choice: GPIO2 is a boot-strapping pin and also drives the onboard
> LED.
>
> **The MQ modules output up to 5V on `AO`, but `A0` tolerates 3.3V.** Powered
> from VIN as shown, a saturated sensor can push the analog input past its
> rating — precisely in the range where a gas alarm lives. A resistor divider
> on `AO` keeps the reading honest and the ADC intact.

---

## 3. Network architecture

```text
 [ KITCHEN A: GAS/SMOKE ]
 NodeMCU #1 (MQ-2)            ── HTTP POST (30s) ─┐
                                                  │
 [ KITCHEN B: ENVIRONMENT ]                       │          [ RASPBERRY PI ZERO ]
 NodeMCU #2 (DHT22 + MQ-135)  ── HTTP POST (30s) ─┼── WI-FI ─► Flask + Socket.IO
                                                  │  ROUTER   ├── SQLite (downsampling)
 [ BEDROOM: ENVIRONMENT ]                         │           ├── Dashboard (WebSocket)
 NodeMCU #3 (DHT22 + MQ-135)  ── HTTP POST (30s) ─┘           └── Telegram alerts
                                                                       │
                                              Tailscale ───────────────┘
                                              (phone / laptop, from anywhere)
```

The nodes speak plain HTTP on the LAN and authenticate with a shared token.
Everything reaching the dashboard from outside the house goes through Tailscale;
nothing is exposed to the internet.

---

## 4. How it works

### 4.1 The life of a reading

Every 30 seconds each node wakes up, samples its sensors and posts one JSON
object. Following that object through the system explains most of the design.

```json
{ "room": "kitchen", "sensor": "mq135",
  "temperature": 21.4, "humidity": 54, "aq": 62 }
```

**1 — Authentication.** If `INGEST_TOKEN` is configured, the request must carry
a matching `X-Hermes-Token` header, compared in constant time. This is the only
write endpoint in the system, and the nodes cannot join the VPN that protects
everything else, so without the token anything on the same Wi-Fi could inject
readings — including a fake gas spike that reaches Telegram.

**2 — Validation.** The payload is checked against the *catalog*, the single
description of the installation (`hermes/domain/catalog.py`): which rooms exist,
which sensor boards exist, which metrics each board must report, and the range a
plausible reading falls into. A payload missing a metric its sensor is supposed
to send, or carrying a value outside that range, is rejected with one error per
offending field, so a miswired node says exactly what is wrong.

| Sensor | Must report | Accepted range |
| :--- | :--- | :--- |
| `mq2` | `gas` | 0 – 1023 (raw ADC) |
| `mq135` | `temperature` | −40 – 60 °C |
| | `humidity` | 0 – 100 % |
| | `aq` | 0 – 1023 (raw ADC) |

**3 — Storage.** Each metric becomes one row in `readings`. The table is
deliberately narrow — `(domain, room, metric, value, timestamp)` — rather than a
column per sensor, so adding a metric later never means a schema migration.

**4 — Liveness.** The node is marked as seen. If it had an open "offline" alarm,
that alarm is closed now with the duration it was away.

**5 — Broadcast.** A `sensor_update` event goes out over Socket.IO, so any open
dashboard updates its numbers immediately instead of waiting to poll.

**6 — Alarm evaluation.** Every rule that applies to the metrics in the payload
is evaluated (§4.3).

The node gets `201 Created` back. It ignores the body; only the status code
matters, and even that is only logged to serial.

### 4.2 Storage and retention

At 30 seconds per node the raw table grows by roughly 8,600 rows a day. Left
alone it would fill a Pi Zero's SD card and slow every query, so HERMES keeps
two tables:

| Table | Holds | Kept |
| :--- | :--- | :--- |
| `readings` | Every individual sample | 7 days |
| `hourly_aggregates` | Per hour: average, minimum, maximum, sample count | Forever |

Once an hour, a background job rolls everything older than the retention window
into hourly rows and deletes the raw samples it summarised. Long-term trends
survive; the file stays small.

Queries never expose this split. A request spanning three weeks reads recent
hours from `readings` and older ones from `hourly_aggregates`, merges them, and
where both contain the same hour the raw rows win because they are the finer
source. The history view labels each day `RAW 30s` or `HOURLY AVG` so you can
always see which resolution you are looking at.

Daily summaries take a timezone offset, so days break at *your* midnight rather
than UTC's — otherwise the evening cooking spike would land on the wrong day.

### 4.3 The alarm engine

Alarms are **stateful**, not one row per breaching sample. An alarm opens when a
metric crosses its threshold, tracks its peak while the condition holds, and
closes only when the value falls back under a release band at 90% of the
threshold.

```text
value ─┐                    ▲ peak tracked
       │      ┌──────┐      │
threshold ────┼──────┼──────────────  alarm opens
release  ─────┼──────┼──────────────  alarm closes below here
       └──────┘      └──────────
        opens        closes
        └──── one alarm, real duration ────┘
```

Two consequences fall out of this. Every event carries an honest duration
instead of being a scatter of instants. And a sensor hovering right at its
threshold produces one alarm, not hundreds — which is what stops Telegram from
being spammed.

| Rule | Threshold | Severity | Notifies Telegram |
| :--- | :--- | :--- | :--- |
| Gas / smoke | `gas` > 150 | High | Yes |
| Air quality | `aq` > 300 | Medium | No |
| Humidity | `humidity` > 70 | Medium | No |
| Node offline | no reading for 5 min | Low | No |

All thresholds are configurable. A database index enforces the core invariant —
at most one open alarm per room, kind, metric and board — and the repository
treats a conflict as "already open" rather than an error, so the ingestion path
and the watchdog can race without producing a 500.

### 4.4 Node liveness

The dashboard needs to distinguish "the kitchen is genuinely stable" from "the
kitchen node died an hour ago". Liveness is derived from the last reading each
board posted, with no extra heartbeat protocol:

| State | Last reading |
| :--- | :--- |
| **Online** | under 90s ago |
| **Delayed** | 90s – 5 min ago |
| **Offline** | over 5 min ago |
| **Unknown** | never reported |

A board is identified by its room and sensor type, which is enough to tell the
three nodes apart. A watchdog runs every minute and opens a low-severity alarm
for anything offline; the next reading from that board closes it, recording how
long it was away.

### 4.5 Outdoor conditions

The dashboard compares every room against the outdoors — a bedroom at 24 °C
means something different in January than in August. The BOM has no outdoor
sensor, so those readings come from [Open-Meteo](https://open-meteo.com)
(keyless, free for non-commercial use) for the installation's location, fixed to
Pisa.

The trick is where they are stored: under a synthetic room called `outside`, in
the same table as everything else. Outdoor data therefore flows through exactly
the same queries, charts, downsampling and history as the real nodes, and no
code anywhere has a special case for it. The only thing `outside` cannot do is
accept a POST — it is not a room a node may report for.

A job refreshes the current conditions every 15 minutes and backfills hourly
history every 6 hours. Any failure degrades to "no outdoor data" and the
dashboard hides the comparison; it is never a reason to fail a request.

### 4.6 Real-time updates

The dashboard fetches its initial state over HTTP, then keeps up over
Socket.IO:

| Event | Meaning |
| :--- | :--- |
| `sensor_update` | A node posted; the live numbers move |
| `alarm_opened` / `alarm_closed` | The alarm log refetches |
| `fire_alert` | A gas alarm opened |
| `node_status` | The watchdog completed a pass |

If the socket cannot connect the dashboard still works — it simply stops
updating between fetches, and the header shows `SOCKET OFFLINE`.

### 4.7 Notifications

When a gas alarm opens, Telegram receives the room, the value, the threshold,
and any temperature and humidity read at the same moment. Rate limiting lives in
the notifier rather than the alarm engine: the engine already guarantees one
event per breach, so this is a second guard against a flapping sensor.

With no bot token configured the notifier is a no-op and everything else behaves
identically.

### 4.8 Background jobs

Four jobs run in daemon threads inside the single server process. Each owns its
thread and swallows its own errors, so a failing job never takes down the others
or the web server.

| Job | Interval | Purpose |
| :--- | :--- | :--- |
| `downsampling` | 1 hour | Roll old raw samples into hourly averages |
| `node-watchdog` | 1 minute | Raise alarms for silent boards |
| `weather-sync` | 15 minutes | Fetch current outdoor conditions |
| `weather-backfill` | 6 hours | Fill in outdoor hourly history |

---

## 5. Software architecture

### 5.1 Backend

Layered so the business rules never import Flask, SQLite or an HTTP client.
Services depend on protocols declared in `domain/ports.py`; the adapters that
implement them live in `infrastructure/`; everything is wired in one place.
Swapping SQLite for something else, or Telegram for nothing at all, is a change
to `container.py` only — and the tests exercise the real services against
temporary databases with a clock they control.

```text
backend/
├── app.py                     Entry point
├── wsgi.py                    Production entry point (gunicorn)
├── gunicorn.conf.py           Deliberately one worker — see the file
├── hermes/
│   ├── config.py              Settings, resolved once from the environment
│   ├── container.py           Composition root: the only place wiring happens
│   ├── factory.py             App factory + background jobs
│   ├── domain/                Pure business logic, no framework imports
│   │   ├── catalog.py         Rooms, sensors, metrics — the installation
│   │   ├── models.py          Entities: SensorReading, Alarm, NodeStatus, …
│   │   ├── ports.py           Protocols the services depend on
│   │   ├── validation.py      Node payload validation
│   │   └── services/          ingestion · readings · alarms · nodes ·
│   │                          retention · weather
│   ├── infrastructure/        Adapters implementing the ports
│   │   ├── db/                SQLite repositories + migrations
│   │   ├── notifications/     Telegram
│   │   ├── realtime/          Socket.IO publisher
│   │   ├── weather/           Open-Meteo + fixed location
│   │   └── jobs/              Periodic job scheduler
│   └── api/                   Blueprints, schemas, auth, error handlers
├── tests/                     59 tests: domain, API, deployment surface
└── scripts/seed_demo.py       21 days of plausible data, for development
```

The database schema is versioned and migrated automatically at startup, so an
existing installation upgrades in place without manual steps.

### 5.2 API

Every response uses one envelope:

```json
{ "status": "success", "data": … }
{ "status": "error", "message": "…", "errors": { "field": "why" } }
```

| Method | Endpoint | Purpose |
| :--- | :--- | :--- |
| `POST` | `/api/air-quality/data` | Node ingestion — requires `X-Hermes-Token` when configured |
| `GET` | `/api/air-quality/status` | Latest value of every metric, per room |
| `GET` | `/api/air-quality/history` | Hourly aggregates — `?room=&metric=&hours=` (max 720) |
| `GET` | `/api/air-quality/daily` | Daily min/avg/max — `?room=&metric=&from=&to=&offset=` |
| `GET` | `/api/alarms` | Alarm log — `?days=&room=&limit=` |
| `GET` | `/api/nodes` | Per-board liveness |
| `GET` | `/api/meta` | Rooms, metrics, thresholds, retention, outdoor location |
| `GET` | `/api/health` | Liveness probe, used by the deploy health check |

Domain errors are translated centrally: a validation failure becomes a 400 with
per-field messages, a missing token a 401, anything unexpected a logged 500 that
never leaks a stack trace.

### 5.3 Dashboard

React 19, Vite and Tailwind v4, in a dark instrument language: near-black
panels, hairline rules, one monospace face, and colour reserved for the metric
in focus.

```text
frontend/src/
├── App.tsx                    Shell: view routing + responsive switch
├── features/                  live · history · alarms
├── components/
│   ├── charts/                TrendChart · BandChart · Sparkline · Heatmap
│   ├── controls/              Tabs · RangePicker · Pager
│   ├── panels/                HeroMetric · GasPanel · RoomComparison · …
│   └── shell/                 Header · BottomTabs
├── hooks/                     Data fetching, socket, chart pointer, viewport
└── lib/                       API client, types, formatting, SVG geometry
```

**Live** — the selected room and metric as an oversized headline with its
difference from outdoors, 24 hours of trend, a permanent gas panel, all rooms
side by side, a 7×24 heatmap of the week, and the alarm log.

**History** — a date range (calendar or presets), the daily min–max envelope
with the average through it, the second half of the range compared against the
first, and a paginated day-by-day table showing each day's data resolution.

**Alarms** — on phones, a third screen led by the current gas reading, because
an alarm screen opened in a hurry should first answer "is it happening now?".
On desktop the alarm log lives inside the live view, where there is room for the
table.

Gas has a permanent panel rather than being one of the metric tabs: it is the
one reading that is a safety matter, so it must never be a click away.

Charts are hand-built SVG rather than a charting library. At this size each
series is a single path, which costs no runtime dependency on a Pi-served bundle
and makes the draw-on-load animation possible. They measure their container and
draw in real pixels — stretching a fixed viewBox distorts strokes, and the usual
workaround silently breaks the dash-based draw animation. Each chart has a
designed hover readout rather than a native browser tooltip, because comparing
two series at the same instant is the whole point.

Below 1024px a phone layout takes over with Live / History / Alarms in a bottom
tab bar. The bundle is 97 KB gzipped.

---

## 6. Deployment

The Pi runs **one process**: Flask serves the API and the compiled dashboard on
a single origin, so the device needs neither nginx nor Node, and it never builds
anything.

```text
push to main
  → CI: backend tests · mypy · frontend build · firmware compiled for all 3 nodes
  → release tarball published
  → the Pi's timer notices within ~5 minutes
  → downloads, verifies the checksum, unpacks beside the current release
  → flips a symlink atomically, restarts, health-checks
  → rolls back automatically if the new version does not come up
```

Nothing is updated in place, no credentials live on GitHub, and a Pi that was
switched off catches up on its own after it boots.

**Remote access** is via Tailscale: the Pi keeps no ports open to the internet,
and reaching the dashboard needs both your identity and a device you approved.
Do not port-forward instead — the dashboard has no login, because the network is
the boundary.

Setup and day-to-day operation: **[deploy/README.md](deploy/README.md)**.
First time with the physical hardware: **[deploy/BRINGUP.md](deploy/BRINGUP.md)**.

---

## 7. Running it locally

One command. It installs whatever is missing on first use, so a fresh clone
needs nothing else:

```bash
make dev
```

That starts the API on `:5001` and the dashboard on `:5173`, with hot reload on
both. Ctrl-C stops them together.

With no hardware yet, use generated data instead — 21 days of plausible
readings and a handful of alarms:

```bash
make demo
```

| Command | What it does |
| :--- | :--- |
| `make` | List every target |
| `make dev` | Backend + dashboard, hot reload |
| `make demo` | Same, against generated data |
| `make serve` | The production build, exactly as the Pi runs it |
| `make check` | Tests, type checks and lint, both sides |
| `make build` | Compile the dashboard into `frontend/dist` |
| `make firmware` | Compile the firmware for all three node types |
| `make seed` | Regenerate the demo database |
| `make clean` | Remove build output and caches |

Ports are configurable when something else already holds them — the Makefile
checks first and tells you which process is in the way:

```bash
make dev API_PORT=5002 DASH_PORT=5174
```

Requires Python 3.11+ (matching Raspberry Pi OS Bookworm), Node 22+, and
PlatformIO for `make firmware`.

<details>
<summary>Doing it without make</summary>

```bash
# Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env          # optional: Telegram, thresholds, location
python app.py                 # http://localhost:5001

# Frontend, in another shell
cd frontend
npm install
npm run dev                   # http://localhost:5173, proxied to :5001
```

</details>

---

## 8. Configuration

Everything is environment variables, documented with defaults in
[backend/.env.example](backend/.env.example). The ones that matter most:

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `DATABASE_PATH` | `domotic.db` | SQLite file |
| `FRONTEND_DIST` | `../frontend/dist` | Compiled dashboard to serve |
| `INGEST_TOKEN` | *(unset)* | Shared secret the nodes must send |
| `CORS_ORIGINS` | *(unset)* | Empty means same-origin only |
| `GAS_ALERT_THRESHOLD` | `150` | Raw ADC value that opens a gas alarm |
| `AQ_ALERT_THRESHOLD` | `300` | Air quality alarm threshold |
| `HUMIDITY_ALERT_THRESHOLD` | `70` | Humidity alarm threshold, % |
| `NODE_OFFLINE_AFTER` | `300` | Seconds of silence before a node is offline |
| `DOWNSAMPLING_KEEP_DAYS` | `7` | How long raw samples are kept |
| `TELEGRAM_BOT_TOKEN` | *(unset)* | Unset disables notifications entirely |
| `WEATHER_ENABLED` | `true` | `false` turns outdoor data off |
