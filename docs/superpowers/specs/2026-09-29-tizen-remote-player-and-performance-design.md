# Tizen: remote-controlled player and performance

**Status:** proposed, 2026-09-29
**Target:** Samsung T5300, Tizen 5.5 (Chromium 69), prod `.wgt` (`Go10TVprd1.GO10TV`)

## Goals

1. **Primary: control playback with the remote.** Play/pause and seeking are
   vital. Today the player can only be left or reloaded: no key pauses,
   resumes or seeks.
2. **Secondary: keep cutting input latency.** The first pass helped but
   didn't fix it.

This covers items 4 (own scrolling + virtualization) and 7 (native playback)
from the original TV performance review. The remote-control goal is split so
it doesn't have to wait for item 7: phase 1A uses the embeds we already have,
and phase 1B is the native-playback change.

## Where things stand

Done (commits `82f9ab1`, `ee8930d`, `a1a36f7`):

- TV lite mode (`go-tv` on `<html>`): no grain, vignette, blurs, blend modes
  or `filter` transitions; focus animates `transform` only.
- Held arrow-key repeats are dropped until the previous move has painted.
- `scrollIntoView` is instant on TVs.
- Only the active hero slide and its two neighbours hold their art.
- Fonts are bundled.
- The Back key (10009) works without the `tizen` global.
- The prod build loads from `file://` (classic IIFE script), and installs
  via `apps/tizen/scripts/install-wgt.sh`.

Still open, and not covered below: `focusedId` still lives in React context,
so every arrow press re-renders every focusable card on the screen (item 3
of the review). Item 4 reduces how many cards exist, which shrinks that cost.
The context fix is still worth doing on its own.

## 1A. Remote control over the existing embeds

### Why this works without native playback

The player already talks to the embeds over `postMessage`
(`apps/web/src/screens/Player.tsx`). Each provider in
`packages/core/src/player/providers/` defines its commands:

| Provider | Seek | Play / pause | Events out |
|---|---|---|---|
| ok.ru (`okru.ts`) | `{action: 'seek', time}` | `{action: 'play' \| 'pause'}` | `timeupdate`, `paused`, `ended` |
| vidlove (`vidlove.ts`) | `{type: 'seek', time}` | none | `timeupdate`, `pause`, `ended` |

The web player only uses `seekMessage`, for resume and chapter jumps.
`playMessage` and `pauseMessage` are never sent, and no key is mapped to any
command. The Android app already has the key map, in
`apps/mobile/src/player/playerKeys.ts`, and has been checked on TV hardware
(`docs/superpowers/tv-checklist.md`, Phase 4).

### Key map

Same behaviour as Android's `playerKeyAction`, so both apps act alike:

| Key | Bar closed | Bar open |
|---|---|---|
| Play/Pause, Play, Pause | toggle / play / pause | same |
| FF / RW | seek ±10 s | same |
| Next / Previous track | next / previous episode | same |
| Left / Right | seek ±10 s | move between bar buttons |
| OK / Up | open the bar, focus play/pause | activate the button |
| Back | leave the player | close the bar |

Seek targets are computed from the last `timeupdate` position (`positionRef`).
Clamp them to `[0, duration]`, and to the chapter's range when the row has
`chapter_start_seconds`/`chapter_end_seconds`.

### Changes

1. **Move `playerKeys.ts` to `packages/core/src/player/`.** It has no platform
   code, and it's already tested. Android imports it from there, and so does
   web.
2. **Map DOM key events to `RemoteKey` in web**, e.g. a new
   `apps/web/src/player/remoteKey.ts`. Tizen delivers media keys as keyCodes,
   not `event.key` values:

   | Tizen key name | keyCode |
   |---|---|
   | `MediaPlayPause` | 10252 |
   | `MediaPlay` | 415 |
   | `MediaPause` | 19 |
   | `MediaFastForward` | 417 |
   | `MediaRewind` | 412 |
   | `MediaTrackNext` | 10233 |
   | `MediaTrackPrevious` | 10232 |

   Also accept the standard `event.key` values (`MediaPlayPause`, etc.) so
   desktop keyboards and tests work.
3. **Register the media keys** in `installTizenPlatform`, next to `Back`, each
   in its own `try`. Tizen doesn't send unregistered media keys to the page.
   The `tv.inputdevice` privilege is already in `config.xml`.
4. **Player: one keydown handler driven by `playerKeyAction`.** It replaces
   the ad-hoc Shift+Arrow handling. Keep `f`/`r` for desktop.
5. **Track play state.** `timeupdate` means playing and `paused` means paused.
   Toggle sends `pauseMessage` or `playMessage` to match.
6. **Add a play/pause button to the bar**, focused when the bar opens. Hide it
   for vidlove, which has no play/pause command: Android does the same.
7. **Show feedback on screen.** A small overlay shows `+10 s` / `−10 s` or ▶/❚❚
   and the target time. The embed's own reaction arrives late on this TV, and
   without feedback repeated presses feel lost.
8. **Collapse quick seek presses.** Several presses within ~400 ms add up to
   one seek message (e.g. `+30 s`), instead of three seeks the TV has to
   process one by one.

The existing focus guard stays. It keeps a real `<button>` focused and takes
focus back from the iframe on window `blur`, and it's what lets keys reach
the page at all.

