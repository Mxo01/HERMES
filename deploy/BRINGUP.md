# Bring-up checklist

The order matters: each phase is verifiable on its own, so when something does
not work you know it was the last thing you touched. Resist assembling all
three nodes before one of them has posted a reading end to end.

---

## Phase 0 — Before the hardware arrives

- [ ] **Buy what the README's bill of materials leaves out.** It lists the
      boards and sensors; bring-up also needs:
      | Item | Qty | Why |
      | :--- | :--- | :--- |
      | Raspberry Pi **Zero 2 W** (or Zero W) | 1 | A plain Pi Zero has no Wi-Fi at all. The Zero 2 W is recommended: the Zero W's single ARMv6 core makes the first install slow and the dashboard sluggish |
      | High-endurance microSD, 16–32 GB | 1 | SQLite writes every 30 s, around the clock — an ordinary card wears out |
      | Pi power supply, 5.1 V 2.5 A micro-USB | 1 | An undervolted Pi shows up as random crashes and SD corruption, not as an obvious error |
      | USB power supply, 5 V ≥ 1 A | 3 | One per node. The MQ heater alone draws ~150 mA, and Wi-Fi transmit bursts come on top |
      | USB-C **data** cable | 3 | Many cheap cables are charge-only: the board powers up but never appears for flashing |
      | 10 kΩ + 20 kΩ resistor | 3 pairs | One divider per MQ module, see the README's wiring. Node A needs it most: its gas reading is the one that must stay readable during a leak |
      | Mini breadboard | 3 | Where the divider gets built — still no soldering |
      | Dupont jumpers M-M and M-F | 1 pack each | A divider cannot be built from F-F jumpers alone: the breadboard needs a male end |
- [ ] **Settle the DHT22 pin.** The firmware says `D2` (GPIO4); the wiring
      diagram used to say `D4` (GPIO2). Wire to D2 unless you change the code —
      GPIO2 is a boot-strapping pin and drives the onboard LED.
- [ ] Optional: a heatsink or at least good airflow for the Pi if it lives in a
      kitchen cupboard.

> **The MQ-2 does not replace a certified gas detector.** It is an
> uncalibrated hobby sensor, and HERMES is a dashboard plus a Telegram message,
> not a safety device. Keep (or fit) a detector certified for domestic use
> (EN 50194) with its own alarm; treat Node A as a second pair of eyes.

---

## Phase 1 — The Raspberry Pi

- [ ] In Raspberry Pi Imager pick **Raspberry Pi OS (other) → Raspberry Pi OS
      Lite (Legacy)**, which is Bookworm. Not the default entry: that is Trixie,
      which ships Python 3.13, while the backend is pinned to and tested on 3.11
      (`backend/pyproject.toml`, `.github/workflows/ci.yml`). On a Zero W take
      the 32-bit image — ARMv6 cannot run 64-bit.
- [ ] In the Imager's settings set the hostname, enable SSH and enter the Wi-Fi
      credentials — no screen needed afterwards. **The network must be
      2.4 GHz:** neither the Pi Zero nor the ESP8266 has a 5 GHz radio. A
      dual-band router with one name for both bands is fine as long as 2.4 GHz
      is switched on.
- [ ] Boot, `ssh` in, `sudo apt update && sudo apt full-upgrade`.
- [ ] Lite does not always ship git: `sudo apt install -y git`.
- [ ] **Give the Pi a static DHCP lease on the router, at the address in
      `SERVER_IP`** in `firmware/src/main.cpp` (default `192.168.1.100`).
      The nodes are flashed with that fixed IP; if DHCP moves the Pi, all three
      go silent at once. Either reserve that address or change `SERVER_IP`
      before flashing — the two must agree.
- [ ] Install:
      ```bash
      git clone https://github.com/Mxo01/HERMES.git
      cd HERMES/deploy && sudo ./install.sh
      ```
- [ ] Verify from a laptop on the same Wi-Fi: `http://<pi-ip>:5001` shows the
      dashboard, with all three nodes as **UNKNOWN** (nothing has reported yet).
- [ ] Save the ingest token somewhere you can copy from:
      ```bash
      sudo grep INGEST_TOKEN /opt/hermes/shared/hermes.env
      ```

**Done when:** the dashboard loads on the LAN and `systemctl status hermes`
says active.

---

## Phase 2 — Access from outside

- [ ] On the Pi: `curl -fsSL https://tailscale.com/install.sh | sh` then
      `sudo tailscale up`.
- [ ] Install Tailscale on your phone and laptop, same account.
- [ ] **Test with Wi-Fi off on the phone**, over mobile data. Testing from home
      Wi-Fi proves nothing — you would reach the Pi anyway.
- [ ] Optional, for HTTPS and a nicer name:
      `sudo tailscale serve --bg --https 443 http://127.0.0.1:5001`

**Done when:** the dashboard opens on mobile data.

---

## Phase 3 — Telegram

