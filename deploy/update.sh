#!/usr/bin/env bash
#
# Pull-based deploy for HERMES.
#
# Asks GitHub for the newest release, and if it differs from what is running,
# installs it beside the current one and flips a symlink. Nothing is ever
# updated in place: if the new release fails its health check, the symlink goes
# back, the database and dependencies are put back as they were, and the
# service restarts on the previous version. The rejected tag is remembered so
# the next run does not install it all over again.
#
# Run by hermes-update.timer. Safe to run by hand at any time.

set -euo pipefail

ROOT=${HERMES_ROOT:-/opt/hermes}
SHARED="$ROOT/shared"
RELEASES="$ROOT/releases"
CURRENT="$ROOT/current"
VENV="$ROOT/venv"
KEEP_RELEASES=3

# The updater's own config and state are root-owned and live outside shared/,
# which the service may write: this script runs as root, so anything it reads
# from there would let a compromised web process choose what root does next.
CONFIG=${HERMES_DEPLOY_CONFIG:-/etc/hermes/deploy.env}
STATE=${HERMES_UPDATE_STATE:-/var/lib/hermes-update}
REJECTED="$STATE/rejected-release"

log() { printf '[hermes-update] %s\n' "$*"; }
die() { log "ERROR: $*"; exit 1; }

# One KEY=value from a dotenv file, read as data. Never `source` one here:
# for a root script, sourcing a file means running it.
config_value() {
  local key=$1 file=$2
  [[ -f "$file" ]] || return 0
  grep -E "^${key}=" "$file" | tail -n 1 | cut -d= -f2- | sed -e "s/^[\"']//" -e "s/[\"']\$//" || true
}

deploy_config=$CONFIG
if [[ ! -f "$deploy_config" && -f "$SHARED/deploy.env" ]]; then
  deploy_config="$SHARED/deploy.env"
  log "WARNING: reading $deploy_config, which the service can write; re-run install.sh to move it to $CONFIG"
fi

# REPO, and optionally GITHUB_TOKEN for a private repository.
REPO=$(config_value REPO "$deploy_config")
REPO=${REPO:-Mxo01/HERMES}
GITHUB_TOKEN=$(config_value GITHUB_TOKEN "$deploy_config")
PORT=$(config_value PORT "$SHARED/hermes.env")
PORT=${PORT:-5001}
DATABASE=$(config_value DATABASE_PATH "$SHARED/hermes.env")
DATABASE=${DATABASE:-$SHARED/data/hermes.db}
DB_BACKUP="$(dirname "$DATABASE")/pre-update.db"

mkdir -p "$STATE"
chmod 700 "$STATE"

api() {
  local url=$1
  if [[ -n ${GITHUB_TOKEN:-} ]]; then
    curl -fsSL -H "Authorization: Bearer $GITHUB_TOKEN" -H 'X-GitHub-Api-Version: 2022-11-28' "$url"
  else
    curl -fsSL -H 'X-GitHub-Api-Version: 2022-11-28' "$url"
  fi
}

# ---------------------------------------------------------------- discover

release_json=$(api "https://api.github.com/repos/$REPO/releases/latest") || die "cannot reach GitHub"

read -r tag asset_url checksum_url < <(
  python3 - "$release_json" <<'PY'
import json, sys

release = json.loads(sys.argv[1])
assets = release.get('assets', [])


def find(suffix):
    return next((a['url'] for a in assets if a['name'].endswith(suffix)), '')


tarball = find('.tar.gz')
if not tarball:
    raise SystemExit('release has no tarball asset')

# The checksum is optional so an older release without one still installs.
print(release['tag_name'], tarball, find('.tar.gz.sha256') or '-')
PY
) || die "unexpected release payload"

installed=""
[[ -f "$CURRENT/VERSION" ]] && installed=$(cat "$CURRENT/VERSION")

if [[ "$tag" == "$installed" ]]; then
  log "already on $tag"
  exit 0
fi

# Without this, a release that fails its health check is downloaded, swapped in
# and rolled back again on every timer run: a restart with a minute of
# downtime every five minutes until a newer release ships.
if [[ -f "$REJECTED" && "$(cat "$REJECTED")" == "$tag" ]]; then
  log "skipping $tag: it failed its health check before (delete $REJECTED to retry it)"
  exit 0
fi

log "updating $installed -> $tag"
target="$RELEASES/$tag"

# ---------------------------------------------------------------- download

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# The API asset URL needs the octet-stream Accept header to return the bytes.
download() {
  local url=$1 out=$2
  if [[ -n ${GITHUB_TOKEN:-} ]]; then
    curl -fsSL -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/octet-stream' -o "$out" "$url"
  else
    curl -fsSL -H 'Accept: application/octet-stream' -o "$out" "$url"
  fi
}

download "$asset_url" "$tmp/release.tar.gz" || die "download failed"

