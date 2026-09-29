#!/usr/bin/env bash
set -euo pipefail

# One-command dev session: connects to the TV over sdb, starts the web build
# watcher + LAN preview server, and launches the dev-shell app on the TV.
# Does NOT install anything -- run install-dev.sh once first.
#
# Usage: start-dev.sh <TV_IP>     (or set TV_IP in the environment)
# Ctrl+C stops the web servers.

TV_IP="${1:-${TV_IP:-}}"
if [ -z "$TV_IP" ]; then
  echo "usage: $0 <TV_IP>   (or export TV_IP=...)" >&2
  exit 1
fi

SDB="$HOME/.tizen-extension-platform/server/sdktools/data/tools/sdb"
APP_ID="Go10TVdev1.GO10TVDev"

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
WEB="$ROOT/apps/web"
SHELL_HTML="$ROOT/apps/tizen/dev/index.html"

# The dev shell has the PC's LAN IP hardcoded; warn if it drifted.
PC_IP="$(hostname -I | awk '{print $1}')"
if ! grep -q "http://$PC_IP:4173" "$SHELL_HTML"; then
  echo "WARNING: this PC's IP is $PC_IP but $SHELL_HTML points elsewhere." >&2
  echo "         Update it and re-run install-dev.sh, or the TV won't load the app." >&2
fi

echo "==> Connecting to TV at $TV_IP"
"$SDB" connect "$TV_IP" >/dev/null
if ! "$SDB" devices | grep -E "^$TV_IP:[0-9]+[[:space:]]+device" >/dev/null; then
  echo "TV not connected as 'device'. Try: $SDB disconnect $TV_IP && $SDB connect $TV_IP" >&2
  "$SDB" devices >&2
  exit 1
fi

cd "$WEB"
pids=()
cleanup() {
  echo
  echo "==> Stopping web servers"
  kill "${pids[@]}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "==> Starting vite build --watch"
npx vite build --watch &
pids+=($!)

# preview serves dist/, so wait for the first build to land
while [ ! -f dist/index.html ]; do sleep 1; done

echo "==> Starting vite preview --host (http://$PC_IP:4173)"
npx vite preview --host &
pids+=($!)

sleep 2
echo "==> Launching $APP_ID on the TV"
"$SDB" -s "$TV_IP:26101" shell 0 was_execute "$APP_ID" ||
  echo "Auto-launch failed -- open 'GO10 TV (Dev)' from the TV's Apps list." >&2

echo "==> Dev session running. Reload the TV app after each rebuild. Ctrl+C to stop."
wait
