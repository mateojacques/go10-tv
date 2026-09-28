#!/usr/bin/env bash
set -euo pipefail

# Packages and installs the dev-shell Tizen app, which just loads the LAN
# Vite dev server -- run this once (or whenever apps/tizen/dev/ itself
# changes, not per apps/web code change). Requires Tizen Studio's CLI tools
# (tizen, sdb) on PATH, the "go10-tizen" security profile created (Task 7),
# and the TV already `sdb connect`-ed (Task 7).

cd "$(dirname "$0")/../dev"
rm -rf .buildResult
tizen build-web -- . -out .buildResult
tizen package -t wgt -s go10-tizen -- .buildResult
WGT=$(ls .buildResult/*.wgt | head -n1)
tizen install -n "$WGT"