if [[ "$checksum_url" != '-' ]]; then
  download "$checksum_url" "$tmp/release.sha256" || die "checksum download failed"
  # The published file names the artefact as it was built; compare digests only.
  expected=$(cut -d' ' -f1 < "$tmp/release.sha256")
  actual=$(sha256sum "$tmp/release.tar.gz" | cut -d' ' -f1)
  [[ "$expected" == "$actual" ]] || die "checksum mismatch: archive is corrupt or tampered with"
  log "checksum verified"
else
  log "release published no checksum, skipping verification"
fi

rm -rf "$target"
mkdir -p "$target"
tar -xzf "$tmp/release.tar.gz" -C "$target" || die "corrupt archive"
[[ -f "$target/backend/wsgi.py" && -f "$target/frontend/dist/index.html" ]] || die "archive is missing files"
echo "$tag" > "$target/VERSION"

# ---------------------------------------------------------------- install

# Reinstalling on every deploy would cost minutes on a Pi Zero, so only do it
# when the dependency list actually changed.
# The venv is shared by every release, so record exactly what is installed
# first: a rollback has to hand the old code back the packages it ran with.
previous_requirements=""
previous_hash=$(cat "$VENV/.requirements-hash" 2>/dev/null || true)
requirements_hash=$(sha256sum "$target/backend/requirements.txt" | cut -d' ' -f1)
if [[ "$previous_hash" != "$requirements_hash" ]]; then
  log "dependencies changed, installing"
  previous_requirements="$tmp/previous-requirements.txt"
  "$VENV/bin/pip" freeze --all > "$previous_requirements" || die "cannot record the installed dependencies"
  "$VENV/bin/pip" install --quiet --upgrade -r "$target/backend/requirements.txt" || die "pip install failed"
  echo "$requirements_hash" > "$VENV/.requirements-hash"
fi

chown -R hermes:hermes "$target"

previous=""
[[ -L "$CURRENT" ]] && previous=$(readlink -f "$CURRENT")

# ln + mv -T swaps the symlink in one atomic step: no window where `current`
# is missing or half-written.
ln -sfn "$target" "$ROOT/.current.new"
mv -Tf "$ROOT/.current.new" "$CURRENT"

# The new release migrates the schema as it starts, and an older release
# cannot read a newer schema. SQLite's backup API takes a consistent copy while
# the service keeps writing; at worst a rollback loses the readings of the
# minute it took.
db_backup_taken=false
if [[ -f "$DATABASE" ]]; then
  python3 - "$DATABASE" "$DB_BACKUP" <<'PY' || die "database backup failed"
import sqlite3, sys

source = sqlite3.connect(sys.argv[1])
target = sqlite3.connect(sys.argv[2])
with target:
    source.backup(target)
target.close()
source.close()
PY
  db_backup_taken=true
  log "database backed up to $DB_BACKUP"
fi

# ----------------------------------------------------------- restart & check

systemctl restart hermes.service

healthy=false
for _ in $(seq 1 30); do
  if curl -fsS --max-time 3 "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    healthy=true
    break
  fi
  sleep 2
done

if [[ "$healthy" != true ]]; then
  log "health check failed on $tag"
  echo "$tag" > "$REJECTED"
  if [[ -n "$previous" && -d "$previous" ]]; then
    log "rolling back to $(cat "$previous/VERSION" 2>/dev/null || basename "$previous")"
    systemctl stop hermes.service

    if [[ "$db_backup_taken" == true ]]; then
      cp "$DB_BACKUP" "$DATABASE"
      rm -f "$DATABASE-wal" "$DATABASE-shm"
      chown hermes:hermes "$DATABASE"
      log "database restored to its state before $tag"
    fi

    if [[ -n "$previous_requirements" ]]; then
      if "$VENV/bin/pip" install --quiet -r "$previous_requirements"; then
        if [[ -n "$previous_hash" ]]; then
          echo "$previous_hash" > "$VENV/.requirements-hash"
        else
          rm -f "$VENV/.requirements-hash"
        fi
        log "dependencies restored"
      else
        log "WARNING: could not restore the previous dependencies"
      fi
    fi

    ln -sfn "$previous" "$ROOT/.current.new"
    mv -Tf "$ROOT/.current.new" "$CURRENT"
    systemctl start hermes.service
  fi
  die "release $tag rejected"
fi

rm -f "$REJECTED"
log "$tag is live"

# ---------------------------------------------------------------- clean up

# Keep a few releases so a rollback is always one symlink away.
# shellcheck disable=SC2012
ls -1dt "$RELEASES"/*/ 2>/dev/null | tail -n +$((KEEP_RELEASES + 1)) | while read -r old; do
  [[ "$(readlink -f "$old")" == "$(readlink -f "$CURRENT")" ]] && continue
  log "removing old release $(basename "$old")"
  rm -rf "$old"
done

# Replace this script last, and atomically, so the copy bash is currently
# reading stays intact for the rest of this run.
if [[ -f "$target/deploy/update.sh" ]]; then
  install -m 755 "$target/deploy/update.sh" "$ROOT/bin/.update.sh.new"
  mv -f "$ROOT/bin/.update.sh.new" "$ROOT/bin/update.sh"
fi
