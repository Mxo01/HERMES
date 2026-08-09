# HERMES on the Raspberry Pi

This document explains what runs on the Pi, how it got there, and what happens
when you push code. If you only want the commands, jump to
[Install](#2-install) and [Everyday commands](#7-everyday-commands).

---

## 1. What actually runs

One process. That is the whole design.

```text
                    ┌─────────────────────────────────────────────┐
                    │  Raspberry Pi                               │
  ESP8266 nodes ───►│  gunicorn ──► Flask                         │
  (HTTP, LAN)       │              ├── /api/…      the API        │
                    │              └── /           the dashboard  │
                    │                                             │
                    │  SQLite  /opt/hermes/shared/data/hermes.db  │
                    │                                             │
   You, anywhere ──►│  Tailscale (WireGuard, no open ports)       │
                    └─────────────────────────────────────────────┘
                              ▲
                              │ pulls releases
                    ┌─────────┴───────────┐
                    │  GitHub Actions     │
                    │  tests + builds     │
                    └─────────────────────┘
```

Flask serves the API **and** the compiled dashboard on the same origin, so:

* **No nginx.** Nothing to configure, nothing else to keep patched.
* **No Node on the Pi.** The dashboard arrives already compiled. An original
  Pi Zero is ARMv6 with 512 MB — `npm run build` there is impractical.
* **No CORS.** The browser only ever talks to one origin.

Two systemd units and one timer manage all of it:

| Unit | Type | What it does |
| :--- | :--- | :--- |
| `hermes.service` | long-running | The application. Starts at boot, restarts on crash. |
| `hermes-update.timer` | timer | Fires every 5 minutes and 3 minutes after boot. |
| `hermes-update.service` | one-shot | The updater the timer runs. |

---

## 2. Install

On a fresh Raspberry Pi OS (Bookworm or newer):

```bash
git clone https://github.com/Mxo01/HERMES.git
cd HERMES/deploy
sudo ./install.sh
```

The script is idempotent — running it again repairs the layout without touching
your database or configuration. Step by step, it:

1. **Installs system packages** — Python, `venv`, `curl`, a compiler (some
   Python wheels are built from source on ARMv6).
2. **Creates the `hermes` system user.** The application runs as an unprivileged
   user that cannot log in.
3. **Builds the directory layout** under `/opt/hermes` (§6).
4. **Generates secrets.** A `SECRET_KEY` and an `INGEST_TOKEN`, written to
   `shared/hermes.env` with mode `600`. Both are random and unique to your
   installation.
5. **Creates the Python environment.**
6. **Installs the systemd units** and the updater.
7. **Pulls the first release** by running the updater immediately.
8. **Enables the service and the timer**, so both survive a reboot.

When it finishes it prints the dashboard URL and the node token.

---

## 3. Reaching it from outside the house

Tailscale, because it is the only option where **the Pi is never reachable from
the internet**. There is no open port for a scanner to find. Access requires
signing in as you *and* the device being one you approved.

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

Install Tailscale on your phone and laptop, sign in with the same account, and
the dashboard answers at `http://<pi-name>:5001` from anywhere — same address at
home and away.

Optionally, HTTPS and a proper hostname inside your tailnet:

```bash
sudo tailscale serve --bg --https 443 http://127.0.0.1:5001
```

> **Do not port-forward 5001 on the router instead.** The dashboard has no
> login screen: the network *is* the boundary. Exposing it publicly hands your
> home sensor data — and the ability to fake a gas alarm — to anyone who finds
> the address.

---

## 4. Flashing the sensor nodes

Read the token the installer generated:

```bash
sudo grep INGEST_TOKEN /opt/hermes/shared/hermes.env
```

In `firmware/src/main.cpp` set:

* `DEVICE_TOKEN` — the token above
* `SERVER_IP` — the Pi's address **on the LAN**, not its Tailscale one; the
  nodes are on your Wi-Fi
* `NODE_TYPE` — `1`, `2` or `3`, changed and reflashed for each board

The nodes speak plain HTTP: an ESP8266 cannot join the VPN. The token is what
stops anything else on your Wi-Fi from injecting readings.

A node with the wrong token gets `401` and its readings are discarded. Watch its
serial output at 115200 baud to see the status code it receives.

---

## 5. How an update travels

You push to `main`. Nothing else is required of you.

**On GitHub.** CI runs the backend tests and type checks, builds the dashboard,
and compiles the firmware for all three node types. Only if everything passes
does it package `backend/`, the compiled `frontend/dist/` and `deploy/` into a
tarball, publish it as a release with a SHA-256 checksum, and stop there. Your
`.env`, the databases and the virtualenv are excluded.

**On the Pi.** Within five minutes the timer runs the updater, which:

1. Asks GitHub for the latest release and compares its tag with the running
   version. Same tag, nothing to do — this is the usual case, and it costs one
   API call.
2. Downloads the tarball and **verifies the checksum**. A mismatch aborts before
   anything is unpacked.
3. Unpacks it into `releases/<tag>`, *beside* the running version. Nothing is
   overwritten.
4. Reinstalls Python dependencies **only if `requirements.txt` changed** —
   otherwise every deploy would cost minutes on a Pi Zero.
5. Flips the `current` symlink in a single atomic step. There is no moment where
   `current` is missing or half-written.
6. Restarts the service and polls `/api/health` for up to a minute.
7. **If it never becomes healthy**, points `current` back at the previous
   release, restarts, and exits with an error. The Pi keeps serving the version
   that worked.
8. Prunes old releases, keeping the last three.
9. Replaces itself with the updater from the new release — last, and atomically,
   so the copy currently executing stays intact.

```text
  releases/v11-9f2a1c3   ← previous, kept for rollback
  releases/v12-a1b2c3d   ← new
  current ──────────────► v12-a1b2c3d      (one atomic move)
                          │
                    health check fails?
                          ▼
  current ──────────────► v11-9f2a1c3      (back where it was)
```

**No credentials live on GitHub.** The Pi pulls; nothing pushes to it. That also
means the Pi does not need to be reachable from the internet for deploys to
work — which is exactly what makes the Tailscale-only setup possible.

A Pi that was switched off catches up by itself: the timer has `Persistent=true`
and fires three minutes after boot.

To apply an update immediately instead of waiting:

```bash
sudo /opt/hermes/bin/update.sh
```

---

## 6. Directory layout

```text
/opt/hermes/
├── current -> releases/v12-a1b2c3d    the live version (a symlink)
├── releases/
│   ├── v12-a1b2c3d/                   backend · frontend/dist · deploy
│   ├── v11-9f2a1c3/                   kept for rollback
│   └── v10-77e4b8a/
├── shared/                            never touched by a deploy
│   ├── hermes.env                     configuration and secrets (mode 600)
│   ├── deploy.env                     which repository to pull from
│   └── data/hermes.db                 the database
├── venv/                              Python environment
└── bin/update.sh                      the updater
```

The split is the point: **releases are disposable, `shared/` is not.** The
database lives outside the release directory, so a deploy — or a rollback, or
deleting every release — cannot lose your data. `hermes.service` enforces this
too: `ProtectSystem=strict` makes the whole filesystem read-only for the
service, with `shared/` the single exception it may write to.

---

## 7. Everyday commands

| | |
| :--- | :--- |
| Is it running? | `systemctl status hermes` |
| Follow the logs | `journalctl -u hermes -f` |
| Deploy history | `journalctl -u hermes-update --since today` |
| Next update check | `systemctl list-timers hermes-update` |
| Which version is live? | `cat /opt/hermes/current/VERSION` |
| Update now | `sudo /opt/hermes/bin/update.sh` |
| Change configuration | `sudo nano /opt/hermes/shared/hermes.env` then `sudo systemctl restart hermes` |
| Back up the data | `sudo sqlite3 /opt/hermes/shared/data/hermes.db ".backup /tmp/hermes-backup.db"` |

Rolling back by hand — every kept release is one symlink away:

```bash
ls /opt/hermes/releases
sudo ln -sfn /opt/hermes/releases/v11-9f2a1c3 /opt/hermes/current
sudo systemctl restart hermes
```

Pausing automatic updates, for instance while you are away:

```bash
sudo systemctl stop hermes-update.timer      # resume with `start`
```

---

## 8. When something breaks

**The dashboard does not answer.**

```bash
systemctl status hermes
journalctl -u hermes -n 50
```

The service restarts itself every 5 seconds and gives up after 5 failures in
5 minutes, so a service that stays down is a bad configuration rather than a
crash loop. The most common cause is a malformed `shared/hermes.env`.

**Updates stopped arriving.**

```bash
journalctl -u hermes-update -n 50
systemctl list-timers hermes-update
```

Usually GitHub is unreachable, or the repository is private and
`shared/deploy.env` has no `GITHUB_TOKEN`.

**A deploy rolled back.** The journal names the release it rejected. The Pi is
still serving the previous version, so nothing is on fire: reproduce it locally
with `make serve`, which runs the same gunicorn setup.

**A node shows as offline.** The dashboard flags any board silent for more than
five minutes. Check its serial output: `401` means `DEVICE_TOKEN` does not match
`INGEST_TOKEN`; a connection error usually means `SERVER_IP` is wrong or the
board fell off the Wi-Fi.

**The dashboard loads but has no data.** The nodes are not reaching the Pi.
Confirm by hand from any machine on the LAN:

```bash
curl -X POST http://<pi-ip>:5001/api/air-quality/data \
  -H 'Content-Type: application/json' \
  -H 'X-Hermes-Token: <the token>' \
  -d '{"room":"kitchen","sensor":"mq2","gas":42}'
```

`201` means the server side is fine and the problem is on the node.

**The first install is slow.** On an original Pi Zero some Python packages
compile from source. It happens once, and again only when dependencies change.
