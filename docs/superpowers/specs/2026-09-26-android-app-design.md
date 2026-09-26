# Android app (TV + phone) — design

Status: **approved design** (2026-09-26). Phase 0 done: **GO with caveats**
(findings: `docs/superpowers/spikes/2026-09-26-android-player-spike.md`).

## Problem

GO10 TV is a web app. On a TV it runs in the TV's browser, which is the
weakest way to use a 10-foot, remote-driven interface: no launcher entry, no
native remote handling, browser chrome and quirks in the way. On phones it
works, but still as a website.

Goal: a native Android app, installed from a sideloaded APK, that is **first
an Android TV / Google TV app** (launcher banner, driven entirely by the
remote) and **second a better phone experience**, at full feature parity with
the web app as it stands today. Learning Android/React Native along the way is
an explicit, if secondary, motive.

## Decisions (from brainstorming)

- **Framework: React Native via `react-native-tvos`, on Expo.** Fallback, only
  if Phase 0 shows C is unworkable: a fully native Kotlin + Jetpack Compose
  (`androidx.tv`) rewrite, with its own spec.
- **Playback stays on the third-party iframe embeds** (ok.ru, vidlove). No
  stream extraction, no native video player, no downloads.
- **Full parity in v1:** Home (hero, collection strip, all 28 rows), catalog
  grids (Películas / Series), search (incl. "Quizás te interese"),
  collections, Detail (seasons, episodes, Reanudar, progress bars), Player
  (ok.ru + vidlove, progress, resume, prev/next, auto-advance), Seguir viendo,
  and external titles (TMDB + vidlove) behind their switch.
- **Catalog data is fetched at runtime from the Netlify deploy** and cached;
  a catalog change never requires a new APK.
- **Monorepo with a shared TypeScript core.** The web app keeps living;
  pure logic moves to `packages/core` and both apps import it.
- **Progress is per-device.** No backend, no sync, no accounts.
- **TV extras in v1:** launcher banner/icon and remote media keys
  (play/pause, FF/RW). Not in v1: Watch Next channel, voice search.
- **Phone extras in v1:** same look as the current mobile web pass; the
  player forces landscape and immersive fullscreen.
- **One universal APK** for phone and TV; device mode decided at launch.
- **Faithful port, not a redesign** of the current UI.
- **Out of scope:** Play Store release (sideload only for now), PiP, sync,
  Watch Next, voice search, changes to the Python pipeline or Aniyomi feed.

## Success criteria (v1)

On a real Android TV device (once bought): launch from the
launcher, browse with only the D-pad, search, open a series, play an episode,
press Back mid-episode, relaunch, resume from Seguir viendo. Every web screen
reachable; focus never lost. On the phone: the same flow by touch, with the
player in landscape fullscreen.

## Development constraints

