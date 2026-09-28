#!/usr/bin/env bash
set -euo pipefail

# Builds apps/web for production, stages the output into
# apps/tizen/prod/ (alongside its config.xml and icon.png), packages it as a
# Tizen wgt, and installs it to the connected TV -- for periodic full-
# fidelity, fully local/offline checks. Requires Tizen Studio's CLI tools
# (tizen, sdb) on PATH, the "go10-tizen" security profile created (Task 7),
# and the TV already `sdb connect`-ed (Task 7).

cd "$(dirname "$0")/../../.."

# --base ./ (not the default "/"): a Tizen web app is served from a
# file:// origin, where an absolute "/assets/..." path resolves to the
# filesystem root instead of the app's own directory. This overrides only
# this build, not apps/web's default (Netlify) build.
cd apps/web
npx tsc -b
npx vite build --base ./
cd ../..

cd apps/tizen/prod
rm -rf index.html assets data .buildResult
cp -r ../../web/dist/. .

tizen build-web -- . -out .buildResult
tizen package -t wgt -s go10-tizen -- .buildResult
WGT=$(ls .buildResult/*.wgt | head -n1)
tizen install -n "$WGT"
