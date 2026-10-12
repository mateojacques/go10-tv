# Android TV player controls — design

Status: **draft for review** (2026-10-12). Builds on
`docs/superpowers/specs/2026-09-26-android-app-design.md` (Player section) and
the Phase 0 spike (`docs/superpowers/spikes/2026-09-26-android-player-spike.md`).

## Problem

On Android TV the player WebView is non-focusable (`PlayerView.tsx`,
`focusable={!tv}`) so every remote key reaches RN. The cost: the embed's own
UI is unreachable without a mouse. Today a TV user can only:

- seek in blind ±10 s steps (no position, no feedback),
- play/pause (ok.ru only),
- go prev/next episode and leave, from a minimal top bar.

Quality, subtitles, audio track, server and speed — all inside the ok.ru /
vidlove iframes, on foreign origins — cannot be reached at all. Neither
embed's `postMessage` API exposes them (ok.ru: play/pause/seek/volume/mute;
vidlove: seek only).

**Goal:** every player action is doable with the remote alone, with a UX
built for a TV. Phone behaviour is unchanged.

## Decisions (from brainstorming)

- **Native menus + pointer fallback.** Our own TV menus for the settings the
  embeds expose (via a script injected into the embed frames); a D-pad
  "pointer mode" reaches anything else, and is the safety net when an embed
  changes and the injected script stops finding things.
- **No native video playback** (no stream extraction, no ExoPlayer). Embeds
  stay as they are; no new hosts.
- **TV-only UI change.** `Platform.isTV` gets the new overlay; the phone
  keeps its current bar and the embed's own touch UI.
- **Developed blind.** No Android TV device is available. Everything is
  verified on the phone (adb-injected keys) and in desktop Chrome, then a
  release APK goes to an outside tester. The build must therefore explain
  itself: a diagnostics panel and a tester checklist are part of the scope.

## 1. TV control overlay

Replaces the top bar on TV (`PlayerView` renders `TvPlayerOverlay` when
`Platform.isTV`).

**States**

| State | Shown | Keys |
|---|---|---|
| `hidden` | video only | Left/Right: seek ±10 s and flash the *seek toast*; Select/Up/Down/Info: open overlay; media keys as today |
| `open` | bottom overlay: title + episode label, scrub bar, button row | D-pad moves focus; auto-hides after 5 s without input |
| `scrubbing` | scrub bar focused, preview marker + preview time | Left/Right move the marker; Select commits one seek; Back cancels |
| `menu` | right-side picker panel over the overlay | Up/Down choose, Select applies, Back closes the panel |
| `pointer` | cursor over the video, small hint "Atrás para salir" | D-pad moves cursor, Select taps, Back leaves pointer mode |

Back always unwinds one level: menu → open → hidden → leave the player.

**Seeking**

- Seek toast (overlay hidden): a slim bar at the bottom with the target time,
  visible ~1.5 s after the last press. Repeated presses accumulate using the
  session's existing `seekCoalesceMs` so the embed gets one seek.
- Scrubbing: the marker moves in steps that grow while the key is held
  (10 s → 30 s → 60 s after ~1 s and ~3 s of repeat). Nothing is sent until
  Select. Chapter limits (`seekBy` stays within the chapter) apply to the
  committed target.
