# Live TV channels — design

## Goal

A lean-back mode where something is **always playing**. The user opens the
TV screen, lands mid-program on a channel, and is encouraged to zap between
channels to see what's on. It's a casual way into the catalog, alongside the
on-demand screens.

**Target, in order:** the web app on desktop and phone first, using every
capability the browser gives us. The TV builds (Tizen, Android) come later
in a separate, scaled-down spec that reuses the core pieces.

**Budget:** $0. No livestream and no backend. (A self-hosted 24/7 stream
was rejected: it means re-hosting and rebroadcasting the content, which is
far more legal exposure than embedding ok.ru, and the hosting cost grows
with viewers. A sync backend isn't needed; see the schedule engine below.)

## Decisions

| Question | Decision |
|---|---|
| What two viewers of one channel see at the same moment | **The same program at the same second.** A shared live schedule; you always join mid-program. |
| How a channel orders its titles | **Rotating blocks.** Each round visits every title once in a shuffled order; a series airs its next ~30 min of consecutive episodes, a movie airs whole. |
| Where channels are defined | **`data/channels.json`**, each channel pointing at a collection. |
| Layout | **Fullscreen video with an always-present bottom channel strip** of live tiles, plus a **hover preview** on desktop. |
| Preloading | **On intent:** hovering or focusing an entry point loads the channel before the click. |
| Leaving the TV screen | The channel **keeps playing in a mini-player**. |
| Load failures | **The same retry policy as the on-demand Player** (`playerRetryReducer`, "Reconectando…"), with each retry rejoining the live second. |
| Watch progress | **Not written.** Zapping must not fill "Seguir viendo". |

## Key enabler: the schedule is math, not state

Every catalog row has `duration_seconds`. For a chaptered episode that's the
chapter's own length, always equal to `chapter_end_seconds −
chapter_start_seconds` when both are set; this was checked across all 3,074
such rows. The ok.ru embed honors `fromTime`. So "what is channel X playing
at instant T, and how far in" is a **pure function of the catalog, the
channel config and the clock**. Every device computes the same answer, so
viewers are in sync with no server. The deploy *is* the broadcast schedule.

## 1. Channel config: `data/channels.json`

```json
{
  "epoch": "2026-10-01T00:00:00Z",
  "defaultChannel": "cartoon-network",
  "channels": [
    { "id": "cartoon-network", "number": 1, "collection": "cartoon-network" },
    { "id": "jetix", "number": 2, "collection": "jetix", "blockMinutes": 45, "exclude": ["power-rangers-movie"] }
  ]
}
```

- `epoch`: an ISO-8601 UTC instant, the moment every channel's timeline
  starts. It's shared by all channels.
- `defaultChannel`: the channel `/tv` opens when the viewer has no last
  channel.
- Per channel: `id` (kebab-case, unique, and the URL slug), `number` (a
  positive integer, unique), `collection` (an existing collection id),
  optional `name` (defaults to the collection's name), optional
  `blockMinutes` (default 30), and optional `exclude` (title keys to leave
  out).
- The logo and tile color come from the collection.
- **Validation** (`validateChannels`, same style as `validateCollection`)
  runs in a data test against the real catalog and collections. It fails on
  a malformed field, a duplicate id or number, an unknown collection, an
  unknown `exclude` key, a `defaultChannel` that isn't listed, or a channel
  whose plan has no units. At runtime, an invalid channel is skipped with a
  `console.warn`, so one bad edit can't break the app.

## 2. Schedule engine (`packages/core/src/tv/`)

Platform-free and clock-injected, like the rest of core.

### Units

A **unit** is one airable thing: one row of a title's `seasons` (an
episode, a chapter of a season pack, a whole-season video, or a movie):

```ts
interface Unit { row: CatalogRow; key: string /* rowKey(row) */; start: number /* chapter_start_seconds ?? 0 */; length: number /* duration_seconds */ }
```

A title's units come in `Title.seasons` order, which is already season-then-
episode ascending. Rows with `length <= 0` and external rows are dropped.

### Plan: `buildChannelPlan(channel, collection, titles) → ChannelPlan`

The plan is the channel's resolved titles (`resolveCollection` minus
`exclude`, keeping only titles that have units), each with its units, plus
`blockSeconds` and a numeric seed hashed from the channel id.

### Rotating blocks → timeline

- **Round `r`** (0, 1, 2, …) visits every plan title once. The order sorts
  titles by `hash(seed + r, title.key)`. If round `r` would start with the
  title that ended round `r − 1`, the first two swap, so a title never airs
  twice in a row (unless the channel has only one title).
- **A title's turn** airs units from its cursor onward, whole units only,
  until the block reaches `blockSeconds` or the title has aired all of its
  units in this turn. It always airs at least one unit, so a movie or a long
  special airs alone. The cursor advances and wraps to the first unit at the
  end.
- The timeline is the sequence of these **airings** (`{ unit, startsAt,
  endsAt }`, in epoch milliseconds), laid end to end from `epoch`.

### `scheduleAt(plan, epochMs, t, upcoming = 3)`

It returns `{ current: Airing, offset: number /* seconds into the unit */,
next: Airing[] }`. It simulates rounds from the epoch, keeping a checkpoint
(round index, start time, cursors) every 32 rounds in a per-plan cache, so
later queries start from the nearest checkpoint. A query before the epoch is
treated as the epoch. At about 50 airings per channel per day, a year is
around 18k steps, which takes milliseconds.

**Consequence:** editing a channel's collection, or re-ingesting one of its
titles, changes that channel's timeline from the next deploy on. This is
accepted.

## 3. Live session (`packages/core/src/tv/liveSession.ts`)

`createLiveSession({ plan, epochMs, now, send })` is a sibling of
`createPlaybackSession` with no progress writes. It's ok.ru only, since
channels draw from the catalog and never from TMDB. It uses the provider's
`parse` and `seekMessage`.

- **`tune()`** sets the current airing from `now()` and returns `{ airing,
  src }`, where `src` is `buildEmbedSrc(row.embed_url, unit.start +
  offset)`. Every load and **every retry** calls it, so a reload always
  rejoins the live second.
- **`handle(data)`** handles a message from the embed:
  - `time`: compare with the expected `unit.start + (now − startsAt)/1000`.
    More than **20 s** off on **two consecutive** reports means `send(seek
    expected)`. A report at or past `unit.start + length` marks the unit as
    *finished early*.
  - `ended`: also marks it finished early.
- **`advance()`** is called by the UI's timer at `current.endsAt`. It moves
  to the next airing and returns `{ kind: 'seek' }` when the next unit is in
  the same `video_id` (a chapter of the same file; it sends the seek
  itself), or `{ kind: 'load', src }` otherwise.
- **`finishedEarly`** is exposed so the UI can cover the frozen last frame
  with a "A continuación: … · 21:40" card until `endsAt`, instead of moving
  early and losing sync.

## 4. The persistent player layer (`apps/web/src/tv/`)

### Why one layer at the App root

A browser reloads an iframe when it's moved to a new place in the DOM. Every
"instant" behavior here (preload then show, preview then promote, screen
then mini-player) therefore needs iframes that **never move in the DOM** and
are only repositioned with CSS. A `TvProvider` (React context) and a
`TvLayer` sit at the App root, outside the routed screens, and survive every
navigation.

### Slots

The layer renders at most two **slots**: `main` and `preview`. Phones (any
`(pointer: coarse)` device) have no preview slot. Each slot holds a channel
id, its own `createLiveSession`, its own `playerRetryReducer` state, and one
iframe (`allow="autoplay; fullscreen; encrypted-media"`).

| Slot mode | Placement | Used for |
|---|---|---|
| `staged` | full size, behind the app (`z-index:-1`, `opacity:0`, no pointer events) | intent preload |
| `full` | fixed and fullscreen, under the TV screen's overlay | `/tv/:channel` |
| `tile` | fixed to the hovered strip tile's `getBoundingClientRect()`, updated on scroll and resize | hover preview |
| `mini` | fixed corner card: desktop about 320×180 bottom-right; phone about 45vw above the bottom edge | after leaving `/tv` |

### Context API

`TvProvider` exposes:

- `preload(channelId?)`: stages `main` with that channel (or the last
  channel, else the default) if `main` is empty.
- `watch(channelId)`: `main` shows that channel. If `preview` is showing it,
  **the preview slot becomes `main`** and the old main is torn down.
- `previewAt(channelId, rect)` / `endPreview()`: desktop only.
- `setScreen('tv' | 'away')`: TV screen mounted or not; `main` goes `full`
  or `mini`.
- `close()`: tears every slot down. App calls it whenever the on-demand
  Player route resolves, so two audio streams never play at once.

The last channel watched is remembered via `keyValueStore` (`tv:lastChannel`).

### Retry policy (required: ok.ru often refuses to load)

Exactly the on-demand Player's: `LOAD_TIMEOUT_MS` (8 s) without `onLoad`
triggers `timeout`; up to `MAX_RETRIES` (3) with `backoffMs` (1 s, 2 s,
3 s); the "Reconectando…" overlay while retrying. Each remount takes its
`src` from `session.tune()`, so it rejoins live. The reducer and constants
are imported from core, not copied.

**After the final failure:** a "Señal interrumpida" card ("Volvemos con
<next program> a las 21:40"), with the channel strip forced open to invite a
zap. At the next airing's `endsAt` boundary the slot tunes again from a
fresh reducer state, so the channel never stays dead and stays in sync.
Preview slots get one retry, then the tile shows its static thumbnail.

### Two embed unknowns: verified first (Task 1 spike)

1. **Muting the preview.** Does ok.ru's embed accept a mute/volume
   `postMessage`, or a mute URL parameter? If yes, `EmbedProvider` gets
   optional `muteMessage` / `unmuteMessage` (or a muted `src`), previews load
   muted, and promoting one unmutes it. If no, then while a preview plays,
   `main` is paused (`pauseMessage`) and resumed with a re-tune when the
   preview ends; promoting needs no unmute because only one is audible.
2. **Audio after an intent preload.** A hover isn't a user activation, so a
   `staged` embed may start muted or paused. On the click that opens the TV
   screen, which *is* an activation, the layer sends `playMessage` (and
   unmutes, if #1 allows it). If that's still silent, the fallback is to
   reload `main` on that click (the existing reload path), giving up the
   instant start but not the sound.

## 5. TV screen

### Routes

`{ name: 'tv'; channel: string | null }`: `/tv` (channel `null`) and
`/tv/:channelId`. `/tv` resolves in the app to the last channel, else
`defaultChannel`, via `replace`. An unknown channel id is replaced with
`/tv`, which then picks a channel the same way.
Zapping navigates with `replace`, so Back leaves the TV screen instead of
replaying every zap.

### Anatomy

- **Video:** `main` in `full` mode.
- **Input shield:** a transparent layer over the video that takes every
  click, tap and swipe. ok.ru's own controls are given up deliberately,
  since there's no seeking on live TV. Every tap is also a fresh user
  activation.
- **Now-playing bar**, top-left: channel chip (number + collection logo),
  program label (series title + `rowLabel`, or the movie title), "A
  continuación: <next> · HH:MM", a live progress bar, and a **"Ver ficha"**
  link to the title's Detail page. The mini-player continues there.
- **Channel strip**, bottom: one live tile per channel showing the
  collection logo and number, the current unit's thumbnail, its label, and a
  progress bar. The current channel is outlined. Tiles re-read
  `scheduleAt` on a 5 s tick and at the earliest `endsAt` among channels.
  The strip is **open on arrival and after every zap**, collapses after 6 s
  without input to a **slim chip row that never disappears**, and expands on
  pointer move, tap or any key.
- **Zap transition:** about 400 ms of a channel-number flash over a static
  texture, or just the number flash when the zap promotes a preview.

### Controls

| Input | Action |
|---|---|
| ↑ / ↓, PgUp / PgDn; vertical swipe on the shield | previous / next channel (wrapping) |
| ← / → (strip open); horizontal swipe on the strip | move through tiles. On desktop, resting on a tile for about 600 ms starts its preview |
| Enter / click / tap a tile | watch that channel |
| 1–9 | channel with that number |
| F, or a fullscreen button | toggle browser fullscreen on the screen |
| Esc / Backspace | Home, with `main` going to `mini` |

### Entry points

1. **A navbar "TV" item** with a red "EN VIVO" dot. `pointerenter` and
   focus call `preload()`.
2. **An "En vivo ahora" row on Home**, directly below the collection strip.
   It uses the same live tiles; selecting one goes to `/tv/<id>`, and
   hovering one preloads it.

### Mini-player

When `main` is playing and the route isn't `tv` (and isn't `play`, where the
layer closes), `main` shows as a corner card with the channel logo and name,
a ✕ (`close()`), and a click-through to `/tv/<channel>`. On phones it's
smaller and stays above the bottom edge. Programs keep advancing while it's
mini.

## 6. Edge cases

- **Clock skew:** the device clock is used as-is; a skewed device sees a
  skewed schedule, which is harmless.
- **Hidden tab or a waking device:** on `visibilitychange` to visible, every
  live slot re-tunes: it seeks when still on the same unit, and loads the
  new one otherwise.
- **The file ends before the schedule says** (catalog duration too long):
  the "A continuación" card until `endsAt` (see §3).
- **A dead video:** retries, then "Señal interrumpida" until the next
  boundary (see §4). Nothing is remembered, so it's tried again the next
  time it airs.
- **A channel that resolves to no units:** left out of the TV screen and the
  Home row; validation flags it in CI.

## 7. Testing

- **Core (Vitest, clock injected):** `validateChannels` (each rule),
  `buildChannelPlan` (exclude, unit start and length, external rows
  dropped), the round order (deterministic, no back-to-back title),
  `scheduleAt` (determinism, block filling, cursor carry-over and wrap,
  movies alone, boundary instants, and checkpoint answers equal to a naïve
  simulation over a long range), and `createLiveSession` (live `src`, drift
  threshold, finished early, same-file seek against new-file load on
  advance).
- **Data test:** the real `channels.json` validates against the real
  catalog and collections.
- **Web (RTL + jsdom, fake iframe):** slot modes per route, a preview
  promoted on watch, the layer closing on the on-demand Player, retry and
  "Señal interrumpida", strip collapse and expand, the key map, the navbar
  preload on hover, and the Home row.
- **Manual (real ok.ru):** Chrome desktop, Firefox desktop, a phone. The
  spike questions, the retry loop, sound after the preload click, the
  mini-player across navigation.

## 8. Out of scope (later)

- The TV builds (Tizen, Android): a separate spec reusing core. It drops the
  preview, the mini-player and the input shield, and keeps the D-pad strip.
- Time-of-day rules ("movies after 21:00"), hand-written slots, channels
  built from a raw title list, a viewer count, and a full EPG grid view. The
  schedule engine already supports an EPG; only the UI is deferred.
