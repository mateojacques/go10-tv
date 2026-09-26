# Android player spike — findings

Date: 2026-09-26 · Spec: `docs/superpowers/specs/2026-09-26-android-app-design.md` (Phase 0)
· Plan: `docs/superpowers/plans/2026-09-26-android-phase-0-player-spike.md`
· Spike code (throwaway, not merged): `~/Repositorios/go10-tv-spike`

## Verdict

**GO with caveats.** On a real phone, the React Native WebView host page does
everything the player needs for both providers: the embeds load under our
origin, autoplay without a gesture, stream their `postMessage` events into
RN, accept our commands, report `ended`, and can't navigate the app away.
Option C (react-native-tvos on Expo) stands; option A is not needed.

Caveats:

1. **Nothing was run on Android TV.** The emulator is too slow on the
   development machine, so TV testing was taken out of scope for this session
   (user decision). The TV-only rows (remote keys and D-pad focus while the
   WebView plays, the launcher entry) are deferred to real hardware; see
   *Deferred to TV hardware*. Key events injected with `adb` on the phone
   reached `useTVEventHandler`, which is encouraging but not proof.
2. **vidlove has no play/pause command.** Confirmed twice: its bundle's only
   command listener handles seeks, and six `{type:'play'}` messages sent live
   were ignored. The spec's fallback applies: play/pause is disabled for
   vidlove titles; seek works.
3. **vidlove serves redirecting ads.** Two top-frame redirects to an ad domain
   were caught and cancelled by the navigation guard. The guard is a
   requirement, not a nicety.

## Versions

- Expo SDK 57 (`expo@57.0.25`), `react-native@npm:react-native-tvos@0.86-stable`
  (0.86.3-0), `react-native-webview@13.16.1`, `@react-native-tvos/config-tv@0.1.6`
- Phone: Motorola edge 70 fusion, Android 16 (arm64-v8a)
- Build: debug APK from `EXPO_TV=1 npx expo prebuild` + Gradle, JDK 17

## Matrix (phone, inline host page)

| # | Check | ok.ru | vidlove |
|---|---|---|---|
| M1 | Embed loads in the inline host | ✅ host origin `https://tv.go10.blog`, `iframe-load` | ✅ |
| M2 | Autoplay with no gesture | ✅ `inited` → `autoplay` → `started` | ✅ `playing` with no tap |
| M3 | Resume via URL (`fromTime=120`) | ✅ first time 120.0 | n/a (no URL param; vidlove resumed itself at 65.6 s, see Surprises) |
| M4 | Events reach RN | ✅ `timeupdate` ~4 Hz, duration 14,909 s | ✅ `PLAYER_EVENT timeupdate`, duration 2,902 s |
| M5 | Seek command | ✅ `{action:'seek'}`; ok.ru confirms with `rewound {time, previousTime}` | ✅ `{type:'seek'}`; confirmed with `seeked` |
| M6 | Play/pause command | ✅ `{action:'pause'}` → `paused` | ❌ unsupported (ignored; matches bundle) |
| M7 | Keys reach RN while the video plays | ◐ phone + `adb` only: `right`, `fastForward`, `left`, `playPause` all arrived. Not tested on TV. | ◐ same |
| M8 | Back reaches RN, page stays | ✅ `BackHandler` fired; no navigation | ✅ |
| M9 | Top frame can't be navigated away | ✅ blocked `https://ok.ru/video/…` (embed title link) | ✅ blocked 2 ad redirects |
| M10 | `ended` arrives | ✅ after seek to end | ✅ `paused` then `ended` |
| M11 | Embed's own fullscreen (phone) | ✅ works (user report) | ✅ works (user report) |
| — | One TV-configured APK runs on a phone | ✅ installed and ran; `Platform.isTV=false` | |

The served host page (option b) wasn't needed, so `player-host.html` was
never deployed.

## Decisions this settles for the spec

- **Host page:** inline HTML with `baseUrl: SITE_URL` (option a). SITE_URL is
  `https://tv.go10.blog`.
- **vidlove play/pause:** unsupported → disabled for vidlove titles. Seek
  accepts `{type:'seek', time}` (also relative `seekBy`/`delta`, per bundle).
- **ok.ru play/pause:** `{action:'play'}` / `{action:'pause'}`. Its events include
  `started`, `resumed`, `paused`, `rewound {time, previousTime}`, `ended`,
  `inited`, `autoplay`, `volumechange`.
- **Key event names** as `useTVEventHandler` delivers them: `right`, `left`,
  `select`, `playPause`, `fastForward`, `rewind`. Back arrives through
  `BackHandler.hardwareBackPress`, not `useTVEventHandler`.
- **One universal APK:** a TV-configured build (leanback + `touchscreen`
  not required + banner) installs and runs on a phone.
- **Navigation guard:** allow sub-frame loads (`isTopFrame === false`), allow
  top-frame only for `SITE_URL`/`about:blank`, and set
  `setSupportMultipleWindows={false}` so `window.open` hits the guard too.

## Surprises

- **Template dependency quirk** (Phase 2): `@react-native-tvos/virtualized-lists`
  peers on core `react-native`, so npm nests a second, non-TV copy under
  `node_modules/react-native/`. An npm `overrides` entry doesn't dedupe it
  (aliased package). Fix used: tsconfig
  `paths: { "react-native": ["./node_modules/react-native"] }` plus a Metro
  `resolveRequest` that resolves every `react-native` import from the project
  root. The bundle then contains no nested copy (checked via sourcemap: 0 of
  592 sources). The template also ships no `tsconfig.json`.
- **JDK:** the machine's default is JDK 25; builds need
  `JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64`.
- **Cold debug build takes ~11 min** (4 ABIs). Phase 2 should build
  `-PreactNativeArchitectures=arm64-v8a` for day-to-day phone work.
- **vidlove resumes by itself** from its own `localStorage` (anything watched
  >10 s). It stacks with our seek-on-first-`time` resume. Harmless when both
  agree, but the app's resume should win (Phase 4 detail).
- **vidlove sends duplicate `seeked` events:** one with the new time and no
  ids, and a second tagged with `tmdbId` that carries the previous time. The
  production parser ignores `seeked`, so no action is needed; don't start
  relying on it.
- **vidlove also posts `MEDIA_DATA`** every ~5 s (title/poster/progress).
  Currently unused.
- **ok.ru posts a Yandex Metrica `initToParent` string** to the parent. It's
  JSON text rather than an object, and the parser must ignore it (it does).
- **Touch focus on the phone:** while the user was tapping the embed, two
  injected media keys didn't reach RN, because focus had moved into the
  WebView. That's expected on a phone. It's the same question M7 asks on TV,
  where the WebView is non-focusable.

## Deferred to TV hardware

Run these first once an Android TV device is available (before or during
Phase 3):

- M7 on TV: every remote key (D-pad, Select, Play/Pause, FF/RW) reaches
  `useTVEventHandler` while the WebView plays, with `focusable={false}` on the
  WebView.
- M8 on TV: the remote's Back reaches `BackHandler`.
- Autoplay and `timeupdate` on the TV's system WebView version.
- The app appears in the TV launcher's app row with its banner.
