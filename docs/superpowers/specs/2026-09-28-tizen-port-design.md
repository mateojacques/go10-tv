# Tizen port — design spec

## Goal

Package the existing `apps/web` React app as a Samsung Tizen TV app, sideloadable
for local testing on the user's own Tizen 5.5 TV (Samsung 2020 T5300 series,
firmware `T-KTS2UABC-2743.0`, Chromium ~69 engine) — no store submission, no
Samsung certificate beyond a free self-issued author certificate.

`apps/web` already anticipates TV usage: `inputMode.ts` detects Tizen by user
agent and forces remote-control ("keys") steering, and `useFocusable.ts` already
keeps real DOM focus in sync specifically because "Samsung's Tizen TV browser
watches `document.activeElement`" to drive the remote. This port is packaging
and a handful of compatibility fixes, not a rewrite.

## Non-goals

- No native Tizen app (C++/EFL) — Tizen Web App only.
- No Samsung Seller Office / store distribution — sideload only.
- No changes to `apps/mobile` (Android/Android TV, unaffected).
- No automated Tizen emulator testing — validated on the user's real TV only
  (matches the existing "TV checks wait for real hardware" pattern already used
  for Android TV).

## Architecture

New `apps/tizen` workspace, packaging-only — no React/business logic is
duplicated there. `apps/web` remains the single source of truth for all UI and
logic; `apps/tizen` only wraps its output for Tizen's packaging format.

```
apps/tizen/
  config.dev.xml      # content src = http://<dev-machine-ip>:5173 (apps/web's Vite dev server)
  config.prod.xml     # content src = local bundled index.html
  icon.png
  scripts/
    install-dev.sh     # tizen package + sdb install of the dev shell
    build-prod.sh       # vite build (apps/web) -> stage into apps/tizen/prod -> tizen package -> sdb install
```

Two build variants:

- **Dev shell** (`config.dev.xml`): a native wrapper whose only job is loading
  a build of `apps/web` served over the LAN. Sideloaded once; after that, the
  day-to-day loop is `npx vite build --watch` + `npx vite preview --host` in
  `apps/web` (two terminals) and a reload on the TV after each rebuild — no
  repackage/reinstall of the Tizen app itself per change. Not the raw `vite
  dev` server: it doesn't apply `build.target`, and its own HMR client uses
  syntax Chromium 69 can't parse either, so it blank-screens this TV. This
  costs true HMR (state-preserving hot reload) for a manual-reload watch
  loop, which is still far faster than a full Tizen repackage per change.
- **Prod bundle** (`config.prod.xml`): bundles `apps/web`'s real `vite build`
  output, packaged fully local/offline. Used for periodic full-fidelity checks
  so the fast dev loop's fidelity gap (a `.wgt` pointing at a remote URL runs
  under different Tizen network/security policy than a fully local one) gets
  caught before it matters.

## Changes inside `apps/web`

**Build target.** Vite's default `esbuild` target is modern enough to leave
optional chaining (`?.`) and nullish coalescing (`??`) untranspiled — both
already used throughout the codebase (e.g. `Player.tsx`'s
`frameRef.current?.contentWindow?.postMessage(...)`). Chromium 69 cannot parse
that syntax at all, so an un-pinned build ships a blank white screen on this TV,
not just rough edges. Pin `vite.config.ts`'s `build.target` to a
Chromium-69-safe target (e.g. `'chrome69'` or `'es2017'`). This applies to every
build, including the existing Netlify web build — harmless there, just
marginally larger output for browsers that have supported ES2017 syntax for
years.

**CSS flex-`gap` fix.** `Row.css`, `Navbar.css`, and `Card.css` use `gap` on
flex containers, unsupported before Chromium 84 — card/row spacing will
collapse on this TV without a fix. Convert those specific rules to
margin-based spacing (e.g. `margin-left` on all-but-first child) rather than
adding a PostCSS polyfill dependency for a handful of rules. `Catalog.css`'s
grid `gap` is unaffected — grid-gap support predates Chromium 69.

