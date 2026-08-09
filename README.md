# HERMES
Home Environmental Real-time Monitoring &amp; Event System

# 🏠 Technical Specifications - IoT Home Automation System with Raspberry Pi Zero

Technical specification document for a real-time home environmental monitoring system (Kitchen Gas/Smoke, Kitchen Environment, and Bedroom Environment). Features an architecture based on 3 Wi-Fi microcontrollers, a Flask server with WebSockets, efficient database management (Downsampling), and a bidirectional Telegram Bot (automatic alerts + interactive chat).

---

## 1. Bill of Materials (BOM)

| Component | Quantity | Usage / Notes |
| :--- | :--- | :--- |
| **Raspberry Pi Zero** | 1x | Central Backend Server, SQLite DB, WebSocket & Telegram Bot |
| **NodeMCU ESP8266 (Type-C)** | 3x | Wi-Fi Microcontrollers (Kitchen Gas, Kitchen Environment, Bedroom) |
| **DHT22 PCB Module** | 2x | High-precision temperature and humidity sensors |
| **MQ-2 PCB Module** | 1x | Gas Leak / Smoke Sensor (Kitchen Node A) |
| **MQ-135 PCB Module** | 2x | Air Quality / CO2 / VOC Sensors (Kitchen Node B & Bedroom Node) |
| **Dupont Jumpers F-F (20cm)** | 1x (Pack of 40) | Female-to-Female jumper wires |

---

## 2. Wiring Diagram (Pinout for the 3 Nodes)

Each NodeMCU is powered via a USB Type-C port (5V). No soldering required: connections use Female-to-Female Dupont jumper wires.

### 🚨 Kitchen Node A: Gas/Smoke Safety (NodeMCU #1)
* **MQ-2 (Gas / Smoke):**
  * `VCC` ──► **VIN** / 5V (NodeMCU)
  * `GND` ──► **GND** (NodeMCU)
  * `AO` (Analog Out) ──► **A0** (NodeMCU)

### 🍳 Kitchen Node B: Kitchen Environment (NodeMCU #2)
* **DHT22 (Temperature / Humidity):**
  * `+` (VCC) ──► **3V3** (NodeMCU)
  * `-` (GND) ──► **GND** (NodeMCU)
  * `out` (DAT) ──► **D4** / GPIO2 (NodeMCU)
* **MQ-135 (Air Quality):**
  * `VCC` ──► **VIN** / 5V (NodeMCU)
  * `GND` ──► **GND** (NodeMCU)
  * `AO` (Analog Out) ──► **A0** (NodeMCU)

### 🛏️ Bedroom Node: Room Environment (NodeMCU #3)
* **DHT22 (Temperature / Humidity):**
  * `+` (VCC) ──► **3V3** (NodeMCU)
  * `-` (GND) ──► **GND** (NodeMCU)
  * `out` (DAT) ──► **D4** / GPIO2 (NodeMCU)
* **MQ-135 (Air Quality):**
  * `VCC` ──► **VIN** / 5V (NodeMCU)
  * `GND` ──► **GND** (NodeMCU)
  * `AO` (Analog Out) ──► **A0** (NodeMCU)

---

## 3. Network Architecture & Communication

