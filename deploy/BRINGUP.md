# Bring-up checklist

The order matters: each phase is verifiable on its own, so when something does
not work you know it was the last thing you touched. Resist assembling all
three nodes before one of them has posted a reading end to end.

---

## Phase 0 — Before the hardware arrives

- [ ] **Merge the branch to `main`.** Until then CI never runs, no release is
      published, and the Pi's updater has nothing to download. This blocks
      Phase 1.
- [ ] **Settle the DHT22 pin.** The firmware says `D2` (GPIO4); the wiring
      diagram used to say `D4` (GPIO2). Wire to D2 unless you change the code —
      GPIO2 is a boot-strapping pin and drives the onboard LED.
- [ ] **Order two resistors per environment node** (e.g. 10 kΩ + 20 kΩ) for a
      divider on the MQ modules' `AO`. Powered from VIN they can output up to
      5 V into an input rated for 3.3 V, and the clipping starts exactly in the
      range where a gas alarm lives.
- [ ] Optional: a heatsink or at least good airflow for the Pi if it lives in a
      kitchen cupboard.

---

## Phase 1 — The Raspberry Pi

- [ ] Flash Raspberry Pi OS **Lite** (Bookworm) with the Imager. Set the
      hostname, enable SSH and enter the Wi-Fi credentials in the imager's
      settings — no screen needed afterwards.
- [ ] Boot, `ssh` in, `sudo apt update && sudo apt full-upgrade`.
- [ ] **Give the Pi a static DHCP lease on the router.** The nodes are flashed
      with a fixed IP; if DHCP moves the Pi, all three go silent at once.
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

## Phase 4 — The first node only (Kitchen A, gas)

Do this one completely before touching the other two.

- [ ] Wire the MQ-2, with the divider on `AO`.
- [ ] In `firmware/src/main.cpp` set `NODE_TYPE 1`, `SERVER_IP` to the Pi's
      **LAN** address (not its Tailscale one — the nodes are not on the VPN),
      and `DEVICE_TOKEN` to the ingest token.
- [ ] `pio run -t upload`, then `pio device monitor` at 115200.
- [ ] First boot opens a Wi-Fi access point called `Hermes-Setup-kitchen-mq2`.
      Join it from your phone and pick your home network.
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

## Phase 5 — The remaining two nodes

- [ ] **Node B** — kitchen, `NODE_TYPE 2`. Check temperature and humidity look
      plausible. Nonsense or a node that never posts means the DHT22 data pin
      does not match `DHT_PIN`.
- [ ] **Node C** — bedroom, `NODE_TYPE 3`.
- [ ] Header shows **3/3 nodes**; all three rooms have values in the
      side-by-side comparison.
- [ ] Unplug one node for six minutes and confirm it turns to OFFLINE and
      raises a low-severity alarm, then clears when you plug it back in.

**Done when:** 3/3 online and the watchdog demonstrably works.

---

## Phase 6 — Calibration, after a few days of data

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

## Phase 7 — Prove the automation

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
| Node posts 401 | Token mismatch after regenerating `hermes.env` |
| Temperature reads `nan`, node silent | DHT22 on the wrong pin |
| Gas value pinned near 1023 | MQ output exceeding 3.3 V — add the divider |
| Wild readings for the first day | Normal: MQ burn-in |
| Dashboard reachable at home, not away | Tailscale not running on the phone |
| First install takes ages | Normal on ARMv6: some wheels compile from source |