### Unknowns to check first (on the TV, with `sdb shell 0 debug`)

- Which keys the T5300's remote actually sends. The basic remote may have no
  media keys, which would make the D-pad column above the whole feature.
  Log `event.key` / `event.keyCode` from the prod build.
- Whether ok.ru's embed honours `play`/`pause`/`seek` on Chromium 69. The
  commands were confirmed on real traffic, but never tested on this TV.
- Whether the iframe still takes focus on the first click/OK, despite the
  guard.

### Tests

- Core: the key map moves over with its existing tests.
- Web: the keyCode → `RemoteKey` mapping, and Player tests posting the right
  message per key (the existing `Player.test.tsx` fakes `contentWindow`).
- TV: play/pause, ±10 s, held FF, a burst of Right presses, Back
  closing the bar and then leaving, and the same checks on a vidlove title.

## 1B. Native playback (item 7)

Replaces the ok.ru iframe with a stream we play ourselves, via AVPlay
(Samsung's native player) or `<video>`.

**Why:** the iframe loads a full ad-heavy ok.ru page inside a weak browser,
competes with our UI for CPU, fights us for focus, and only offers the
commands its `postMessage` API happens to support. Native playback gives
hardware decoding, exact position/buffering state, and full control from
the remote. It's what the grade-A apps do.

**How:**

1. Fetch the embed's metadata from the TV. The `/videoembed/` page carries
   `flashvars`/`data-options` with the stream URLs (HLS `.m3u8` and/or MP4
   per quality). The prod app's `<access origin="*">` already allows the
   cross-origin request.
2. Pick the stream: HLS if available, otherwise the best MP4 ≤ 1080p.
3. Play it with AVPlay (`webapis.avplay`) where available. It needs
   `<script src="$WEBAPIS/webapis/webapis.js">` and the
   `http://developer.samsung.com/privilege/avplay` privilege. Fall back to
   `<video>`.
4. Keep the iframe path as the fallback when extraction or playback fails,
   and for vidlove.

**Spike first (a few hours, throwaway):** on the TV, fetch one known ok.ru
video's embed page, pull out the stream URL, and play it with AVPlay.

- Go if it plays, seeks, and still plays after ~1 h.
- No-go if:
  - the stream URLs are signed to the requesting IP or session and expire
    mid-film, or
  - ok.ru blocks the request (403, captcha, needs cookies), or
  - AVPlay rejects the stream.

**Risks:** ok.ru can change its page format at any time, and parsing it is
brittle. Keep the parser small, tested against saved pages, and fall back to
the iframe on any failure. It's also unofficial use of ok.ru's streams, which
is fine for a personal sideloaded app.

If the spike is a go, 1A's key map and on-screen feedback carry over
unchanged: only the thing receiving the commands changes.

## 2. Scrolling and virtualization (item 4)

**Why:**

- Home renders every row, and each row renders every card. The catalog has
  ~4,400 entries; Catalog pages through `titles.slice(0, limit)`.
- Rows scroll natively (`.go-row_track { overflow-x: auto }`), and the page
  scrolls with `overflow-y: auto` plus `scrollIntoView`. On Chromium 69 a
  native scroll repaints the scrolled layer. Lite mode made it instant, but
  not cheap.

### Changes

1. **Scroll with transforms.**
   - Row tracks become `overflow: hidden` with an inner strip moved by
     `transform: translate3d(x, 0, 0)`. Snap it so the focused card sits at a
     fixed column (the Netflix pattern), with no native scroll.
   - Do the same vertically for Home: a translated column of rows, keeping the
     focused row at a fixed offset under the navbar.
   - Drop `scrollIntoView` from `FocusProvider.move` on TVs.
2. **Virtualize rows horizontally.** Mount only the cards in view, plus 2–3
   on each side. Cards have a fixed width, so the offset is simply
   `index × pitch`, with no measuring. Keep each card's spatial-nav
   registration keyed by `row`/`col` so focus can target cards that aren't
   mounted yet: moving mounts the target first, then focuses it.
3. **Virtualize Home vertically.** Mount the focused row ±2. The rest are
   placeholders of fixed height, so the translate math stays exact.
4. **Catalog grid:** the same windowing by row of the grid, replacing the
   growing `limit`.
5. **Right-size images.** Thumbnails load at their displayed size
   (pre-sized files or a `srcset`), keep `loading="lazy"`, and unmounted cards
   release their `<img>`.

Desktop keeps native scrolling. The transform path is only active under
`go-tv`, like the lite styles.

### Order and measurement

Record a DevTools Performance trace of five Right presses and five Down
presses on Home before and after each step. Attach with
`sdb shell 0 debug Go10TVprd1.GO10TV`, then `sdb forward` and
`chrome://inspect` (`docs/tizen-sdb-setup.md` §5). Target: a key press is
painted in under 100 ms. Do the context fix (item 3) either first or
alongside step 2, since virtualization and per-card subscriptions compound.

## Order of work

1. **1A remote control:** the primary goal, and small. Start by logging the
   remote's key codes on the TV.
2. **1B spike:** a go/no-go on native playback. If it's a go, schedule it as
   its own plan.
3. **Measure, then 2 + the focus-context fix,** re-measuring after each step.