```text
  [ KITCHEN A: GAS/SMOKE ]
  NodeMCU #1 (MQ-2)             ─── HTTP POST (30s) ──┐
                                                      │
  [ KITCHEN B: ENVIRONMENT ]                          │             [ RASPBERRY PI ZERO ]
  NodeMCU #2 (DHT22 + MQ-135)   ─── HTTP POST (30s) ──┼──► WI-FI ──► Flask Server + SocketIO
                                                      │   ROUTER    ├── SQLite DB (Downsampling)
  [ BEDROOM: ENVIRONMENT ]                            │             ├── Web Dashboard (WebSocket)
  NodeMCU #3 (DHT22 + MQ-135)   ─── HTTP POST (30s) ──┘             └── Telegram Bot (Alerts + Chat)

---

## 4. Software Architecture

### Backend (`backend/`)

Layered so that the business rules never import Flask, SQLite or `requests`.
Services depend on protocols (`hermes/domain/ports.py`); the concrete adapters
are wired once in `hermes/container.py`.

```text
backend/
├── app.py                     Entry point (create_app + socketio.run)
├── hermes/
│   ├── config.py              Settings, resolved from the environment
│   ├── container.py           Composition root — the only place wiring happens
│   ├── factory.py             Flask/SocketIO app factory + background jobs
│   ├── domain/                Pure business logic, no framework imports
│   │   ├── catalog.py         Rooms, sensors, metrics — the installation
│   │   ├── models.py          Entities (SensorReading, Alarm, NodeStatus, …)
│   │   ├── ports.py           Protocols the services depend on
│   │   ├── validation.py      Node payload validation
│   │   └── services/          ingestion · readings · alarms · nodes ·
│   │                          retention · weather
│   ├── infrastructure/        Adapters that implement the ports
│   │   ├── db/                SQLite repositories + migrations
│   │   ├── notifications/     Telegram
│   │   ├── realtime/          Socket.IO publisher
│   │   ├── weather/           Open-Meteo + IP geolocation
│   │   └── jobs/              Periodic job scheduler
│   └── api/                   Flask blueprints, schemas, error handlers
├── tests/                     pytest suite (domain + API)
└── scripts/seed_demo.py       Generates plausible data for development
```

**Alarms** are stateful: an alarm opens when a metric crosses its threshold,
tracks its peak while the condition holds, and closes when the value falls back
under a release band. Every event therefore has a real duration, and a flapping
sensor cannot spam Telegram. A watchdog raises a `node` alarm for any board
that goes silent, and clears it when the board returns.

**Retention** keeps raw samples for 7 days and rolls everything older into
hourly averages, kept forever. Reads merge both tables transparently and report
which resolution each day came from.

**Outdoor data** has no sensor in the BOM, so it is fetched from Open-Meteo and
stored under a synthetic `outside` room — meaning it flows through exactly the
same queries, charts and downsampling as the real nodes. The installation's
location is fixed to Pisa; override it with `HERMES_LATITUDE`/`HERMES_LONGITUDE`
or switch outdoor data off with `WEATHER_ENABLED=false`. See
`backend/.env.example`.

### API

| Method | Endpoint | Purpose |
| :--- | :--- | :--- |
| `POST` | `/api/air-quality/data` | Node ingestion, every 30s — requires `X-Hermes-Token` when configured |
| `GET` | `/api/air-quality/status` | Latest value of every metric, per room |
| `GET` | `/api/air-quality/history` | Hourly aggregates — `?room=&metric=&hours=` |
| `GET` | `/api/air-quality/daily` | Daily min/avg/max — `?room=&metric=&from=&to=&offset=` |
| `GET` | `/api/alarms` | Alarm log — `?days=&room=&limit=` |
| `GET` | `/api/nodes` | Per-board liveness |
| `GET` | `/api/meta` | Rooms, metrics, thresholds, retention, outdoor location |
| `GET` | `/api/health` | Liveness probe |

Socket.IO events: `sensor_update`, `fire_alert`, `alarm_opened`,
`alarm_closed`, `node_status`.

Every response uses one envelope — `{"status": "success", "data": …}` or
`{"status": "error", "message": …, "errors": {…}}`.

### Frontend (`frontend/`)

React 19 + Vite + Tailwind v4. Charts are hand-built SVG rather than a charting
library: at this size each series is a single path, which keeps the bundle
small enough to serve from a Pi Zero and makes the draw-on-load animation
possible.

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

Below 1024px the phone layout takes over, with Live / History / Alarms in a
bottom tab bar; above it, the desktop instrument layout carries the alarm log
inside the live view.

---

## 5. Deployment

The Raspberry Pi runs a single process: Flask serves the API **and** the
compiled dashboard, so the device needs neither nginx nor Node. It never builds
anything — GitHub Actions compiles the frontend and publishes a release, and a
systemd timer on the Pi installs it.

```
push to main → CI (tests · build · firmware) → release tarball
             → the Pi pulls it within ~5 min, installs atomically,
               health-checks, and rolls back if it fails
```

Setup and day-to-day operation are in [deploy/README.md](deploy/README.md).

**Remote access** is via Tailscale: the Pi keeps no ports open to the internet,
and reaching the dashboard requires your identity plus a device you approved.

**The sensor nodes authenticate.** They speak plain HTTP over the LAN — an
ESP8266 cannot join the VPN — so `POST /api/air-quality/data` requires the
`X-Hermes-Token` header matching `INGEST_TOKEN`. Without it, anything on your
Wi-Fi could inject readings, including a fake gas alarm that reaches Telegram.
The token is optional: unset, ingestion stays open for local development.

---

## 6. Running it locally

```bash
# Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env          # optional: Telegram, thresholds, location
python app.py                 # http://localhost:5001

# Frontend
cd frontend
npm install
npm run dev                   # http://localhost:5173, proxied to :5001
```

Development without hardware:

```bash
cd backend
python scripts/seed_demo.py            # writes hermes-demo.db, 21 days of data
DATABASE_PATH=hermes-demo.db python app.py
```

Checks:

```bash
cd backend  && python -m pytest && python -m mypy hermes
cd frontend && npm run typecheck && npm run lint && npm run build
```
