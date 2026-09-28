#!/usr/bin/env bash
set -euo pipefail

# Packages and installs the dev-shell Tizen app, which just loads the LAN
# Vite preview server -- run this once (or whenever apps/tizen/dev/ itself
# changes, not per apps/web code change). Tizen Studio is deprecated; this
# uses the Tizen VS Code extension's bundled CLI tools instead. Requires
# the "go10-tizen" security profile created (Task 7), and the TV already
# `sdb connect`-ed (Task 7).

TZ_TOOLS="$HOME/.tizen-extension-platform/server/sdktools/data/tools"
TZ="$TZ_TOOLS/tizen-core/tz"
SDB="$TZ_TOOLS/sdb"

cd "$(dirname "$0")/../dev"
rm -rf Debug tizen_web_project.yaml
"$TZ" build -w . -s go10-tizen
"$TZ" pack -w . -s go10-tizen
WGT=$(ls Debug/*.wgt | head -n1)
"$SDB" install "$WGT"