- No Android TV hardware yet (the user's TV runs Tizen). Development targets
  **the user's Android phone only**; the Android TV emulator is too slow on
  the development machine and is not used. TV behaviour (D-pad focus, remote
  keys, launcher) is built to the design and verified later on real hardware,
  starting with the spike's *Deferred to TV hardware* list.
- Verification is **manual by the user** on-device, per phase, not by
  automated emulator or browser runs. TV focus checklists accumulate per phase
  and are run once hardware is available.
- No deadline; phased delivery, each phase installable.

## Architecture

### Repo layout

```
go10-tv/                      npm workspaces
├── packages/core/            pure TS, no DOM, no RN — Vitest
│   ├── catalog/     loadCatalog (CSV→rows), buildRows, selectTitles, rowKey
│   ├── search/      search
│   ├── collections/ validateCollection, resolveCollection (data passed in)
│   ├── progress/    progressStore, titleProgress, describe — over KeyValueStore
│   ├── player/      providers (okru, vidlove), embedSrc, nextEpisode,
│   │                playerRetry, groupSeasons
│   ├── external/    tmdb client/map/keys, mergeSearch, snapshots (config injected)
│   ├── router/      Route union, parseRoute, routeToPath, resolveRoute
│   ├── featured.ts  the fixed hero promo slot (moved out of Home.tsx)
│   └── lib/         format, imageSrc (base URL injected)
├── apps/web/                 today's Vite app, moved; imports @go10/core
├── apps/mobile/              Expo + react-native-tvos app
├── data/, scripts/, assets/, tests/   unchanged; Python pipeline stays at root
```

`public/` (catalog.csv, the Aniyomi feed, the assets symlink) moves with
`apps/web`; the Python scripts' output paths and the `public/assets` symlink
target are updated to match, nothing else about them changes.

### Ports

Core never touches storage, env or the network directly:

| Port | Web adapter | Mobile adapter |
|---|---|---|
| `KeyValueStore` (sync get/set/remove/keys) | `localStorage` / `sessionStorage` | MMKV (`react-native-mmkv`) |
| `CatalogSource` (CSV text + collections) | bundled files, `import.meta.glob` | HTTP from `SITE_URL`, cached |
| `ExternalConfig` (switch + TMDB token) | `import.meta.env` | Expo `extra` (baked at build) |
| image base URL for `imageSrc` | `/` | `SITE_URL` |

MMKV is chosen because it is synchronous, so the progress code keeps its
current synchronous shape.

### Stays platform-specific (not in core)

React components, CSS, the web focus system (`FocusProvider`,
`useFocusable`, `inputMode`), routing hooks (`useRoute`), and the Player
component. The mobile app reimplements these on RN primitives.

### Collections published as JSON

The web build copies `data/collections/*.json` into one
`/data/collections/index.json` (an array of every collection) served by
Netlify. The web app keeps bundling its own copy.

## Data flow (mobile)

Source of truth: the Netlify deploy at build-time `SITE_URL`.

| What | URL | Cached as |
|---|---|---|
| Catalog | `/data/catalog.csv` (~1.3 MB) | raw text on disk + `ETag` |
| Collections | `/data/collections/index.json` | raw text on disk + `ETag` |
| Art | `/catalogo_files/…`, `/assets/…`, TMDB absolute URLs | `expo-image` disk cache |

Launch (stale-while-revalidate):

1. Cache present → parse and render Home immediately.
2. Always → background fetch with `If-None-Match`. `304`: nothing. `200`:
   store; the new data is applied the next time the user lands on Home, never
   mid-browse (rows must not shift under the D-pad).
3. No cache and fetch fails → full-screen "Sin conexión" with a focused
   "Reintentar".

Parsing uses core's `parseCatalogCsv` / `buildTitles` unchanged. Collections
run through `validateCollection`; on mobile an invalid collection is dropped
and logged, never fatal.

Progress and TMDB snapshots live in MMKV with the same keys and formats as
the web app. TMDB is called directly from the app with the baked token.

## Navigation, focus, layout

### Routes → screens (expo-router stack)

| Route | Screen |
|---|---|
| `/` | Home |
| `/peliculas`, `/series`, `/buscar?q=&en=&solo=` | Catalog (one screen) |
| `/coleccion/[id]` | Collection |
| `/title/[key]` | Detail |
| `/title/[key]/play/[videoId]` | Player (full-screen modal) |

The core `Route` union and `parseRoute` / `routeToPath` are the shared model.
Back is the stack: player → detail → origin screen → home; Back on Home exits
the app. Hardware back, the phone back gesture and the remote Back key all go
through it. Unknown route or missing key → Home.

### Device mode

Decided once at launch: `Platform.isTV` → TV layout (10-foot, one item always
focused); otherwise phone layout (touch, no focus ring). No runtime
keys ↔ pointer switching.

### TV focus

Uses react-native-tvos's native focus engine, not a port of `FocusProvider`:

- Every card, chip, season tab and episode is a `Pressable` (focusable on TV).
- Each row/grid is wrapped in `TVFocusGuideView` with `autoFocus`, so
  entering a row restores its last-focused item rather than the nearest by
  geometry.
- Horizontal rows are `FlatList`s with a generous `windowSize` so focus never
  targets an unrendered item.
- Each screen declares initial focus via `hasTVPreferredFocus`: Home → hero
  play, Detail → Play/Reanudar, Catalog → first result. Returning via Back
  restores focus to the item that opened the next screen.

### Search on TV

The input opens Android's IME; results update as you type (debounced); Down
moves from the input to the first result. The web's custom typing mode is not
ported — the IME owns editing keys.

### Styling

`tokens.css` becomes `theme.ts` (colours, spacing, type scale) with TV and
phone scales. Hero (blurred art field + crisp art), collection strip, cards
and episode grid are rebuilt as RN components matching the current CSS.

## Player

### Hosting

```
RN Player screen
 └─ WebView  (focusable=false on TV, full screen)
     └─ host page  ← HTML we own, origin = SITE_URL
         └─ <iframe src="ok.ru/videoembed/… | player.vidlove.cc/embed/…">
```

- The host page listens for `message`, keeps only messages from the
  provider's `origin`, and forwards them via
  `window.ReactNativeWebView.postMessage`. RN runs them through the
  provider's existing `parse()` from core.
- Commands: RN calls `injectJavaScript` →
  `iframe.contentWindow.postMessage(cmd, origin)`, with `cmd` from the
  provider (`seekMessage`, plus new `playMessage` / `pauseMessage`).
- Host page origin (settled in Phase 0): inline HTML with
  `baseUrl: SITE_URL` (`https://tv.go10.blog`). Both embeds accept it; no
  served host page is needed.
- The navigation guard is required: vidlove serves ads that redirect the top
  frame. Allow sub-frame loads (`isTopFrame === false`); allow top-frame only
  for `SITE_URL` / `about:blank`; `setSupportMultipleWindows={false}` so
  `window.open` hits the guard.
- WebView: `mediaPlaybackRequiresUserAction={false}`,
  `allowsFullscreenVideo`, and any top-level navigation away from the host
  page is cancelled.

### Behaviour kept from core

Resume (ok.ru via `fromTime` in the URL; vidlove seeks on first `time`
event), progress saved at most every 5 s and on pause and close, plus on app
background (`AppState`, new). `ended` → auto-advance to the next episode;
chapter-end handling; the retry reducer and 8 s load timeout; fallback link
(`Abrir en ok.ru` / vidlove) via `Linking.openURL`.

### TV remote

The remote never enters the WebView; the embed's own controls are
unreachable on TV, so the overlay covers everything.

| Key | Action |
|---|---|
| Play/Pause (media) | toggle play/pause |
| FF / RW (media) | seek ±10 s from the last reported time |
| D-pad Left/Right, bar hidden | seek ±10 s |
| Select or Up, bar hidden | open the bar (back, prev, play/pause, next); focus moves into it |
| Back | bar open → close bar; bar closed → leave player |

ok.ru play/pause is `{action: 'play'|'pause'}` (confirmed in Phase 0).
vidlove has **no** play/pause command (bundle and live test agree), so
play/pause is disabled for vidlove titles; seek (`{type:'seek', time}`) works.
Back arrives via `BackHandler`, the other keys via `useTVEventHandler`
(`right`, `left`, `select`, `playPause`, `fastForward`, `rewind`).

### Phone

The player locks to landscape (`expo-screen-orientation`) and goes immersive
(status and navigation bars hidden); leaving it restores portrait. Touch goes
straight to the embed's own controls. The overlay bar behaves as on the web
(tab at the top edge).

## Error handling

| Failure | Behaviour |
|---|---|
| First launch, no network, no cache | "Sin conexión" + focused "Reintentar" |
| No network, cache present | run from cache; background refresh fails silently |
| CSV fetched but unparseable | keep previous cache; none → error screen |
| Invalid collection JSON | drop that collection, log, show the rest |
| Embed not loaded in 8 s | existing retry/backoff, then the browser fallback link |
| TMDB failure / rate limit | catalog-only results, as the web |
| Broken thumbnail | the card's placeholder colour |
| Unknown route / missing key | Home |

## Testing

- `packages/core`: Vitest; today's logic tests move with their code. Each
  port has an in-memory fake.
- `apps/web`: component tests stay. **Phase 1 gate: all 398 JS tests and
  91 Python tests that existed at the start of Phase 1 pass** (the spec
  originally quoted stale README counts).
- `apps/mobile`: Jest + `@testing-library/react-native`:
  - player bridge: host-page messages → `parse` → progress writes; commands
    → `injectJavaScript` (mocked WebView)
  - the player's key map (media keys and D-pad → commands and bar state)
  - the SWR loader: cache hit, `304`, `200` applied on next Home, failures
  - screens rendering from fixtures; back behaviour
- TV focus: a manual checklist per phase (every item reachable, focus
  restored after Back, never lost), run by the user on TV hardware once
  available.

## Builds

- Dev: `npx expo start` with a development build (`expo-dev-client`), hot
  reload on the phone. Day-to-day builds use
  `-PreactNativeArchitectures=arm64-v8a` (a 4-ABI cold build took ~11 min).
- The tvos template nests a second, non-TV `react-native` under
  `node_modules/react-native/`; pin resolution to the root copy in both
  `tsconfig.json` (`paths`) and `metro.config.js` (`resolveRequest`).
- Release: `npx expo prebuild` + `./gradlew assembleRelease` locally → one
  universal APK, sideloaded with `adb install`. A local keystore, kept out of
  git and stable across builds so updates install over the previous version.
- `@react-native-tvos/config-tv` sets the TV manifest (leanback launcher,
  banner, touchscreen not required). The `react-native-tvos` version must
  match the Expo SDK's React Native version.
- Config: `SITE_URL`, `EXTERNAL_TITLES`, `TMDB_TOKEN` from `.env` via
  `app.config.ts`, baked at build time.
- Machine prerequisites: Android SDK + platform-tools, JDK 17 (the machine
  default is 25: set `JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64`).

## Phases

Each phase ends installable and gets its own implementation plan, written
after the previous phase is done.

| # | Phase | Delivers | Done when |
|---|---|---|---|
| 0 | Spike (throwaway) | Expo TV dev build; one hard-coded ok.ru episode and one vidlove title in the WebView host page | ✅ Done 2026-09-26 on the phone (TV deferred to hardware). On the phone: autoplay; `timeupdate`/`ended` reach RN; seek and play/pause from remote keys; the embed can't navigate the host away. **Output: go/no-go on C.** Code discarded. |
| 1 | Monorepo + core | npm workspaces; `packages/core` with ports; `apps/web` moved; collections JSON published | ✅ Done 2026-09-26 (415 JS + 92 Python). 398 + 91 baseline tests pass; Netlify deploy unchanged; `/data/collections/index.json` served |
| 2 | App skeleton + data | `apps/mobile` (Expo, tvos, router, MMKV, theme); SWR loader; error screen; a plain title list | ✅ Done 2026-09-26 (phone): live catalog (858 títulos), offline from cache, Sin conexión → Reintentar. Live catalog shown on both devices; cache works offline |
| 3 | Home | Hero, collection strip, 28 rows, TV focus guides | Every Home item reachable by D-pad, focus never lost; phone touch scroll |
| 4 | Detail + Player | Detail (seasons, episodes, Reanudar, progress bars); the real player from Phase 0's findings, with the full TV key map (D-pad + media keys) | Success flow end to end: play → Back → relaunch → resume; auto-advance |
| 5 | Seguir viendo, catalog, search, collections | The remaining screens | Every web screen has a counterpart |
| 6 | External titles | TMDB search, detail, vidlove playback behind the switch | Parity with the web's external titles |
| 7 | Polish | Launcher banner/icon, phone landscape + immersive player, signed release APK | v1 success criteria met on both devices |

**If Phase 0 fails:** stop and write a new spec for the Kotlin + Compose
rewrite. Phase 1 then loses its reason to exist (a TS core doesn't serve a
Kotlin app) and is dropped.

## Risks

- **Android TV focus is proximity-based** and can be lost across screen
  transitions (react-native-screens #1706). Mitigated by focus guides,
  explicit preferred focus per screen, and per-phase manual checks.
- **Embeds may reject the WebView host.** Retired on the phone in Phase 0;
  recheck on the TV's system WebView.
- **react-native-tvos lags Expo SDKs** by roughly a release; pin matching
  versions and upgrade deliberately.
- **No TV testing until hardware exists:** TV-specific bugs (WebView taking
  focus from the remote, key codes, launcher) surface late. Accepted; the
  spike's deferred list is the first thing to run on a device.
