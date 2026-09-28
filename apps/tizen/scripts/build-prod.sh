#!/usr/bin/env bash
set -euo pipefail

# Builds apps/web for production, stages the output into
# apps/tizen/prod/ (alongside its config.xml and icon.png), packages it as a
# Tizen wgt, and installs it to the connected TV -- for periodic full-
# fidelity, fully local/offline checks. Requires Tizen Studio's CLI tools
# (tizen, sdb) on PATH, the "go10-tizen" security profile created (Task 7),
# and the TV already `sdb connect`-ed (Task 7).

cd "$(dirname "$0")/../../.."
npm run build -w @go10/web

cd apps/tizen/prod
rm -rf index.html assets data .buildResult
cp -r ../../web/dist/. .

tizen build-web -- . -out .buildResult
tizen package -t wgt -s go10-tizen -- .buildResult
WGT=$(ls .buildResult/*.wgt | head -n1)
tizen install -n "$WGT"
