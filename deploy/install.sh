#!/usr/bin/env bash
#
# One-time bootstrap for a fresh Raspberry Pi.
#
#   sudo ./install.sh
#
# Creates the service user and directory layout, installs the systemd units,
# then hands over to update.sh to pull the first release. Idempotent: running
# it again repairs the layout without touching the database or the .env.

set -euo pipefail

ROOT=${HERMES_ROOT:-/opt/hermes}
REPO=${REPO:-Mxo01/HERMES}
SERVICE_USER=hermes

[[ $EUID -eq 0 ]] || { echo "Run with sudo."; exit 1; }

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

echo "==> Installing system packages"
apt-get update -qq
apt-get install -y -qq python3 python3-venv python3-dev curl ca-certificates build-essential

echo "==> Creating service user"
id -u "$SERVICE_USER" >/dev/null 2>&1 || useradd --system --home-dir "$ROOT" --shell /usr/sbin/nologin "$SERVICE_USER"

echo "==> Creating layout under $ROOT"
mkdir -p "$ROOT"/{releases,shared/data,bin}

if [[ ! -f "$ROOT/shared/hermes.env" ]]; then
  echo "==> Writing starter configuration"
  cat > "$ROOT/shared/hermes.env" <<EOF
# HERMES runtime configuration. Edit, then: sudo systemctl restart hermes
HOST=0.0.0.0
PORT=5001

# Lives in shared/ so it survives every deploy.
DATABASE_PATH=$ROOT/shared/data/hermes.db
FRONTEND_DIST=$ROOT/current/frontend/dist

# Signs session cookies. Generated once, keep it secret.
SECRET_KEY=$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')

# The ESP8266 nodes must send this as the X-Hermes-Token header. Copy it into
# firmware/src/main.cpp before flashing.
INGEST_TOKEN=$(python3 -c 'import secrets; print(secrets.token_urlsafe(24))')

# Telegram alerts (optional)
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
EOF
  chmod 600 "$ROOT/shared/hermes.env"
fi

if [[ ! -f "$ROOT/shared/deploy.env" ]]; then
  cat > "$ROOT/shared/deploy.env" <<EOF
# Where releases come from. Add GITHUB_TOKEN=... if the repository is private.
REPO=$REPO
EOF
  chmod 600 "$ROOT/shared/deploy.env"
fi

echo "==> Creating the Python environment"
[[ -d "$ROOT/venv" ]] || python3 -m venv "$ROOT/venv"
"$ROOT/venv/bin/pip" install --quiet --upgrade pip

echo "==> Installing the updater"
install -m 755 "$here/update.sh" "$ROOT/bin/update.sh"

echo "==> Installing systemd units"
install -m 644 "$here/hermes.service" /etc/systemd/system/hermes.service
install -m 644 "$here/hermes-update.service" /etc/systemd/system/hermes-update.service
install -m 644 "$here/hermes-update.timer" /etc/systemd/system/hermes-update.timer
systemctl daemon-reload

chown -R "$SERVICE_USER:$SERVICE_USER" "$ROOT"

echo "==> Fetching the first release"
"$ROOT/bin/update.sh"

echo "==> Enabling services"
systemctl enable --now hermes.service
systemctl enable --now hermes-update.timer

cat <<EOF

Done.

  Dashboard   http://$(hostname -I | awk '{print $1}'):5001
  Status      sudo systemctl status hermes
  Logs        sudo journalctl -u hermes -f
  Node token  sudo grep INGEST_TOKEN $ROOT/shared/hermes.env

Next: install Tailscale so you can reach it from outside the house.

  curl -fsSL https://tailscale.com/install.sh | sh
  sudo tailscale up

EOF