- [ ] Create the bot with [@BotFather](https://t.me/BotFather), copy the token.
- [ ] Send your bot any message, then read your chat id from
      `https://api.telegram.org/bot<TOKEN>/getUpdates`.
- [ ] Put both into `/opt/hermes/shared/hermes.env`, then
      `sudo systemctl restart hermes`.
- [ ] **Test the alert path without any hardware** — post a reading above the
      threshold, from any machine on the LAN:
      ```bash
      curl -X POST http://<pi-ip>:5001/api/air-quality/data \
        -H 'Content-Type: application/json' -H 'X-Hermes-Token: <token>' \
        -d '{"room":"kitchen","sensor":"mq2","gas":200}'
      ```
      Expect a Telegram message and a HIGH alarm in the log. Then send
      `"gas":30` to close it and check the duration looks right.

**Done when:** an alarm opens, notifies, and closes on demand.

---

## Phase 4 — The flashing machine

The nodes are flashed from a laptop over USB. Get the toolchain working once,
before the first node, so a toolchain problem is never mistaken for a wiring
one.

- [ ] **On Apple Silicon, install Rosetta first:**
      ```bash
      softwareupdate --install-rosetta --agree-to-license
      ```
      PlatformIO's ESP8266 toolchain ships x86_64 binaries only; without
      Rosetta the build fails with `Bad CPU type in executable`. Running
      PlatformIO in Docker is no way around it: Docker on macOS cannot reach
      USB serial devices, so you could build but never upload.
- [ ] Install PlatformIO (`brew install platformio`, or the VS Code extension)
      and run `make firmware` from the repository root: it compiles all three
      node types, which proves the toolchain end to end.
- [ ] Plug in a NodeMCU and check it shows up as a serial port:
      ```bash
      ls /dev/cu.usbserial* /dev/cu.wchusbserial*
      ```
      Nothing listed means the cable is charge-only (try another) or the CH340
      USB-serial driver is missing (install WCH's macOS driver). Fix it here —
      `pio run -t upload` reports the same problem far less clearly.
- [ ] **Never commit a real `DEVICE_TOKEN`.** Flashing means editing
      `firmware/src/main.cpp` with the token; the pre-commit gitleaks hook
      (installed by `make setup`) refuses a commit that contains it, but do not
      lean on that. After each flash:
      ```bash
      git restore firmware/src/main.cpp
      ```
      The token lives in the board's flash, not in the repository.

**Done when:** `make firmware` passes and the board appears as a serial port.

---

## Phase 5 — The first node only (Kitchen A, gas)

Do this one completely before touching the other two.

- [ ] Wire the MQ-2, with the divider on `AO` (README §2).
- [ ] In `firmware/src/main.cpp` set `NODE_TYPE 1`, `SERVER_IP` to the Pi's
      **LAN** address — the static lease from Phase 1, not its Tailscale one;
      the nodes are not on the VPN — and `DEVICE_TOKEN` to the ingest token.
- [ ] From `firmware/`: `pio run -t upload`, then `pio device monitor`
      (115200, already set in `platformio.ini`).
- [ ] `git restore firmware/src/main.cpp` once it is flashed.
- [ ] First boot opens a Wi-Fi access point named after the node:
      | Node | Access point |
      | :--- | :--- |
      | A — kitchen gas (`NODE_TYPE 1`) | `Hermes-Setup-kitchen-mq2` |
      | B — kitchen environment (`NODE_TYPE 2`) | `Hermes-Setup-kitchen-mq135` |
      | C — bedroom (`NODE_TYPE 3`) | `Hermes-Setup-bedroom-mq135` |
      Join it from your phone and pick your 2.4 GHz home network. If the
      captive portal does not pop up on its own, browse to `http://192.168.4.1`.
- [ ] **The portal closes after 180 s and the node restarts.** That is
      expected, not a crash loop: the access point reappearing every three
      minutes until you configure it is what lets a node recover by itself
      after a power cut in which the router boots slower than the node.
- [ ] The chosen network is saved in the board's flash and survives
      reflashing. To make a node forget it (new router, wrong network picked),
      erase and flash again; the portal comes back on the next boot:
      ```bash
      pio run -t erase && pio run -t upload
      ```
- [ ] Watch the serial output. What you see tells you what is wrong:
      | Output | Meaning |
      | :--- | :--- |
      | `-> 201` every 30s | working |
      | `-> 401` | `DEVICE_TOKEN` does not match `INGEST_TOKEN` |
      | `-> -1` or a connection error | wrong `SERVER_IP`, or off the Wi-Fi |
      | `-> 400` | payload rejected; the response body names the field |
- [ ] Check the dashboard: **Node A online**, a gas number that moves.

> **Do not trust the numbers yet.** MQ sensors need minutes to warm up and
> 24–48 h of continuous power to stabilise. Leave it running before you read
> anything into the values.

**Done when:** Node A posts 201 continuously and shows online.

---

## Phase 6 — The remaining two nodes

Same routine as Phase 5 — divider on the MQ-135's `AO`, flash, `git restore`,
join the node's own access point.

- [ ] **Node B** — kitchen, `NODE_TYPE 2`, access point
      `Hermes-Setup-kitchen-mq135`. Check temperature and humidity look
      plausible. Nonsense or a node that never posts means the DHT22 data pin
      does not match `DHT_PIN`.
- [ ] **Node C** — bedroom, `NODE_TYPE 3`, access point
      `Hermes-Setup-bedroom-mq135`.
- [ ] Header shows **3/3 nodes**; all three rooms have values in the
      side-by-side comparison.
- [ ] Unplug one node for six minutes and confirm it turns to OFFLINE and
      raises a low-severity alarm, then clears when you plug it back in.

**Done when:** 3/3 online and the watchdog demonstrably works.

---

## Phase 7 — Placement

So far the nodes have lived on the desk. Where they end up decides what the
numbers mean, so place them before calibrating — thresholds tuned on the desk
do not carry over.

- [ ] **Node A (MQ-2) goes where the gas collects**, which depends on the gas:
      - **Methane** (mains natural gas) is lighter than air: mount it high,
        about 30 cm below the ceiling.
      - **LPG** (bottled gas) is heavier than air: mount it low, about 30 cm
        above the floor.

      Either way 1–3 m from the hob, not above it — steam and fumes straight
      off the pans would keep it in alarm — and away from the extractor hood
      and windows, which carry a leak away before it reaches the sensor.
- [ ] **Nodes B and C at 1–1.5 m**, roughly breathing height, away from heat
      sources (oven, radiator, fridge exhaust), direct sun and windows: each
      makes the room read hotter, colder or drier than it is.
- [ ] **On B and C, keep the DHT22 a few cm beside or below the MQ-135 and the
      ESP board**, never above them. The MQ heater runs warm and the ESP heats
      up while transmitting; a DHT22 sitting in that rising air reads high on
      temperature and low on humidity.
- [ ] **Before fixing a node in place, check for `-> 201` on the serial monitor
      at its final spot.** Wi-Fi that is fine on the desk can be marginal
      inside a cupboard or at the far end of the flat.

> A moved and re-powered MQ sensor needs to settle again — give it a few hours
> before reading anything into its values.

**Done when:** every node is fixed in its final spot and still posts 201.

---

## Phase 8 — Calibration, after a few days of data

The default thresholds are placeholders, not measurements.

- [ ] Open **History → Air quality** and look at the daily bands. Note where
      the normal peaks land — cooking, showers, an open window.
- [ ] Set `GAS_ALERT_THRESHOLD` above your ordinary cooking peaks and well
      below a real leak. Same reasoning for `AQ_ALERT_THRESHOLD` and
      `HUMIDITY_ALERT_THRESHOLD`. Edit `/opt/hermes/shared/hermes.env` and
      restart.
- [ ] If you get alarms you do not care about, raise the threshold rather than
      learning to ignore the notifications.
- [ ] After day 7, confirm downsampling ran: the oldest rows in the day-by-day
      table should read **HOURLY AVG** instead of RAW 30s, and
      `journalctl -u hermes | grep downsampling` should show it working.

**Done when:** a week goes by without a false alarm.

---

## Phase 9 — Prove the automation

- [ ] Push a trivial change to `main` (a word in the README will do) and watch
      the Pi take it:
      ```bash
      journalctl -u hermes-update -f
      ```
      Within about five minutes it should download, install and report the new
      version. `cat /opt/hermes/current/VERSION` confirms it.
- [ ] Set up a database backup you will actually run:
      ```bash
      sudo sqlite3 /opt/hermes/shared/data/hermes.db ".backup /tmp/hermes.db"
      ```
      Copy it off the Pi. SD cards fail.
- [ ] Reboot the Pi and confirm everything comes back on its own.

**Done when:** you can ship a change from your laptop without touching the Pi.

---

## Things that will bite you

| Symptom | Usually |
| :--- | :--- |
| All three nodes go offline at once | The Pi's IP changed — set a static lease |
| One node offline, others fine | Power, Wi-Fi range, or a loose Dupont jumper |
| Node never joins the home Wi-Fi | The network is 5 GHz only — the ESP8266 needs 2.4 GHz |
| Setup access point reappears every 3 minutes | Expected until the node is configured; afterwards, the saved network is unreachable |
| Node posts 401 | Token mismatch after regenerating `hermes.env` |
| Temperature reads `nan`, node silent | DHT22 on the wrong pin |
| Temperature a degree or two high | DHT22 above the MQ heater or the ESP board |
| Gas value pinned near 1023 | MQ output exceeding 3.3 V — add the divider |
| Wild readings for the first day | Normal: MQ burn-in |
| `Bad CPU type in executable` building firmware | Rosetta not installed (Apple Silicon) |
| No `/dev/cu.usbserial*` with the board plugged in | Charge-only cable, or the CH340 driver is missing |
| Commit refused by the pre-commit hook | `DEVICE_TOKEN` left in `main.cpp` — `git restore` it |
| Dashboard reachable at home, not away | Tailscale not running on the phone |
| First install takes ages | Normal on ARMv6: some wheels compile from source |
