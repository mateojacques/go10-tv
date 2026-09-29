#!/usr/bin/env bash
set -euo pipefail

# Builds apps/web for production, stages the output into
# apps/tizen/prod/ (alongside its config.xml and icon.png), packages it as a
# Tizen wgt, and installs it to the connected TV -- for periodic full-
# fidelity, fully local/offline checks. Tizen Studio is deprecated; this
# uses the Tizen VS Code extension's bundled CLI tools instead. Requires
# the "go10-tizen" security profile created (Task 7), and the TV already
# `sdb connect`-ed (Task 7).

TZ_TOOLS="$HOME/.tizen-extension-platform/server/sdktools/data/tools"
TZ="$TZ_TOOLS/tizen-core/tz"

cd "$(dirname "$0")/../../.."

# --base ./ (not the default "/"): a Tizen web app is served from a
# file:// origin, where an absolute "/assets/..." path resolves to the
# filesystem root instead of the app's own directory. This overrides only
# this build, not apps/web's default (Netlify) build. --mode tizen emits a
# classic script instead of an ES module (see tizenClassicScript in
# apps/web/vite.config.ts).
cd apps/web
npx tsc -b
npx vite build --base ./ --mode tizen
cd ../..

cd apps/tizen/prod
rm -rf index.html assets data Debug tizen_web_project.yaml
cp -r ../../web/dist/. .

"$TZ" build -w . -s go10-tizen
"$TZ" pack -w . -s go10-tizen
../scripts/install-wgt.sh .
