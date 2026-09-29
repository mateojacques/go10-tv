#!/usr/bin/env bash
set -euo pipefail

# Installs a built Tizen project's Debug/*.wgt to the connected TV.
#
# Usage: install-wgt.sh <tizen project dir>   (e.g. apps/tizen/prod)
#
# Not `sdb install`: on this TV (Tizen 5.5, sdb 4.2.36) it pushes the wgt,
# prints nothing more, and never runs the installer -- verified on real
# hardware. Pushing to the device's sdk_toolpath (`sdb capability`) and
# running its installer with the app id from config.xml works, and reports
# real progress/errors.

SDB="$HOME/.tizen-extension-platform/server/sdktools/data/tools/sdb"
REMOTE_DIR="/home/owner/share/tmp/sdk_tools/tmp"

PROJECT="${1:?usage: $0 <tizen project dir>}"
WGT=$(ls "$PROJECT"/Debug/*.wgt | head -n1)
APP_ID=$(grep -oP '<tizen:application id="\K[^"]+' "$PROJECT/config.xml")
REMOTE="$REMOTE_DIR/$(basename "$WGT")"

echo "==> Pushing $WGT"
"$SDB" push "$WGT" "$REMOTE"

echo "==> Installing $APP_ID"
# sdb shell exits 0 even when the install fails, so check what it printed.
OUT=$("$SDB" shell 0 vd_appinstall "$APP_ID" "$REMOTE" | tee /dev/stderr)
if ! grep -q "install completed" <<<"$OUT"; then
  echo "Install of $APP_ID failed (see output above)." >&2
  exit 1
fi