**Back button + app exit.** Tizen does not deliver the physical Back/Return
remote button to the page unless the app calls
`tizen.tvinputdevice.registerKey('Back')` at startup — without it,
`FocusProvider`'s existing `Escape`/`Backspace` handling never fires for the
physical button. Add `installTizenPlatform()` (mirrors `installWebPlatform()`
in `platform.ts`, same shape as its existing `platform.test.ts`) that: (1)
registers the key, and (2) listens for it and dispatches a synthetic `Escape`
keydown, so `FocusProvider` itself needs no changes. Separately,
`App.tsx`'s `back()` switch has no case for `route.name === 'home'` today
(Back is a no-op there) — on Tizen that's where it should instead call
`tizen.application.getCurrentApplication().exit()`, so Back at the root
actually leaves the app. Guard this call with `typeof tizen !== 'undefined'`
so it stays a no-op on web and mobile.

**`config.xml` privileges.** `http://tizen.org/privilege/internet` (catalog
data, TMDB, the ok.ru/vidlove iframes, Google Fonts) and
`http://tizen.org/privilege/tv.inputdevice` (registering the Back key).

## Data flow

Unchanged in `apps/web` itself — the catalog/collections data, TMDB calls,
and the ok.ru/vidlove `<iframe>` + `postMessage` player all already work
over plain HTTP(S). The `internet` privilege alone is not enough for Tizen
to actually let those requests through, though: Tizen's WARP security model
blocks `fetch`/XHR to external origins without an explicit `<access>`
element in `config.xml` (and blocks top-level navigation without
`<tizen:allow-navigation>`, which the dev shell's redirect to the LAN dev
server needs) — both configs declare a wildcard `<access>` for this reason.
The one open question is whether Tizen's browser policy allows the iframe
embeds to autoplay with sound; this is unverified until tested live and is
first on the validation checklist below rather than something to build a
workaround for speculatively.

## Validation checklist (first sideload, before any polish)

Run in this order, on the real TV, via the dev shell:

1. App launches at all — confirms the build-target fix; a failure here means
   the bundle still contains unparseable syntax.
2. D-pad focus navigation visibly moves between cards/rows — confirms the
   `document.activeElement` handling `useFocusable.ts` already anticipated
   actually works on real Tizen hardware.
3. OK/Enter activates the focused item.
4. Back navigates back through screens, and exits the app from Home —
   confirms key registration and the exit-on-back wiring.
5. ok.ru and vidlove iframe playback works with audio — confirms no autoplay
   policy surprise.
6. Card/row spacing renders correctly — confirms the `gap` fix was necessary
   and sufficient.

## Testing

No Tizen emulator use — Tizen-specific behavior (key registration, exit-app,
packaging) is validated only on the real sideloaded TV, consistent with the
existing "TV checks wait for real hardware" pattern already in use for Android
TV. Logic that isn't Tizen-hardware-dependent stays unit-tested the same way
`platform.test.ts` tests `installWebPlatform`: `installTizenPlatform` gets an
equivalent Vitest test (stubbing `window.tizen`) for its key-registration and
back-dispatch logic.

## Dev loop (one-time TV setup, then day-to-day)

1. Put the TV into Developer Mode: Apps screen → type `12345` → toggle
   Developer Mode → enter the dev machine's IP → restart the TV.
2. Install Tizen Studio (with the TV Extension SDK) on the dev machine.
3. `sdb connect <TV_IP>:26101`.
4. Generate a free author certificate once via Tizen Studio's Certificate
   Manager (no Samsung approval needed for sideloading).
5. `apps/tizen/scripts/install-dev.sh` — packages `config.dev.xml`, signs it,
   `sdb install`s it to the TV. One-time (or whenever the dev-shell's own
   config changes, not per app code change).
6. Day-to-day, in `apps/web` (two terminals): `npx vite build --watch` and
   `npx vite preview --host`, launch the sideloaded app on the TV, and
   reload it after each rebuild — no further packaging steps. (Not `npm run
   dev`: see "Two build variants" above for why the raw dev server doesn't
   work on this TV.)
7. Periodically: `apps/tizen/scripts/build-prod.sh` for a full-fidelity,
   fully local/offline check.