- FF/RW behave like Right/Left in whichever state is current.
- Position and duration come from the session (the embeds' `timeupdate`);
  the session gains a read-only `position()` / `duration()` if it lacks them.

**Button row** (left to right; a button exists only when available):
Play/Pause (when `canTogglePlay`), Anterior, Siguiente, **Calidad**,
**Subtítulos**, **Audio**, **Más** (speed, server — whatever the embed
offers beyond the others), **Modo puntero** (always).

**Picker panel**: vertical list, current option checked, opens with focus on
the current option. Applying closes the panel and shows a short confirmation
toast ("Calidad: 720p"). If the bridge reports the change failed, the toast
says so and suggests Modo puntero.

The key → action mapping is a pure reducer in `packages/core/src/player/`
(extending `playerKeys.ts`: `(state, key) → {state, effects}`), so it is
unit-tested and reusable by the Tizen web player later.

## 2. Embed bridge

**Injection.** `react-native-webview` 13.16 stores
`injectedJavaScript*ForMainFrameOnly` on Android but never uses them, so
scripts only run in our host page. A small Expo config plugin + native
module (`apps/mobile/modules/embed-bridge`) calls
`WebViewCompat.addDocumentStartJavaScript(webView, script, origins)` (androidx.webkit,
guarded by `WebViewFeature.isFeatureSupported(DOCUMENT_START_SCRIPT)`) with
origins `https://ok.ru` and `https://player.vidlove.cc`. The script then runs
at document start **inside the embed frame**.

If the feature is unsupported (old system WebView), the bridge reports
`unsupported` and the menus simply don't appear; pointer mode still works.

**Protocol.** Inside the frame the script talks to the parent with
`window.parent.postMessage({go10Bridge: …}, '*')`; the host page already
relays messages from the provider origin to RN. Commands go the other way
through the existing `go10Command` relay.

- frame → RN: `{go10Bridge: 'caps', caps}` whenever options change, and
  `{go10Bridge: 'result', id, ok, error?}` after a command.
- RN → frame: `{go10Bridge: 'set', id, setting, value}`.
- `caps`: `{ quality?, subtitles?, audio?, speed?, server? }`, each
  `{ options: {value, label}[], current }`. Missing key = not available.

**Adapters.** One per provider (`ok.ru`, `vidlove`). Each adapter reads the
options from the player's DOM/JS state and applies a choice. The concrete
selectors and APIs come from the **probe phase** (below); the spec fixes only
the contract. Rules:

- Defensive: every lookup can fail; a failed lookup removes that capability,
  never throws into the page.
- No clicking around visibly: prefer the player's own JS API; fall back to
  driving its menu elements only if no API exists.
- Adapter source lives as TypeScript in `packages/core/src/player/bridge/`,
  bundled to a string at build time; `parse`/caps validation is unit-tested.

**Probe phase (first implementation task).** Inspect ok.ru's and vidlove's
embed pages in desktop Chrome: which of quality / subtitles / audio / speed /
server exist, where their state lives, how to set them. Output: a short
findings note in `docs/superpowers/spikes/` that pins the adapter design and
the final menu list. If a provider exposes nothing usable, that provider
ships with pointer mode only.

## 3. Pointer mode

- A cursor (our own view, above the WebView) moved by the D-pad; speed ramps
  while a key is held. Select sends a tap at the cursor.
- The tap is a real `MotionEvent` (down + up) dispatched to the WebView by the
  same native module (`dispatchTouchEvent` on the RNCWebView), so cross-origin
  iframes receive it like a finger tap.
- The WebView stays non-focusable; keys keep reaching RN.
- Entered from the overlay button; Back exits. The overlay is hidden while
  pointing so the embed's UI is uncovered.

## 4. Blind-testing support

- **Diagnostics panel** — opened by holding Info, or pressing Up five times
  quickly with the overlay open. Shows: app version, Android + WebView
  version, provider, last 10 keys received (name + action), bridge status
  (`unsupported` / `waiting` / caps found), last bridge command results.
  Built to be photographed.
- **Tester checklist** — `docs/android-tv-tester-checklist.md`, in Spanish
  (the tester is not a developer): install steps, what to try (one ok.ru
  title with several qualities, one vidlove title with subtitles), and which
  screens to photograph.
- **Release APK** built for `arm64-v8a` and `armeabi-v7a` (many TV sticks run
  32-bit userlands).

## 5. Testing

- Unit (core, vitest): overlay reducer (every state × key), scrub step
  acceleration, seek clamping, caps parsing / validation, bridge message
  routing.
- Component (mobile, jest): `TvPlayerOverlay` rendering per caps, picker
  panel focus and apply, Back unwinding.
- Phone, over adb: `adb shell input keyevent` for D-pad, Select, media keys
  with a TV-mode debug build — overlay flow, menus applying on both
  providers, pointer taps landing in the embed.
- TV: the outside tester runs the checklist and returns photos.

## Out of scope

Native playback, new providers, phone UI changes, Watch Next / voice search,
persisting preferred quality or subtitle language across titles (candidate
follow-up once the bridge proves stable).

## Risks

- **Embeds change.** Adapters break silently → caps disappear, pointer mode
  remains. Diagnostics make the breakage visible.
- **`addDocumentStartJavaScript` in cross-origin iframes** must be confirmed
  on the phone's WebView before building on it (first check of the probe
  phase). Fallback if it fails: pointer mode only.
- **Untested TV key delivery** (spike M7 deferred). The diagnostics key log
  answers it on the first tester run.
