# Running HERMES on the Raspberry Pi

The Pi runs one process: Flask serves the API *and* the compiled dashboard, so
there is no nginx and no Node on the device. It never builds anything — GitHub
Actions compiles the frontend and publishes a release, and the Pi downloads it.

## 1. Install

On a fresh Raspberry Pi OS (Bookworm or newer):

```bash
git clone https://github.com/Mxo01/HERMES.git
cd HERMES/deploy
sudo ./install.sh
```

That creates the `hermes` service user, the layout under `/opt/hermes`, a Python
environment, the systemd units, and pulls the first release. When it finishes
the dashboard is live on port 5001 and it prints the token the sensor nodes need.

## 2. Reach it from outside the house

Tailscale, because the Pi stays invisible to the internet: no ports open on the
router, nothing for a scanner to find. Access requires signing in as you *and*
the device being one you approved.

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

Install Tailscale on your phone and laptop, sign in with the same account, and
the dashboard answers at `http://<pi-name>:5001` from anywhere.

Optionally give it HTTPS and a nicer name inside your tailnet:

```bash
sudo tailscale serve --bg --https 443 http://127.0.0.1:5001
```

**Do not port-forward 5001 on the router.** The dashboard has no login: the
network is the boundary, so exposing it publicly hands your home sensor data —
and the ability to fake a gas alarm — to anyone who finds the address.

## 3. Flash the sensor nodes

Read the token the installer generated:

```bash
sudo grep INGEST_TOKEN /opt/hermes/shared/hermes.env
```

Put it in `firmware/src/main.cpp` as `DEVICE_TOKEN`, set `SERVER_IP` to the Pi's
LAN address, then flash each board with `NODE_TYPE` 1, 2 and 3 in turn.

The nodes talk plain HTTP over the LAN — an ESP8266 cannot join the VPN. The
token is what stops anything else on your Wi-Fi from injecting readings.

## 4. How updates work

```
push to main
   → GitHub Actions runs backend tests, frontend build, firmware compile
   → publishes hermes-<version>.tar.gz as a release
   → the Pi's timer notices within ~5 minutes
   → downloads, verifies the checksum, installs beside the current release
   → flips the `current` symlink, restarts, health-checks
   → rolls back automatically if the new version does not come up
```

Nothing is updated in place and no credentials live on GitHub. A Pi that was
switched off catches up on its own a few minutes after it boots.

To apply an update immediately instead of waiting:

```bash
sudo /opt/hermes/bin/update.sh
```

## Layout

```
/opt/hermes/
├── current -> releases/v12-a1b2c3d    atomically swapped symlink
├── releases/                          the last 3 versions, for rollback
├── shared/                            survives every deploy
│   ├── hermes.env                     configuration and secrets
│   ├── deploy.env                     which repository to pull from
│   └── data/hermes.db                 the database
├── venv/                              Python environment
└── bin/update.sh                      the updater
```

## Everyday commands

| | |
| :--- | :--- |
| Is it running? | `systemctl status hermes` |
| Follow the logs | `journalctl -u hermes -f` |
| Deploy history | `journalctl -u hermes-update --since today` |
| When is the next check? | `systemctl list-timers hermes-update` |
| Change configuration | `sudo nano /opt/hermes/shared/hermes.env` then `sudo systemctl restart hermes` |
| Roll back by hand | `sudo ln -sfn /opt/hermes/releases/<version> /opt/hermes/current && sudo systemctl restart hermes` |
| Back up the data | `sudo sqlite3 /opt/hermes/shared/data/hermes.db ".backup /tmp/hermes-backup.db"` |

## If something breaks

**The dashboard does not answer.** `journalctl -u hermes -n 50`. The service
restarts itself every 5s, giving up after 5 failures in 5 minutes — so a
persistent error means a bad configuration rather than a crash loop.

**Updates stopped arriving.** `journalctl -u hermes-update -n 50`. Usually the
GitHub API is unreachable or, on a private repository, `GITHUB_TOKEN` is missing
from `shared/deploy.env`.

**A node shows as offline.** The dashboard flags any board that has not posted
for 5 minutes. Check the node's serial output: a `401` means its `DEVICE_TOKEN`
does not match the server's `INGEST_TOKEN`.

**The first `pip install` is slow.** On an original Pi Zero (ARMv6) some
packages compile from source. It happens once, and only again when dependencies
change.
