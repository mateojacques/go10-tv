# Player reliability on low-end TVs — design

## Problem

The app's primary target device is an old, slow TV. Two distinct problems
show up there:

1. **The embedded OK.ru player (`src/screens/Player.tsx`) is unreliable.**
   It fails to load and needs several retries, sometimes freezes mid-playback
   (video frame frozen, audio still running), and recovering today means
   reloading the *entire app* and re-navigating from Home → Detail → Play.
2. **The app itself is slow on this hardware**, independent of the player —
   most visibly, `useCatalog` re-fetches and re-parses the full 907-row CSV
   catalog on every load, which also makes "just refresh the page" a poor
   recovery path today.

## Key constraint discovered during research

OK.ru's `/videoembed/` iframe has **no documented postMessage API or any
other cross-origin hook**. Once the iframe has loaded, the app cannot read
its playback position, detect play/pause state, or detect a mid-playback
freeze. This ruled out fully automatic freeze detection and precise
timestamp resume; the design below works within that constraint rather than
around it.

One usable lever was found: OK.ru's player is known to honor a `fromTime=
<seconds>` query parameter (documented behavior of yt-dlp/youtube-dl's
Odnoklassniki extractor, confirmed for `ok.ru/video/...` URLs). It is
**unconfirmed** whether `/videoembed/...` (the iframe form actually used
here) honors it the same way. The design treats it as best-effort: if OK
ignores the parameter, playback just starts at 0 instead of seeking — never
a crash or broken state. This should be confirmed empirically when testing
on the real TV.

## Goals

- A URL that identifies "this title, playing this video," refreshable
  without losing place in the app.
- A way to reload *only* the player in place, without a full app reload.
- Best-effort resume near where playback was left off after a reload.
- Automatic recovery from *load failures* (the case that's actually
  detectable).
- A full-page refresh — the fallback recovery path when in-place reload
  isn't enough — should not be slow to restore catalog data.

Explicitly out of scope: automatic detection of mid-playback freezes (not
technically possible without cooperation from the OK.ru player), and a
general "continue watching" feature (this is crash/freeze recovery only).

## 1. Router

A small hand-rolled router, not `react-router`. Rationale: the app already
hand-rolls its own focus/navigation system (`src/focus/`) rather than using
a library, the route space is exactly three shapes, and avoiding a routing
dependency keeps JS payload down on hardware where that already matters.

Routes:

| Path | Renders |
|---|---|
| `/` | Home |
| `/title/:key` | Detail |
| `/title/:key/play/:videoId` | Detail (underneath, unmounted-visually) + Player overlay |

`:key` is `Title.key` (today: `series_id \|\| video_id`). `:videoId` is
`CatalogRow.video_id` of the row being played — this is enough to
re-resolve the exact `CatalogRow` (season/episode) from the loaded catalog
without needing season/episode numbers in the URL.

### `src/router/useRoute.ts`

- Wraps `window.history.pushState`/`replaceState` and the `popstate` event.
- Exposes a hook: `{ route, navigate(path, { replace? }) }`.
- `route` is a parsed union matching the existing `View` type in `App.tsx`:
  ```ts
  type Route =
    | { name: 'home' }
    | { name: 'title'; key: string }
    | { name: 'play'; key: string; videoId: string }
  ```
- Because `pushState`/`replaceState` don't fire `popstate`, `navigate()`
  updates an internal state value directly after calling them, so React
  re-renders immediately; the `popstate` listener handles back/forward
  (hardware back button, browser back) the same way.

### `App.tsx` changes

- Replace `useState<View>` with `useRoute()`.
- Resolve `route` against `titles` (from `useCatalog`) to get the `Title`
  and `CatalogRow` needed by `Detail`/`Player`, the same way `view.title`
  is used today. If catalog is still loading, show the existing loading
  state regardless of route. If a route's `:key`/`:videoId` doesn't match
  any loaded title (bad/stale URL), redirect to `/` via `navigate(..., {
  replace: true })`.
- `back()` becomes: from `play` → `navigate('/title/:key')`; from `title` →
  `navigate('/')`. Always an explicit `navigate`, not `history.back()` —
  deterministic even when the route was reached via a fresh deep-link
  refresh with no prior history entries.
- Navigation calls that today do `setView({ name: 'player', ... })` /
  `setView({ name: 'detail', ... })` become `navigate('/title/:key/play/
  :videoId')` / `navigate('/title/:key')`.

### Netlify

Add `netlify.toml`:

```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

This is what makes refreshing on a deep path like `/title/123/play/456`
serve the app instead of a 404. (`vite build`'s output already goes to
`dist/`, which Netlify picks up as-is — no other build config changes
needed.)

## 2. Shared in-place reload mechanism (manual "R" + auto-retry)

Both the manual key and automatic retry drive the same primitive in
`Player.tsx`: an `attempt` counter. Incrementing it changes the iframe's
React `key`, forcing a full remount with a freshly computed `src` (new
`fromTime`, see §3).

```
attempt: number         // starts at 0 for a new video_id
status: 'loading' | 'ready' | 'retrying' | 'failed'
```

- **On mount / video_id change**: reset `attempt` to 0, `status` to
  `'loading'`, start the existing load timeout.
- **On load timeout without `iframe.onLoad` firing**: if `attempt < 3`,
  increment `attempt`, set `status` to `'retrying'`, wait a short backoff
  (e.g. 1s × attempt), remount. If `attempt >= 3`, set `status` to
  `'failed'` — this renders today's fallback screen ("No se pudo
  reproducir aquí" + "Abrir en ok.ru" link).
- **`status === 'retrying'`**: render a small non-blocking "Reconectando…"
  indicator over the last frame/black background, not the full fallback
  screen — this is the auto-recovery path, it shouldn't look like a dead
  end.
- **On iframe `onLoad`**: `status` → `'ready'`; write the resume timestamp
  (§3).
- **Manual "R" key**: always resets `attempt` to 0 and immediately triggers
  a remount + new load timeout, regardless of current `status`. This is the
  tool for the freeze/audio-without-video case, which auto-retry cannot
  detect. Existing keys (Escape/Backspace = back, F = fullscreen) are
  unaffected; "R" is not currently bound to anything.

## 3. Resume via elapsed wall-clock time

Cannot read real `currentTime` from the iframe, so this is an
approximation based on wall-clock time since the *first* successful load of
this `video_id` in this viewing session.

- **On `onLoad` while `attempt === 0`** (i.e. the first successful load of
  this `video_id`, before any retry/reload has happened) write to
  `localStorage`:
  ```
  key:   go10:resume:<videoId>
  value: { startedAt: number /* Date.now() at first load */ }
  ```
- **On every (re)computation of the iframe `src`** (initial mount, auto-
  retry, manual "R", or a fresh app load that deep-links into `/title/:key/
  play/:videoId`): read the stored entry for this `videoId`, if present and
  younger than a max age (6 hours — long enough to survive a broken-player
  troubleshooting session, short enough to not "resume" a video watched
  days ago), compute `elapsed = floor((Date.now() - startedAt) / 1000)`,
  subtract a small rewind buffer (5s, to reorient after a freeze) clamped
  to ≥ 0, and append `&fromTime=<value>` to `embed_url`. No stored entry or
  expired → no `fromTime` param, starts at 0 as today.
- **On normal close** (`back()` navigating away from a `play` route):
  remove the `go10:resume:<videoId>` entry. This is crash/freeze recovery,
  not a "continue watching" feature — a video reopened later starts at 0.

## 4. Catalog parse caching

`useCatalog` currently fetches and `Papa.parse`s the full CSV on every
mount, including on a full-page refresh done to recover from an
in-place-reload that didn't work. Cache the parsed result:

- After a successful parse, write `{ rows, builtAt }` to
  `sessionStorage["go10:catalog:v1"]` (JSON).
- On mount, if a `sessionStorage` entry exists, use it synchronously
  (`loading: false` on first render) and skip the fetch entirely for that
  session. `sessionStorage` (not `localStorage`) is deliberate — it clears
  on tab close, so a stale catalog never survives past this viewing
  session, and it's per-tab so it doesn't need invalidation logic beyond
  that.
- Versioned key (`v1`) so a future catalog schema change (e.g. the recent
  `episode_number` addition) can bump the key to invalidate old caches
  without needing migration logic.
- No TTL beyond session lifetime — the CSV is a static committed file, not
  expected to change during a session.

## Testing

- Router: unit tests for `useRoute`'s path parsing (all three route shapes
  + unknown path fallback) and `navigate`/back behavior, following the
  existing `*.test.ts(x)` colocated pattern.
- Player retry/backoff state machine: unit tests driving the
  `attempt`/`status` transitions with fake timers (mount → timeout → retry
  → timeout → ... → failed; mount → onLoad → ready; manual reload resets
  `attempt`).
- Resume `fromTime` computation: unit test the elapsed/expiry/clamp math
  directly (pure function), independent of the component.
- Catalog cache: unit test read/write round-trip and the version-key
  behavior in `useCatalog`.
- Manual, on-device: confirm `fromTime` actually seeks the `/videoembed/`
  iframe (flagged above as unconfirmed) — do this before considering the
  resume feature done, since it's the one thing that can't be verified any
  other way.
