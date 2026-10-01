# Live TV Channels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/tv` screen where catalog collections air as always-on channels on a shared, clock-derived schedule, with a live channel strip, hover previews, intent preloading and a mini-player.

**Architecture:** A pure schedule engine in `@go10/core/tv` turns `data/channels.json` + the catalog + the clock into "what's airing now" (no backend). The web app mounts one persistent `TvLayer` at the App root whose ok.ru iframes are only ever repositioned with CSS (staged / full / tile / mini), never moved in the DOM, so preload → watch, preview → promote and screen → mini-player are all instant. Each iframe reuses the on-demand Player's retry reducer, retuning to the live second on every reload.

**Tech Stack:** TypeScript, React 19, Vite 8, Vitest 5 + Testing Library (jsdom), npm workspaces (`@go10/core`, `@go10/web`).

**Spec:** `docs/superpowers/specs/2026-10-01-live-tv-channels-design.md`

## Global Constraints

- `packages/core` stays platform-free: no `window.`, `document.`, `navigator.`, `localStorage`, `import.meta.env|glob`, or `react` imports in non-test core files (`packages/core/src/noPlatformGlobals.test.ts` enforces it). Storage goes through `keyValueStore()` from `@go10/core/ports/keyValueStore`.
- Build target is `chrome69`: syntax is transpiled, built-ins are not. Do not use `Array.prototype.at`, `findLast`, `Object.hasOwn`, `structuredClone`, `queueMicrotask` or `Array.prototype.toSorted`.
- The retry policy is imported from core (`playerRetryReducer`, `initialPlayerRetryState`, `backoffMs` from `@go10/core/player/playerRetry`; `LOAD_TIMEOUT_MS` from `@go10/core/player/playbackSession`), never copied. Live viewing writes **no** watch progress.
- All user-facing copy is Spanish: "Reconectando…", "Señal interrumpida", "Volvemos con … a las HH:MM", "A continuación", "Ver ficha", "EN VIVO", "En vivo ahora", "TV".
- Channels draw from the catalog only (ok.ru provider); TMDB/vidlove titles never air.
- Block default 30 minutes; drift threshold 20 s on 2 consecutive reports; strip collapses after 6 s idle; preview starts after resting 600 ms on a tile; zap flash 400 ms; live tiles refresh every 5 s.
- Commits end with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Test commands: core `npm test -w @go10/core -- <path relative to packages/core>`; web `npm test -w @go10/web -- <path relative to apps/web>`; everything `npm test && npm run typecheck` from the repo root.

## Review Focus

1. **A stale last channel in storage** (a channel removed from `channels.json` after the viewer watched it): `/tv` must fall back to `defaultChannel`, never a blank screen. Pinned in Task 5 (`pickChannel` test).
2. **Opening an on-demand title while the mini-player is playing**: the layer must close, so two audio streams never play. Pinned in Task 11 (App test).
3. **A boundary timer firing late** (tab throttled, device asleep for an hour): `sync()` must land on the airing for *now*, not the one after the previous airing. Pinned in Task 4 (`sync` test with the clock far ahead).
4. **Rapid zapping** (holding ↓): at most one `main` slot and one `preview` slot may exist at any time; old iframes are torn down. Pinned in Task 8 (provider test).
5. **A channel whose titles have no airable rows** (every row external or zero length, or all excluded): it is dropped from the lineup at runtime and flagged by the data test, and `scheduleAt` is never called on an empty plan. Pinned in Task 2 (`buildChannelPlan`) and Task 5 (`resolveLineup`).

---

## File Structure

**Core (`packages/core/src/`)**
- `lib/hash.ts` — `hash01(seed, key)`, extracted from `catalog/buildRows.ts` (shared by row jitter and channel round order).
- `tv/types.ts` — config, plan, lineup, airing and schedule types; `DEFAULT_BLOCK_MINUTES`.
- `tv/plan.ts` — `unitsOf`, `channelSeed`, `buildChannelPlan`.
- `tv/schedule.ts` — rotating-block timeline: `scheduleAt` (+ `playRound`, `originOf` exported for tests).
- `tv/liveSession.ts` — `createLiveSession`: live `src`, drift correction, boundary sync, finished-early.
- `tv/validateChannels.ts` — `validateChannelEntry`, `validateChannelsTop`, `validateChannels`.
- `tv/lineup.ts` — `resolveLineup`, `pickChannel`, `stepChannel`, `channelByNumber`, `readLastChannel`, `writeLastChannel`.
- `tv/describe.ts` — `programLabel`, `clockLabel`, `progressOf`.
- `router/route.ts`, `router/resolveRoute.ts` — the `tv` route.

**Data**
- `data/channels.json` — the lineup.

**Web (`apps/web/src/`)**
- `tv/channels.ts` — bundles `data/channels.json`; `tv/channels.data.test.ts` validates it.
- `tv/useLineup.ts` — memoised `resolveLineup` for the loaded catalog.
- `tv/canPreview.ts` — desktop-only check (fine pointer, not a TV).
- `tv/TvSlot.tsx` — one iframe: live session, retry, boundary timer, overlays.
- `tv/TvProvider.tsx` — slot state + `useTv()` context API.
- `tv/TvLayer.tsx` — renders slots and the mini-player chrome.
- `tv/useLiveNow.ts` — per-channel `Schedule`s, refreshed every 5 s and at boundaries.
- `tv/ChannelTile.tsx` — live tile (logo, number, thumbnail, label, progress, preview intent).
- `tv/TvScreen.tsx` — the `/tv/:channel` screen: shield, now-playing bar, strip, keys, zap flash.
- `tv/LiveRow.tsx` — Home's "En vivo ahora" row.
- `tv/tv.css` — all TV styles.
- Modified: `App.tsx`, `components/Navbar.tsx`, `screens/Home.tsx`.

---

### Task 1: Spike — ok.ru embed mute control and audio after a hover preload (human in the loop)

The two unknowns from spec §4. The output is a recorded answer, plus — only if a mute command exists — two optional fields on the ok.ru provider. The harness is throwaway and is not committed.

**Files:**
- Create (throwaway, not committed): `.superpowers/spike-tv/harness.html`
- Create: `docs/superpowers/spikes/2026-10-01-tv-embed-spike.md`
- Modify (only if a mute command is found): `packages/core/src/player/providers/types.ts`, `packages/core/src/player/providers/okru.ts`, `packages/core/src/player/providers/okru.test.ts` (create if absent)

**Interfaces:**
- Produces: the decision `PREVIEW_AUDIO` = `'mute'` or `'pause-main'`, recorded in the spike doc and read by Task 13. If `'mute'`: `EmbedProvider.muteMessage?: unknown` and `EmbedProvider.unmuteMessage?: unknown` (or `mutedSrcParam?: string`), set on `okru`.

- [ ] **Step 1: Write the harness**

`.superpowers/spike-tv/harness.html` (served from localhost so ok.ru sees an ordinary origin; any catalog `embed_url` works, e.g. `https://ok.ru/videoembed/7209919318652`):

```html
<!doctype html>
<meta charset="utf-8">
<title>TV embed spike</title>
<style>body{font:14px system-ui;margin:16px} iframe{width:480px;height:270px;border:0;background:#000} #log{height:240px;overflow:auto;background:#111;color:#0f0;font:12px monospace;padding:6px} button{margin:2px}</style>
<p>Embed: <input id="url" size="50" value="https://ok.ru/videoembed/7209919318652"> <button onclick="load('')">Load</button> <button onclick="load('&mute=1')">Load &amp;mute=1</button> <button onclick="load('&volume=0')">Load &amp;volume=0</button></p>
<p>Staged preload (no click yet): <button id="stage">Stage in 3 s (hidden, then do not click)</button> <button onclick="reveal()">Reveal + post play</button></p>
<p>Send: <span id="cmds"></span></p>
<div id="slot"></div>
<pre id="log"></pre>
<script>
const CANDIDATES = [
  { action: 'mute' }, { action: 'unmute' },
  { action: 'setVolume', volume: 0 }, { action: 'setVolume', volume: 1 },
  { action: 'volume', value: 0 }, { action: 'volume', value: 1 },
  { action: 'play' }, { action: 'pause' },
]
const log = (m) => { const el = document.getElementById('log'); el.textContent += m + '\n'; el.scrollTop = 1e9 }
let frame = null
function load(extra, hidden) {
  document.getElementById('slot').innerHTML = ''
  frame = document.createElement('iframe')
  frame.allow = 'autoplay; fullscreen; encrypted-media'
  frame.src = document.getElementById('url').value + '?autoplay=1' + extra
  if (hidden) Object.assign(frame.style, { position: 'fixed', zIndex: -1, opacity: 0, pointerEvents: 'none' })
  document.getElementById('slot').appendChild(frame)
  log('load ' + frame.src + (hidden ? ' (staged)' : ''))
}
function reveal() { Object.assign(frame.style, { position: '', zIndex: '', opacity: '', pointerEvents: '' }); send({ action: 'play' }) }
function send(cmd) { frame && frame.contentWindow.postMessage(cmd, 'https://ok.ru'); log('sent ' + JSON.stringify(cmd)) }
document.getElementById('cmds').append(...CANDIDATES.map((c) => { const b = document.createElement('button'); b.textContent = JSON.stringify(c); b.onclick = () => send(c); return b }))
document.getElementById('stage').onclick = () => setTimeout(() => load('', true), 3000)
addEventListener('message', (e) => { if (e.origin === 'https://ok.ru' && !/timeupdate/.test(JSON.stringify(e.data))) log('recv ' + JSON.stringify(e.data)) })
</script>
```

- [ ] **Step 2: Serve it and hand it to the user**

Run: `cd .superpowers/spike-tv && python3 -m http.server 8765` (in the background).

The user (not an agent: this needs ears) opens `http://localhost:8765/harness.html` in desktop Chrome and Firefox and answers:
1. **Mute:** after **Load** and clicking the video once so audio plays, does any button in "Send" silence it (then restore it)? Does **Load &mute=1** or **Load &volume=0** start silent? Note any `recv` messages that look like volume events.
2. **Staged audio:** reload the page, click **Stage in 3 s**, move the mouse away and do not click for 10 s. Then click **Reveal + post play**. Is the video playing with sound? Muted? Paused?

- [ ] **Step 3: Record the answers**

Write `docs/superpowers/spikes/2026-10-01-tv-embed-spike.md`:

```markdown
# TV embed spike (2026-10-01)

Harness: a throwaway page embedding `https://ok.ru/videoembed/<id>` from localhost.

## 1. Muting a preview
- Chrome: <which command/param silenced it, or "none">
- Firefox: <same>
- Volume-related messages ok.ru posts: <list, or "none">

## 2. Audio after a staged (hover) preload
- Chrome: <playing with sound | muted | paused> after "Reveal + post play"
- Firefox: <same>

## Decision
PREVIEW_AUDIO = <'mute' | 'pause-main'>
<if 'mute': the exact mute and unmute messages (or src parameter) to use>
STAGED_FIX = <'play-message' if a post of {action:'play'} on the click gave sound in both browsers, else 'reload-on-click'>
```

`PREVIEW_AUDIO` is `'mute'` only if one command (or param) mutes **and** a command restores audio, in both browsers. Otherwise `'pause-main'`.

- [ ] **Step 4 (only if `PREVIEW_AUDIO = 'mute'`): add the commands to the provider, test first**

Add to `EmbedProvider` in `packages/core/src/player/providers/types.ts`, after `pauseMessage?: unknown`:

```ts
  /** Silence / restore the embed (ok.ru only; found in the 2026-10-01 TV embed spike). */
  muteMessage?: unknown
  unmuteMessage?: unknown
```

Test in `packages/core/src/player/providers/okru.test.ts` (use the exact messages recorded in Step 3; the `{ action: 'mute' }` shape below is shown only as the expected form):

```ts
import { describe, expect, it } from 'vitest'
import { okru } from './okru'

describe('okru mute commands', () => {
  it('has the mute and unmute messages found in the TV embed spike', () => {
    expect(okru.muteMessage).toEqual({ action: 'mute' })
    expect(okru.unmuteMessage).toEqual({ action: 'unmute' })
  })
})
```

Run: `npm test -w @go10/core -- src/player/providers/okru.test.ts` → FAIL. Add the two fields to `okru` in `okru.ts`; run again → PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/spikes/2026-10-01-tv-embed-spike.md packages/core/src/player/providers
git commit -m "docs: TV embed spike — preview audio and staged autoplay

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Core — types, shared hash, and channel plans

**Files:**
- Create: `packages/core/src/lib/hash.ts`, `packages/core/src/lib/hash.test.ts`
- Modify: `packages/core/src/catalog/buildRows.ts` (remove the local `hash01`, import it)
- Create: `packages/core/src/tv/types.ts`, `packages/core/src/tv/plan.ts`, `packages/core/src/tv/plan.test.ts`, `packages/core/src/tv/testing.ts`

**Interfaces:**
- Consumes: `resolveCollection(collection, titles)` from `../collections/resolveCollection`; `rowKey(row)` from `../catalog/rowKey`.
- Produces: `hash01(seed: number, key: string): number`; all types in `tv/types.ts` (below); `unitsOf(title: Title): Unit[]`; `channelSeed(channelId: string): number`; `buildChannelPlan(config: ChannelConfig, collection: Collection, titles: Title[]): ChannelPlan`; test fixtures in `tv/testing.ts` (`catalogRow`, `movieTitle`, `showTitle`, `collectionOf`).

- [ ] **Step 1: Extract the hash, test first**

`packages/core/src/lib/hash.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { hash01 } from './hash'

describe('hash01', () => {
  it('is stable, in [0, 1), and depends on both seed and key', () => {
    const a = hash01(7, 'coraje')
    expect(hash01(7, 'coraje')).toBe(a)
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThan(1)
    expect(hash01(8, 'coraje')).not.toBe(a)
    expect(hash01(7, 'chowder')).not.toBe(a)
  })
})
```

Run: `npm test -w @go10/core -- src/lib/hash.test.ts` → FAIL (module not found).

Create `packages/core/src/lib/hash.ts` by moving the function out of `buildRows.ts` unchanged:

```ts
/** FNV-1a over the key, mixed with the seed: a stable 0..1 per (seed, key). */
export function hash01(seed: number, key: string): number {
  let h = (0x811c9dc5 ^ seed) >>> 0
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193)
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296
}
```

In `buildRows.ts`, delete the local `hash01` (its doc comment included) and add `import { hash01 } from '../lib/hash'`.

Run: `npm test -w @go10/core -- src/lib/hash.test.ts src/catalog/buildRows.test.ts` → PASS.

- [ ] **Step 2: Write the types**

`packages/core/src/tv/types.ts`:

```ts
import type { CatalogRow } from '../types'
import type { Collection } from '../collections/types'

export const DEFAULT_BLOCK_MINUTES = 30

/** One entry of `data/channels.json` as written. */
export interface ChannelConfig {
  /** Kebab-case, unique; the `/tv/<id>` slug. */
  id: string
  /** Positive integer, unique; the number shown and typed. */
  number: number
  /** A collection id: the channel airs that collection's titles. */
  collection: string
  /** Defaults to the collection's name. */
  name?: string
  /** Target block length per turn, in minutes. Default `DEFAULT_BLOCK_MINUTES`. */
  blockMinutes?: number
  /** Title keys of the collection to leave off the air. */
  exclude?: string[]
}

export interface ChannelsFile {
  /** ISO-8601 UTC instant every channel's timeline starts from. */
  epoch: string
  defaultChannel: string
  channels: ChannelConfig[]
}

/** One airable thing: an episode, a chapter of a season pack, a whole-season video, or a movie. */
export interface Unit {
  row: CatalogRow
  /** `rowKey(row)`. */
  key: string
  /** Where it starts inside its ok.ru file, in seconds. */
  start: number
  /** Seconds. */
  length: number
}

export interface PlanTitle {
  key: string
  /** In airing order (season, then episode). Never empty. */
  units: Unit[]
}

export interface ChannelPlan {
  channelId: string
  seed: number
  blockSeconds: number
  titles: PlanTitle[]
}

/** A channel ready to air. */
export interface Channel {
  id: string
  number: number
  name: string
  collection: Collection
  plan: ChannelPlan
}

export interface Lineup {
  epochMs: number
  defaultChannel: string
  /** Ascending by number. */
  channels: Channel[]
}

export interface Airing {
  unit: Unit
  titleKey: string
  /** Epoch milliseconds. */
  startsAt: number
  endsAt: number
}

export interface Schedule {
  current: Airing
  /** Seconds into `current.unit` (relative to `unit.start`). */
  offset: number
  next: Airing[]
}
```

- [ ] **Step 3: Write the test fixtures**

`packages/core/src/tv/testing.ts` (excluded from the platform check by name, like `external/testing.ts`):

```ts
import type { CatalogRow, Title } from '../types'
import type { Collection } from '../collections/types'

export function catalogRow(overrides: Partial<CatalogRow> = {}): CatalogRow {
  return {
    catalog_index: 0, video_id: 'v1', type: 'movie', title: 'Movie', title_raw: 'Movie',
    series_id: '', series_title: '', season_number: null, season_label: '', episode_number: null,
    chapter_start_seconds: null, chapter_end_seconds: null, year: null, studio: '', source: '', genre: '',
    genre_secondary: '', quality: '', language: '', subtitled: false, duration_raw: '', duration_seconds: 600,
    views: 0, thumbnail: 'assets/x.jpg', video_url: 'https://ok.ru/video/v1', embed_url: 'https://ok.ru/videoembed/v1',
    ...overrides,
  }
}

export function movieTitle(key: string, seconds: number): Title {
  const row = catalogRow({ video_id: key, title: key, duration_seconds: seconds, embed_url: `https://ok.ru/videoembed/${key}` })
  return {
    key, kind: 'movie', title: key, year: null, studio: '', source: '', genre: '', genre_secondary: '',
    quality: '', language: '', subtitled: false, thumbnail: row.thumbnail, views: 0,
    durationSeconds: seconds, catalogIndex: 0, seasons: [row],
  }
}

/** A show of `count` separate episode files, each `seconds` long, season 1. */
export function showTitle(key: string, count: number, seconds: number): Title {
  const seasons = Array.from({ length: count }, (_, i) =>
    catalogRow({
      video_id: `${key}-${i + 1}`, type: 'episode', title: `${key} ${i + 1}`, series_id: key, series_title: key,
      season_number: 1, episode_number: i + 1, duration_seconds: seconds,
      embed_url: `https://ok.ru/videoembed/${key}-${i + 1}`,
    }),
  )
  return { ...movieTitle(key, seconds), kind: 'show', title: key, seasons }
}

export function collectionOf(id: string, titles: string[]): Collection {
  return { id, name: id.toUpperCase(), order: 1, logo: `assets/collections/${id}/logo.svg`, tile: { color: '#e4007c' }, titles }
}
```

- [ ] **Step 4: Write the failing plan tests**

`packages/core/src/tv/plan.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildChannelPlan, channelSeed, unitsOf } from './plan'
import { catalogRow, collectionOf, movieTitle, showTitle } from './testing'

describe('unitsOf', () => {
  it('makes one unit per row, in season order, starting at 0 for a whole file', () => {
    const show = showTitle('coraje', 2, 660)
    expect(unitsOf(show).map((u) => [u.key, u.start, u.length])).toEqual([['coraje-1', 0, 660], ['coraje-2', 0, 660]])
  })

  it('starts a chapter at its chapter start and uses its own duration', () => {
    const show = showTitle('db', 1, 0)
    show.seasons = [
      catalogRow({ video_id: 'f9', type: 'episode', series_id: 'db', episode_number: 1, chapter_start_seconds: 0, chapter_end_seconds: 1335, duration_seconds: 1335 }),
      catalogRow({ video_id: 'f9', type: 'episode', series_id: 'db', episode_number: 2, chapter_start_seconds: 1335, chapter_end_seconds: null, duration_seconds: 1300 }),
    ]
    expect(unitsOf(show).map((u) => [u.key, u.start, u.length])).toEqual([['f9:1', 0, 1335], ['f9:2', 1335, 1300]])
  })

  it('drops zero-length and external rows', () => {
    const show = showTitle('x', 2, 600)
    show.seasons[0] = { ...show.seasons[0], duration_seconds: 0 }
    show.seasons[1] = { ...show.seasons[1], external: true }
    expect(unitsOf(show)).toEqual([])
  })
})

describe('buildChannelPlan', () => {
  const titles = [showTitle('coraje', 3, 660), movieTitle('mulan', 5280), movieTitle('empty', 0)]
  const collection = collectionOf('cn', ['coraje', 'gone', 'mulan', 'empty'])

  it('keeps the collection order, skipping unknown, excluded and unairable titles', () => {
    const plan = buildChannelPlan({ id: 'cn', number: 1, collection: 'cn', exclude: ['coraje'] }, collection, titles)
    expect(plan.titles.map((t) => t.key)).toEqual(['mulan'])
  })

  it('defaults to 30-minute blocks and honours blockMinutes', () => {
    expect(buildChannelPlan({ id: 'cn', number: 1, collection: 'cn' }, collection, titles).blockSeconds).toBe(1800)
    expect(buildChannelPlan({ id: 'cn', number: 1, collection: 'cn', blockMinutes: 45 }, collection, titles).blockSeconds).toBe(2700)
  })

  it('seeds from the channel id, stably', () => {
    expect(channelSeed('cn')).toBe(channelSeed('cn'))
    expect(channelSeed('cn')).not.toBe(channelSeed('jetix'))
    expect(Number.isInteger(channelSeed('cn'))).toBe(true)
  })

  it('yields a plan with no titles when nothing can air', () => {
    const plan = buildChannelPlan({ id: 'x', number: 9, collection: 'x' }, collectionOf('x', ['empty']), titles)
    expect(plan.titles).toEqual([])
  })
})
```

- [ ] **Step 5: Run to verify failure**

Run: `npm test -w @go10/core -- src/tv/plan.test.ts`
Expected: FAIL — cannot resolve `./plan`.

- [ ] **Step 6: Implement `plan.ts`**

```ts
import type { Title } from '../types'
import type { Collection } from '../collections/types'
import { resolveCollection } from '../collections/resolveCollection'
import { rowKey } from '../catalog/rowKey'
import { hash01 } from '../lib/hash'
import { DEFAULT_BLOCK_MINUTES, type ChannelConfig, type ChannelPlan, type Unit } from './types'

/** A title's airable rows, in its own (season, episode) order. */
export function unitsOf(title: Title): Unit[] {
  if (title.external) return []
  return title.seasons
    .filter((row) => !row.external && row.duration_seconds > 0)
    .map((row) => ({ row, key: rowKey(row), start: row.chapter_start_seconds ?? 0, length: row.duration_seconds }))
}

/** A stable 32-bit seed per channel id. */
export function channelSeed(channelId: string): number {
  return Math.floor(hash01(0, channelId) * 4294967296)
}

export function buildChannelPlan(config: ChannelConfig, collection: Collection, titles: Title[]): ChannelPlan {
  const excluded = new Set(config.exclude ?? [])
  return {
    channelId: config.id,
    seed: channelSeed(config.id),
    blockSeconds: (config.blockMinutes ?? DEFAULT_BLOCK_MINUTES) * 60,
    titles: resolveCollection(collection, titles)
      .filter((title) => !excluded.has(title.key))
      .map((title) => ({ key: title.key, units: unitsOf(title) }))
      .filter((title) => title.units.length > 0),
  }
}
```

- [ ] **Step 7: Run tests**

Run: `npm test -w @go10/core -- src/tv/plan.test.ts src/noPlatformGlobals.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/lib/hash.ts packages/core/src/lib/hash.test.ts packages/core/src/catalog/buildRows.ts packages/core/src/tv
git commit -m "feat(core): channel plans for live TV

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Core — the rotating-block schedule

**Files:**
- Create: `packages/core/src/tv/schedule.ts`, `packages/core/src/tv/schedule.test.ts`

**Interfaces:**
- Consumes: `hash01` (Task 2), `ChannelPlan`, `Airing`, `Schedule` (Task 2).
- Produces: `scheduleAt(plan: ChannelPlan, epochMs: number, t: number, upcoming = 3): Schedule` (throws on an empty plan); for tests: `interface Checkpoint { round: number; startsAt: number; cursors: number[]; lastTitle: number }`, `originOf(plan, epochMs): Checkpoint`, `playRound(plan, cp): { airings: Airing[]; next: Checkpoint }`, `roundOrder(plan, round, lastTitle): number[]`.

- [ ] **Step 1: Write the failing tests**

`packages/core/src/tv/schedule.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildChannelPlan } from './plan'
import { originOf, playRound, roundOrder, scheduleAt } from './schedule'
import type { Airing, ChannelPlan } from './types'
import { collectionOf, movieTitle, showTitle } from './testing'

const EPOCH = Date.UTC(2026, 9, 1)
const MIN = 60_000

function plan(titles = [showTitle('a', 5, 600), showTitle('b', 2, 1500), movieTitle('m', 5400), showTitle('c', 1, 300)], blockMinutes = 30): ChannelPlan {
  return buildChannelPlan({ id: 'ch', number: 1, collection: 'ch', blockMinutes }, collectionOf('ch', titles.map((t) => t.key)), titles)
}

/** Every airing from the epoch, played round by round with no cache. */
function naive(p: ChannelPlan, rounds: number): Airing[] {
  let cp = originOf(p, EPOCH)
  const all: Airing[] = []
  for (let i = 0; i < rounds; i++) {
    const r = playRound(p, cp)
    all.push(...r.airings)
    cp = r.next
  }
  return all
}

describe('playRound', () => {
  it('airs each title once per round, laid end to end from the epoch', () => {
    const p = plan()
    const { airings } = playRound(p, originOf(p, EPOCH))
    expect(new Set(airings.map((a) => a.titleKey))).toEqual(new Set(['a', 'b', 'm', 'c']))
    expect(airings[0].startsAt).toBe(EPOCH)
    for (let i = 1; i < airings.length; i++) expect(airings[i].startsAt).toBe(airings[i - 1].endsAt)
  })

  it('fills a block with whole consecutive units until it reaches the block length', () => {
    const p = plan()
    const a = playRound(p, originOf(p, EPOCH)).airings.filter((x) => x.titleKey === 'a')
    // 10-minute episodes, 30-minute blocks: three of them, in order.
    expect(a.map((x) => x.unit.key)).toEqual(['a-1', 'a-2', 'a-3'])
  })

  it('airs a long unit alone and never repeats a title within its own turn', () => {
    const p = plan()
    const air = playRound(p, originOf(p, EPOCH)).airings
    expect(air.filter((x) => x.titleKey === 'm').map((x) => x.unit.key)).toEqual(['m'])
    // 'b' has two 25-minute episodes: 25 < 30, so both, then the turn ends (all units aired).
    expect(air.filter((x) => x.titleKey === 'b').map((x) => x.unit.key)).toEqual(['b-1', 'b-2'])
    // 'c' has one 5-minute episode: it airs once, not six times.
    expect(air.filter((x) => x.titleKey === 'c').map((x) => x.unit.key)).toEqual(['c-1'])
  })

  it('carries each series cursor into the next round and wraps at the end', () => {
    const p = plan()
    const rounds = [0, 1, 2].reduce<{ cp: ReturnType<typeof originOf>; keys: string[][] }>(
      (acc) => {
        const r = playRound(p, acc.cp)
        return { cp: r.next, keys: [...acc.keys, r.airings.filter((x) => x.titleKey === 'a').map((x) => x.unit.key)] }
      },
      { cp: originOf(p, EPOCH), keys: [] },
    ).keys
    expect(rounds).toEqual([['a-1', 'a-2', 'a-3'], ['a-4', 'a-5', 'a-1'], ['a-2', 'a-3', 'a-4']])
  })
})

describe('roundOrder', () => {
  it('is deterministic per round and differs between rounds', () => {
    const p = plan()
    expect(roundOrder(p, 3, -1)).toEqual(roundOrder(p, 3, -1))
    const orders = new Set([0, 1, 2, 3, 4, 5].map((r) => roundOrder(p, r, -1).join()))
    expect(orders.size).toBeGreaterThan(1)
  })

  it('never opens a round with the title that closed the previous one', () => {
    const p = plan()
    for (let r = 0; r < 50; r++) {
      const first = roundOrder(p, r, -1)[0]
      expect(roundOrder(p, r, first)[0]).not.toBe(first)
    }
  })

  it('keeps a single-title channel airing', () => {
    const p = plan([showTitle('solo', 3, 600)])
    expect(roundOrder(p, 0, 0)).toEqual([0])
  })
})

describe('scheduleAt', () => {
  it('finds the airing at an instant and the offset into it', () => {
    const p = plan()
    const first = playRound(p, originOf(p, EPOCH)).airings[0]
    const s = scheduleAt(p, EPOCH, EPOCH + 90_000)
    expect(s.current).toEqual(first)
    expect(s.offset).toBe(90)
  })

  it('switches exactly at a boundary', () => {
    const p = plan()
    const [a0, a1] = playRound(p, originOf(p, EPOCH)).airings
    expect(scheduleAt(p, EPOCH, a0.endsAt - 1).current).toEqual(a0)
    expect(scheduleAt(p, EPOCH, a0.endsAt).current).toEqual(a1)
    expect(scheduleAt(p, EPOCH, a0.endsAt).offset).toBe(0)
  })

  it('treats instants before the epoch as the epoch', () => {
    const p = plan()
    expect(scheduleAt(p, EPOCH, EPOCH - 5 * MIN)).toEqual(scheduleAt(p, EPOCH, EPOCH))
  })

  it('lists the upcoming airings, across a round boundary', () => {
    const p = plan()
    const all = naive(p, 3)
    const lastOfRound0 = playRound(p, originOf(p, EPOCH)).airings.length - 1
    const s = scheduleAt(p, EPOCH, all[lastOfRound0].startsAt, 3)
    expect(s.next).toEqual(all.slice(lastOfRound0 + 1, lastOfRound0 + 4))
  })

  it('matches a naive replay far from the epoch (checkpoints and memo are transparent)', () => {
    const p = plan()
    const all = naive(p, 400)
    // Ask out of order so the memo is exercised both ways.
    for (const i of [all.length - 1, 5, 1234, 77, all.length - 400, 0, 999]) {
      const a = all[i]
      const s = scheduleAt(p, EPOCH, a.startsAt + 1000)
      expect(s.current).toEqual(a)
      expect(s.offset).toBe(1)
    }
  })

  it('gives every device the same answer for the same instant', () => {
    const t = EPOCH + 123_456_789
    expect(scheduleAt(plan(), EPOCH, t)).toEqual(scheduleAt(plan(), EPOCH, t))
  })

  it('refuses an empty plan', () => {
    expect(() => scheduleAt({ channelId: 'x', seed: 1, blockSeconds: 1800, titles: [] }, EPOCH, EPOCH)).toThrow(/nothing to air/)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -w @go10/core -- src/tv/schedule.test.ts`
Expected: FAIL — cannot resolve `./schedule`.

- [ ] **Step 3: Implement `schedule.ts`**

```ts
import { hash01 } from '../lib/hash'
import type { Airing, ChannelPlan, Schedule } from './types'

/** Rounds between cached checkpoints. */
const CHECKPOINT_EVERY = 32

/** Where a round starts: its index, start time, every title's cursor, and the title that aired last. */
export interface Checkpoint {
  round: number
  startsAt: number
  cursors: number[]
  /** Index into `plan.titles` of the previous round's last title; -1 before round 0. */
  lastTitle: number
}

export function originOf(plan: ChannelPlan, epochMs: number): Checkpoint {
  return { round: 0, startsAt: epochMs, cursors: plan.titles.map(() => 0), lastTitle: -1 }
}

/** Title indices in airing order for `round`: shuffled per round, never opening with `lastTitle`. */
export function roundOrder(plan: ChannelPlan, round: number, lastTitle: number): number[] {
  const seed = (plan.seed + round) >>> 0
  const rank = plan.titles.map((title) => hash01(seed, title.key))
  const order = plan.titles.map((_, i) => i).sort((a, b) => rank[a] - rank[b] || a - b)
  if (order.length > 1 && order[0] === lastTitle) {
    order[0] = order[1]
    order[1] = lastTitle
  }
  return order
}

/**
 * One round: each title airs whole units from its cursor until the block
 * reaches `blockSeconds` or the title has aired all of its units this turn.
 */
export function playRound(plan: ChannelPlan, cp: Checkpoint): { airings: Airing[]; next: Checkpoint } {
  const cursors = cp.cursors.slice()
  const airings: Airing[] = []
  const order = roundOrder(plan, cp.round, cp.lastTitle)
  let t = cp.startsAt
  for (const index of order) {
    const { key, units } = plan.titles[index]
    let aired = 0
    let seconds = 0
    do {
      const unit = units[cursors[index]]
      const endsAt = t + unit.length * 1000
      airings.push({ unit, titleKey: key, startsAt: t, endsAt })
      t = endsAt
      seconds += unit.length
      aired++
      cursors[index] = (cursors[index] + 1) % units.length
    } while (seconds < plan.blockSeconds && aired < units.length)
  }
  return { airings, next: { round: cp.round + 1, startsAt: t, cursors, lastTitle: order[order.length - 1] } }
}

interface Memo {
  checkpoints: Checkpoint[]
  /** The last round looked up: live tiles ask about the same round every few seconds. */
  recent: { start: Checkpoint; airings: Airing[]; next: Checkpoint } | null
}

const memos = new WeakMap<ChannelPlan, Map<number, Memo>>()

function memoFor(plan: ChannelPlan, epochMs: number): Memo {
  let byEpoch = memos.get(plan)
  if (!byEpoch) {
    byEpoch = new Map()
    memos.set(plan, byEpoch)
  }
  let memo = byEpoch.get(epochMs)
  if (!memo) {
    memo = { checkpoints: [originOf(plan, epochMs)], recent: null }
    byEpoch.set(epochMs, memo)
  }
  return memo
}

/** The latest checkpoint at or before `at`, extending the list as far as needed. */
function checkpointBefore(plan: ChannelPlan, memo: Memo, at: number): Checkpoint {
  const list = memo.checkpoints
  while (list[list.length - 1].startsAt <= at) {
    let cp = list[list.length - 1]
    for (let i = 0; i < CHECKPOINT_EVERY; i++) cp = playRound(plan, cp).next
    list.push(cp)
  }
  let lo = 0
  let hi = list.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (list[mid].startsAt <= at) lo = mid
    else hi = mid - 1
  }
  return list[lo]
}

/** The round whose span contains `at`. */
function roundAt(plan: ChannelPlan, memo: Memo, at: number): { start: Checkpoint; airings: Airing[]; next: Checkpoint } {
  const recent = memo.recent
  if (recent && recent.start.startsAt <= at && at < recent.next.startsAt) return recent
  let cp = checkpointBefore(plan, memo, at)
  for (;;) {
    const { airings, next } = playRound(plan, cp)
    if (next.startsAt > at) {
      memo.recent = { start: cp, airings, next }
      return memo.recent
    }
    cp = next
  }
}

/**
 * What `plan` airs at instant `t` (epoch ms), and the `upcoming` airings
 * after it. Pure: every device gets the same answer for the same instant.
 */
export function scheduleAt(plan: ChannelPlan, epochMs: number, t: number, upcoming = 3): Schedule {
  if (plan.titles.length === 0) throw new Error(`channel ${plan.channelId} has nothing to air`)
  const at = Math.max(t, epochMs)
  const memo = memoFor(plan, epochMs)
  const round = roundAt(plan, memo, at)
  let index = 0
  while (round.airings[index].endsAt <= at) index++
  const current = round.airings[index]
  const next = round.airings.slice(index + 1, index + 1 + upcoming)
  let cp = round.next
  while (next.length < upcoming) {
    const r = playRound(plan, cp)
    next.push(...r.airings.slice(0, upcoming - next.length))
    cp = r.next
  }
  return { current, offset: (at - current.startsAt) / 1000, next }
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -w @go10/core -- src/tv/schedule.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/tv/schedule.ts packages/core/src/tv/schedule.test.ts
git commit -m "feat(core): rotating-block schedule for live TV channels

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Core — live session

**Files:**
- Create: `packages/core/src/tv/liveSession.ts`, `packages/core/src/tv/liveSession.test.ts`

**Interfaces:**
- Consumes: `scheduleAt` (Task 3); `buildEmbedSrc(embedUrl, fromTime)` from `../player/embedSrc`; `okru` from `../player/providers/okru` (`parse`, `seekMessage`).
- Produces:

```ts
export const DRIFT_SECONDS = 20
export const DRIFT_STRIKES = 2
export interface LiveSession {
  /** Joins the live second now; returns the embed src. Call on every load and every retry. */
  tune(): string
  /** Re-joins at max(now, atLeast): seeks in place if the file is the same ('seek'), else the caller reloads ('load'). */
  sync(atLeast?: number): 'seek' | 'load'
  /** A raw postMessage payload from the embed. */
  handle(data: unknown): void
  current(): Airing | null
  finishedEarly(): boolean
}
export function createLiveSession(options: {
  plan: ChannelPlan; epochMs: number; send: (command: unknown) => void
  now?: () => number; onFinishedEarly?: () => void
}): LiveSession
```

- [ ] **Step 1: Write the failing tests**

`packages/core/src/tv/liveSession.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { buildChannelPlan } from './plan'
import { createLiveSession } from './liveSession'
import { scheduleAt } from './schedule'
import { catalogRow, collectionOf, movieTitle, showTitle } from './testing'
import type { Title } from '../types'

const EPOCH = Date.UTC(2026, 9, 1)

function setup(titles: Title[] = [showTitle('a', 4, 600), movieTitle('m', 3000)]) {
  const plan = buildChannelPlan({ id: 'ch', number: 1, collection: 'ch' }, collectionOf('ch', titles.map((t) => t.key)), titles)
  let clock = EPOCH
  const sent: unknown[] = []
  const onFinishedEarly = vi.fn()
  const session = createLiveSession({ plan, epochMs: EPOCH, now: () => clock, send: (c) => sent.push(c), onFinishedEarly })
  return { plan, session, sent, onFinishedEarly, at: (t: number) => (clock = t) }
}

const tick = (time: number) => ({ event: 'timeupdate', time, duration: 9999 })

describe('createLiveSession', () => {
  it('tunes to the live second with fromTime', () => {
    const { plan, session, at } = setup()
    at(EPOCH + 125_400)
    const s = scheduleAt(plan, EPOCH, EPOCH + 125_400)
    expect(session.tune()).toBe(`${s.current.unit.row.embed_url}?autoplay=1&fromTime=${Math.floor(s.offset)}`)
    expect(session.current()).toEqual(s.current)
  })

  it('adds the chapter start to the offset inside a season pack', () => {
    const show = showTitle('db', 1, 0)
    show.seasons = [catalogRow({ video_id: 'f9', type: 'episode', series_id: 'db', episode_number: 2, chapter_start_seconds: 1335, chapter_end_seconds: 2635, duration_seconds: 1300, embed_url: 'https://ok.ru/videoembed/f9' })]
    const { session, at } = setup([show])
    at(EPOCH + 60_000)
    expect(session.tune()).toBe('https://ok.ru/videoembed/f9?autoplay=1&fromTime=1395')
  })

  it('seeks back to live after two consecutive reports more than 20 s off', () => {
    const { session, sent, at } = setup()
    at(EPOCH + 100_000)
    session.tune()
    session.handle(tick(60)) // expected 100: 40 s behind
    expect(sent).toEqual([])
    at(EPOCH + 101_000)
    session.handle(tick(61))
    expect(sent).toEqual([{ action: 'seek', time: 101 }])
  })

  it('forgives a single stray report and small drift', () => {
    const { session, sent, at } = setup()
    at(EPOCH + 100_000)
    session.tune()
    session.handle(tick(60))
    session.handle(tick(100))
    session.handle(tick(60))
    session.handle(tick(85))
    expect(sent).toEqual([])
  })

  it('ignores messages from other providers and before tuning', () => {
    const { session, sent } = setup()
    session.handle(tick(1))
    session.tune()
    session.handle({ type: 'PLAYER_EVENT', data: { event: 'timeupdate', currentTime: 999 } })
    session.handle(null)
    expect(sent).toEqual([])
  })

  it('flags a file that ends before the schedule does, once', () => {
    const { session, onFinishedEarly, at } = setup()
    at(EPOCH + 1000)
    session.tune()
    session.handle({ event: 'ended', time: 590 })
    session.handle(tick(600))
    expect(session.finishedEarly()).toBe(true)
    expect(onFinishedEarly).toHaveBeenCalledTimes(1)
  })

  it('flags a chapter played past its end', () => {
    const { session, at } = setup([showTitle('a', 4, 600)])
    at(EPOCH + 1000)
    session.tune()
    session.handle(tick(600)) // every unit is 600 s long, starting at 0
    expect(session.finishedEarly()).toBe(true)
  })

  it('does not flag an end that arrives on schedule', () => {
    const { session, at } = setup()
    at(EPOCH)
    session.tune()
    at(session.current()!.endsAt)
    session.handle({ event: 'ended', time: 600 })
    expect(session.finishedEarly()).toBe(false)
  })

  it('at a boundary, moves to the next airing: a reload for a different file', () => {
    const { session, at } = setup()
    at(EPOCH)
    session.tune()
    const first = session.current()!
    at(first.endsAt - 200) // the timer fired a little early
    expect(session.sync(first.endsAt)).toBe('load')
    expect(session.current()!.startsAt).toBe(first.endsAt)
    expect(session.finishedEarly()).toBe(false)
  })

  it('at a boundary, seeks instead when the next airing is in the same file', () => {
    const chapters = showTitle('db', 1, 0)
    chapters.seasons = [1, 2].map((n) =>
      catalogRow({ video_id: 'f9', type: 'episode', series_id: 'db', episode_number: n, chapter_start_seconds: (n - 1) * 600, chapter_end_seconds: n * 600, duration_seconds: 600, embed_url: 'https://ok.ru/videoembed/f9' }),
    )
    const { session, sent, at } = setup([chapters])
    at(EPOCH)
    session.tune()
    const first = session.current()!
    at(first.endsAt)
    expect(session.sync(first.endsAt)).toBe('seek')
    expect(sent).toEqual([{ action: 'seek', time: 600 }])
  })

  it('lands on the airing for now when the timer fires very late', () => {
    const { plan, session, at } = setup()
    at(EPOCH)
    session.tune()
    const first = session.current()!
    const later = EPOCH + 5 * 3600_000
    at(later)
    session.sync(first.endsAt)
    expect(session.current()).toEqual(scheduleAt(plan, EPOCH, later).current)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -w @go10/core -- src/tv/liveSession.test.ts`
Expected: FAIL — cannot resolve `./liveSession`.

- [ ] **Step 3: Implement `liveSession.ts`**

```ts
import { buildEmbedSrc } from '../player/embedSrc'
import { okru } from '../player/providers/okru'
import { scheduleAt } from './schedule'
import type { Airing, ChannelPlan } from './types'

/** Drift past this many seconds… */
export const DRIFT_SECONDS = 20
/** …on this many reports in a row seeks back to live. */
export const DRIFT_STRIKES = 2

export interface LiveSession {
  tune(): string
  sync(atLeast?: number): 'seek' | 'load'
  handle(data: unknown): void
  current(): Airing | null
  finishedEarly(): boolean
}

/**
 * Keeps one embed on a channel's live schedule. A sibling of the on-demand
 * playback session that writes no watch progress. Channels are catalog-only,
 * so the embed is always ok.ru.
 */
export function createLiveSession({
  plan,
  epochMs,
  send,
  now = Date.now,
  onFinishedEarly,
}: {
  plan: ChannelPlan
  epochMs: number
  send: (command: unknown) => void
  now?: () => number
  onFinishedEarly?: () => void
}): LiveSession {
  let airing: Airing | null = null
  let strikes = 0
  let early = false

  /** Moves to the airing at `at`; returns the position in its file, in seconds. */
  function settle(at: number): number {
    const schedule = scheduleAt(plan, epochMs, at, 0)
    airing = schedule.current
    strikes = 0
    early = false
    return schedule.current.unit.start + schedule.offset
  }

  function markEarly() {
    if (early || !airing || now() >= airing.endsAt) return
    early = true
    onFinishedEarly?.()
  }

  return {
    tune() {
      const position = settle(now())
      return buildEmbedSrc((airing as Airing).unit.row.embed_url, Math.floor(position))
    },

    sync(atLeast = 0) {
      const before = airing
      const position = settle(Math.max(now(), atLeast))
      if (before && before.unit.row.video_id === (airing as Airing).unit.row.video_id) {
        send(okru.seekMessage(Math.floor(position)))
        return 'seek'
      }
      return 'load'
    },

    handle(data) {
      if (!airing) return
      const event = okru.parse(data, airing.unit.row)
      if (!event) return
      if (event.kind === 'ended') return markEarly()
      if (event.kind !== 'time') return
      if (event.time >= airing.unit.start + airing.unit.length) return markEarly()
      const expected = airing.unit.start + (now() - airing.startsAt) / 1000
      if (Math.abs(event.time - expected) <= DRIFT_SECONDS) {
        strikes = 0
        return
      }
      strikes++
      if (strikes >= DRIFT_STRIKES) {
        strikes = 0
        send(okru.seekMessage(Math.floor(expected)))
      }
    },

    current: () => airing,
    finishedEarly: () => early,
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -w @go10/core -- src/tv/liveSession.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/tv/liveSession.ts packages/core/src/tv/liveSession.test.ts
git commit -m "feat(core): live session keeps an embed on a channel's schedule

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Core — channel validation, lineup, last channel, labels

**Files:**
- Create: `packages/core/src/tv/validateChannels.ts`, `packages/core/src/tv/validateChannels.test.ts`
- Create: `packages/core/src/tv/lineup.ts`, `packages/core/src/tv/lineup.test.ts`
- Create: `packages/core/src/tv/describe.ts`, `packages/core/src/tv/describe.test.ts`

**Interfaces:**
- Consumes: `buildChannelPlan` (Task 2); `keyValueStore()` from `../ports/keyValueStore`; `rowLabel(row)` from `../progress/describe`.
- Produces:

```ts
// validateChannels.ts
export interface ChannelValidationContext { collections?: Collection[]; titles?: Title[] }
export function validateChannelsTop(raw: unknown): string[]
export function validateChannelEntry(entry: unknown, index: number, ctx: ChannelValidationContext): string[]
export function validateChannels(raw: unknown, ctx: ChannelValidationContext): string[]
// lineup.ts
export function resolveLineup(raw: unknown, collections: Collection[], titles: Title[]): Lineup | null
export function readLastChannel(): string | null
export function writeLastChannel(id: string): void
export function pickChannel(lineup: Lineup, requested: string | null): Channel | null
export function stepChannel(lineup: Lineup, id: string, step: 1 | -1): Channel
export function channelByNumber(lineup: Lineup, number: number): Channel | null
// describe.ts
export function programLabel(unit: Unit): string
export function clockLabel(ms: number): string
export function progressOf(schedule: Schedule): number
```

- [ ] **Step 1: Write the failing validation tests**

`packages/core/src/tv/validateChannels.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { validateChannels } from './validateChannels'
import { collectionOf, movieTitle } from './testing'

const collections = [collectionOf('cn', ['m1', 'm2']), collectionOf('empty', ['m0'])]
const titles = [movieTitle('m1', 600), movieTitle('m2', 600), movieTitle('m0', 0)]
const valid = () => ({
  epoch: '2026-10-01T00:00:00Z',
  defaultChannel: 'cn',
  channels: [{ id: 'cn', number: 1, collection: 'cn' }],
})

describe('validateChannels', () => {
  it('accepts a valid file', () => {
    expect(validateChannels(valid(), { collections, titles })).toEqual([])
  })

  it('rejects a bad top level', () => {
    expect(validateChannels(null, {})).toEqual(['channels.json: must be a JSON object'])
    expect(validateChannels({ ...valid(), epoch: '2026-10-01' }, {})).toEqual([
      'channels.json: epoch must be an ISO-8601 instant with a time zone, like 2026-10-01T00:00:00Z',
    ])
    expect(validateChannels({ ...valid(), channels: [] }, {})).toContain('channels.json: channels must be a non-empty array')
    expect(validateChannels({ ...valid(), defaultChannel: 'nope' }, {})).toEqual([
      'channels.json: defaultChannel "nope" is not a listed channel',
    ])
  })

  it('rejects malformed entries', () => {
    const raw = { ...valid(), channels: [{ id: 'Bad Id', number: 0, collection: 3, name: '', blockMinutes: 2, exclude: 'x' }] }
    expect(validateChannels(raw, {})).toEqual([
      'channels.json: channels[0]: id must be a kebab-case string',
      'channels.json: channels[0]: number must be a positive integer',
      'channels.json: channels[0]: collection must be a string',
      'channels.json: channels[0]: name must be a non-empty string when present',
      'channels.json: channels[0]: blockMinutes must be an integer from 5 to 240',
      'channels.json: channels[0]: exclude must be an array of title keys',
      'channels.json: defaultChannel "cn" is not a listed channel',
    ])
  })

  it('rejects duplicate ids and numbers', () => {
    const raw = { ...valid(), channels: [{ id: 'cn', number: 1, collection: 'cn' }, { id: 'cn', number: 1, collection: 'cn' }] }
    expect(validateChannels(raw, {})).toEqual([
      'channels.json: id "cn" is used by more than one channel',
      'channels.json: number 1 is used by more than one channel',
    ])
  })

  it('checks collections, excluded keys and airability against the catalog', () => {
    const raw = {
      ...valid(),
      channels: [
        { id: 'cn', number: 1, collection: 'cn', exclude: ['m9'] },
        { id: 'gone', number: 2, collection: 'nope' },
        { id: 'dead', number: 3, collection: 'empty' },
      ],
    }
    expect(validateChannels(raw, { collections, titles })).toEqual([
      'channels.json: channels[0] (cn): exclude key "m9" is not in collection "cn"',
      'channels.json: channels[1] (gone): unknown collection "nope"',
      'channels.json: channels[2] (dead): nothing in collection "empty" can air',
    ])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -w @go10/core -- src/tv/validateChannels.test.ts`
Expected: FAIL — cannot resolve `./validateChannels`.

- [ ] **Step 3: Implement `validateChannels.ts`**

```ts
import type { Title } from '../types'
import type { Collection } from '../collections/types'
import { buildChannelPlan } from './plan'
import type { ChannelConfig } from './types'

/** Omit either to validate structure only, as the app does at runtime before the catalog loads. */
export interface ChannelValidationContext {
  collections?: Collection[]
  titles?: Title[]
}

const FILE = 'channels.json'
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/
/** An instant, not a local time: every viewer must share it. */
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Problems with the file's own fields (not its channels). */
export function validateChannelsTop(raw: unknown): string[] {
  if (!isObject(raw)) return [`${FILE}: must be a JSON object`]
  const errors: string[] = []
  if (typeof raw.epoch !== 'string' || !INSTANT.test(raw.epoch) || Number.isNaN(Date.parse(raw.epoch))) {
    errors.push(`${FILE}: epoch must be an ISO-8601 instant with a time zone, like 2026-10-01T00:00:00Z`)
  }
  if (typeof raw.defaultChannel !== 'string') errors.push(`${FILE}: defaultChannel must be a string`)
  if (!Array.isArray(raw.channels) || raw.channels.length === 0) errors.push(`${FILE}: channels must be a non-empty array`)
  return errors
}

/** Problems with one channel entry; catalog checks only when `ctx` has the data. */
export function validateChannelEntry(entry: unknown, index: number, ctx: ChannelValidationContext): string[] {
  const where = `${FILE}: channels[${index}]`
  if (!isObject(entry)) return [`${where}: must be an object`]
  const errors: string[] = []
  const fail = (message: string) => errors.push(`${where}: ${message}`)

  if (typeof entry.id !== 'string' || !KEBAB.test(entry.id)) fail('id must be a kebab-case string')
  if (!Number.isInteger(entry.number) || (entry.number as number) < 1) fail('number must be a positive integer')
  if (typeof entry.collection !== 'string') fail('collection must be a string')
  if (entry.name !== undefined && (typeof entry.name !== 'string' || entry.name.trim() === '')) {
    fail('name must be a non-empty string when present')
  }
  if (
    entry.blockMinutes !== undefined &&
    (!Number.isInteger(entry.blockMinutes) || (entry.blockMinutes as number) < 5 || (entry.blockMinutes as number) > 240)
  ) {
    fail('blockMinutes must be an integer from 5 to 240')
  }
  if (entry.exclude !== undefined && (!Array.isArray(entry.exclude) || entry.exclude.some((k) => typeof k !== 'string'))) {
    fail('exclude must be an array of title keys')
  }
  if (errors.length > 0 || !ctx.collections) return errors

  const config = entry as unknown as ChannelConfig
  const named = `${FILE}: channels[${index}] (${config.id})`
  const collection = ctx.collections.find((c) => c.id === config.collection)
  if (!collection) return [`${named}: unknown collection "${config.collection}"`]
  for (const key of config.exclude ?? []) {
    if (!collection.titles.includes(key)) errors.push(`${named}: exclude key "${key}" is not in collection "${collection.id}"`)
  }
  if (ctx.titles && buildChannelPlan(config, collection, ctx.titles).titles.length === 0) {
    errors.push(`${named}: nothing in collection "${collection.id}" can air`)
  }
  return errors
}

/** Every problem with the file, as `channels.json: …` strings. Takes raw JSON: imported JSON is never type-checked. */
export function validateChannels(raw: unknown, ctx: ChannelValidationContext): string[] {
  const errors = validateChannelsTop(raw)
  if (!isObject(raw) || !Array.isArray(raw.channels)) return errors
  const channels: unknown[] = raw.channels
  channels.forEach((entry, index) => errors.push(...validateChannelEntry(entry, index, ctx)))

  const seen = (field: 'id' | 'number') => {
    const counts = new Map<unknown, number>()
    for (const entry of channels) if (isObject(entry)) counts.set(entry[field], (counts.get(entry[field]) ?? 0) + 1)
    for (const [value, count] of counts) {
      if (count > 1) errors.push(`${FILE}: ${field} ${field === 'id' ? `"${value}"` : value} is used by more than one channel`)
    }
  }
  seen('id')
  seen('number')

  const ids = channels.flatMap((entry) => (isObject(entry) && typeof entry.id === 'string' && KEBAB.test(entry.id) ? [entry.id] : []))
  if (typeof raw.defaultChannel === 'string' && !ids.includes(raw.defaultChannel)) {
    errors.push(`${FILE}: defaultChannel "${raw.defaultChannel}" is not a listed channel`)
  }
  return errors
}
```

Run: `npm test -w @go10/core -- src/tv/validateChannels.test.ts` → PASS.

- [ ] **Step 4: Write the failing lineup tests**

`packages/core/src/tv/lineup.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { channelByNumber, pickChannel, readLastChannel, resolveLineup, stepChannel, writeLastChannel } from './lineup'
import { keyValueStore } from '../ports/keyValueStore'
import { collectionOf, movieTitle } from './testing'

const collections = [collectionOf('cn', ['m1']), collectionOf('jx', ['m2']), collectionOf('empty', ['m0'])]
const titles = [movieTitle('m1', 600), movieTitle('m2', 600), movieTitle('m0', 0)]
const raw = {
  epoch: '2026-10-01T00:00:00Z',
  defaultChannel: 'jx',
  channels: [
    { id: 'jx', number: 2, collection: 'jx', name: 'Jetix TV' },
    { id: 'cn', number: 1, collection: 'cn' },
    { id: 'dead', number: 3, collection: 'empty' },
    { id: 'cn', number: 4, collection: 'cn' },
    { id: 'broken', number: 'x', collection: 'cn' },
  ],
}

afterEach(() => {
  for (const key of keyValueStore().keys()) keyValueStore().removeItem(key)
  vi.restoreAllMocks()
})

describe('resolveLineup', () => {
  it('keeps valid, airable, first-seen channels sorted by number, and warns about the rest', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const lineup = resolveLineup(raw, collections, titles)!
    expect(lineup.epochMs).toBe(Date.UTC(2026, 9, 1))
    expect(lineup.channels.map((c) => [c.number, c.id, c.name])).toEqual([[1, 'cn', 'CN'], [2, 'jx', 'Jetix TV']])
    expect(lineup.defaultChannel).toBe('jx')
    expect(warn).toHaveBeenCalledTimes(3) // dead, duplicate cn, broken
  })

  it('falls back to the first channel when the default did not survive', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolveLineup({ ...raw, defaultChannel: 'dead' }, collections, titles)!.defaultChannel).toBe('cn')
  })

  it('is null when the file is unusable or nothing airs', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolveLineup({ ...raw, epoch: 'soon' }, collections, titles)).toBeNull()
    expect(resolveLineup({ ...raw, channels: [{ id: 'dead', number: 3, collection: 'empty' }], defaultChannel: 'dead' }, collections, titles)).toBeNull()
  })
})

describe('channel picking', () => {
  const lineup = () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    return resolveLineup(raw, collections, titles)!
  }

  it('honours a requested channel, and refuses an unknown one', () => {
    expect(pickChannel(lineup(), 'cn')!.id).toBe('cn')
    expect(pickChannel(lineup(), 'nope')).toBeNull()
  })

  it('opens the last channel watched, else the default', () => {
    expect(pickChannel(lineup(), null)!.id).toBe('jx')
    writeLastChannel('cn')
    expect(readLastChannel()).toBe('cn')
    expect(pickChannel(lineup(), null)!.id).toBe('cn')
  })

  it('ignores a remembered channel that no longer exists', () => {
    writeLastChannel('removed-channel')
    expect(pickChannel(lineup(), null)!.id).toBe('jx')
  })

  it('steps through channels by number, wrapping', () => {
    expect(stepChannel(lineup(), 'cn', 1).id).toBe('jx')
    expect(stepChannel(lineup(), 'jx', 1).id).toBe('cn')
    expect(stepChannel(lineup(), 'cn', -1).id).toBe('jx')
  })

  it('finds a channel by number', () => {
    expect(channelByNumber(lineup(), 2)!.id).toBe('jx')
    expect(channelByNumber(lineup(), 9)).toBeNull()
  })
})
```

- [ ] **Step 5: Run to verify failure, then implement `lineup.ts`**

Run: `npm test -w @go10/core -- src/tv/lineup.test.ts` → FAIL.

```ts
import type { Title } from '../types'
import type { Collection } from '../collections/types'
import { keyValueStore } from '../ports/keyValueStore'
import { buildChannelPlan } from './plan'
import { validateChannelEntry, validateChannelsTop } from './validateChannels'
import type { Channel, ChannelConfig, ChannelsFile, Lineup } from './types'

const LAST_CHANNEL_KEY = 'go10:tvLastChannel'

/**
 * The channels that can air, sorted by number. A bad entry is skipped with a
 * warning so one hand edit can't take the TV screen down; the data test is
 * what fails CI. Null when the file itself is unusable or nothing can air.
 */
export function resolveLineup(raw: unknown, collections: Collection[], titles: Title[]): Lineup | null {
  const top = validateChannelsTop(raw)
  if (top.length > 0) {
    console.warn(`Live TV off: ${top.join('; ')}`)
    return null
  }
  const file = raw as ChannelsFile
  const ids = new Set<string>()
  const numbers = new Set<number>()
  const channels: Channel[] = []
  file.channels.forEach((entry: unknown, index) => {
    const errors = validateChannelEntry(entry, index, { collections, titles })
    const config = entry as ChannelConfig
    if (errors.length === 0 && (ids.has(config.id) || numbers.has(config.number))) {
      errors.push(`channels.json: channels[${index}] (${config.id}): duplicate id or number`)
    }
    if (errors.length > 0) {
      console.warn(`Skipping channel: ${errors.join('; ')}`)
      return
    }
    const collection = collections.find((c) => c.id === config.collection) as Collection
    ids.add(config.id)
    numbers.add(config.number)
    channels.push({
      id: config.id,
      number: config.number,
      name: config.name ?? collection.name,
      collection,
      plan: buildChannelPlan(config, collection, titles),
    })
  })
  if (channels.length === 0) return null
  channels.sort((a, b) => a.number - b.number)
  return {
    epochMs: Date.parse(file.epoch),
    defaultChannel: ids.has(file.defaultChannel) ? file.defaultChannel : channels[0].id,
    channels,
  }
}

export function readLastChannel(): string | null {
  try {
    return keyValueStore().getItem(LAST_CHANNEL_KEY)
  } catch {
    return null
  }
}

export function writeLastChannel(id: string): void {
  try {
    keyValueStore().setItem(LAST_CHANNEL_KEY, id)
  } catch {
    // ignore — private mode, quota exceeded, or storage disabled
  }
}

/**
 * The channel a TV route shows: the requested one (null if unknown, so the
 * caller can redirect), else the last one watched, else the default.
 */
export function pickChannel(lineup: Lineup, requested: string | null): Channel | null {
  const byId = (id: string | null) => (id ? (lineup.channels.find((c) => c.id === id) ?? null) : null)
  if (requested) return byId(requested)
  return byId(readLastChannel()) ?? byId(lineup.defaultChannel) ?? lineup.channels[0] ?? null
}

/** The neighbouring channel by number, wrapping around. */
export function stepChannel(lineup: Lineup, id: string, step: 1 | -1): Channel {
  const index = lineup.channels.findIndex((c) => c.id === id)
  const count = lineup.channels.length
  return lineup.channels[(index + step + count) % count]
}

export function channelByNumber(lineup: Lineup, number: number): Channel | null {
  return lineup.channels.find((c) => c.number === number) ?? null
}
```

Run: `npm test -w @go10/core -- src/tv/lineup.test.ts` → PASS.

- [ ] **Step 6: Labels — test, then implement `describe.ts`**

`packages/core/src/tv/describe.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { clockLabel, programLabel, progressOf } from './describe'
import { catalogRow } from './testing'
import type { Unit } from './types'

const unit = (overrides: Parameters<typeof catalogRow>[0]): Unit => ({ row: catalogRow(overrides), key: 'k', start: 0, length: 600 })

describe('programLabel', () => {
  it('names a movie by its title', () => {
    expect(programLabel(unit({ type: 'movie', title: 'Mulán' }))).toBe('Mulán')
  })
  it('names an episode by series and position', () => {
    expect(programLabel(unit({ type: 'episode', series_title: 'Coraje', season_number: 2, episode_number: 5 }))).toBe('Coraje · T2 · E5')
  })
  it('names a whole-season video by series and season', () => {
    expect(programLabel(unit({ type: 'season', series_title: 'Love, Death & Robots', season_number: 1, season_label: 'Volumen 1' }))).toBe('Love, Death & Robots · Volumen 1')
  })
})

describe('clockLabel', () => {
  it('formats local HH:MM', () => {
    const d = new Date(2026, 9, 1, 9, 5)
    expect(clockLabel(d.getTime())).toBe('09:05')
  })
})

describe('progressOf', () => {
  it('is the fraction of the unit aired, clamped', () => {
    const u = unit({})
    const airing = { unit: u, titleKey: 't', startsAt: 0, endsAt: 600_000 }
    expect(progressOf({ current: airing, offset: 150, next: [] })).toBe(0.25)
    expect(progressOf({ current: airing, offset: 900, next: [] })).toBe(1)
  })
})
```

Run → FAIL. Then `packages/core/src/tv/describe.ts`:

```ts
import { rowLabel } from '../progress/describe'
import type { Schedule, Unit } from './types'

/** "Mulán", "Coraje · T2 · E5", "Love, Death & Robots · Volumen 1". */
export function programLabel(unit: Unit): string {
  const row = unit.row
  if (row.type === 'movie') return row.title
  const position = rowLabel(row)
  return position ? `${row.series_title} · ${position}` : row.series_title
}

/** Local wall-clock time, "21:40". */
export function clockLabel(ms: number): string {
  const date = new Date(ms)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/** How much of the current program has aired, 0..1. */
export function progressOf(schedule: Schedule): number {
  return Math.min(1, Math.max(0, schedule.offset / schedule.current.unit.length))
}
```

Run: `npm test -w @go10/core -- src/tv` → PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/tv
git commit -m "feat(core): channel lineup, validation and program labels

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Core — the `tv` route

**Files:**
- Modify: `packages/core/src/router/route.ts`, `packages/core/src/router/route.test.ts`
- Modify: `packages/core/src/router/resolveRoute.ts`, `packages/core/src/router/resolveRoute.test.ts`

**Interfaces:**
- Produces: `Route` gains `{ name: 'tv'; channel: string | null }`; `ResolvedView` gains `{ name: 'tv'; channel: string | null }` (resolved against the lineup in the app, which core's router doesn't know).

- [ ] **Step 1: Write the failing tests**

Append to `describe('parseRoute', …)` in `route.test.ts`:

```ts
  it('parses /tv with no channel', () => {
    expect(parseRoute('/tv')).toEqual({ name: 'tv', channel: null })
  })

  it('parses /tv/<channel>', () => {
    expect(parseRoute('/tv/cartoon-network')).toEqual({ name: 'tv', channel: 'cartoon-network' })
  })
```

Append to `describe('routeToPath', …)`:

```ts
  it('serialises the tv routes', () => {
    expect(routeToPath({ name: 'tv', channel: null })).toBe('/tv')
    expect(routeToPath({ name: 'tv', channel: 'cartoon-network' })).toBe('/tv/cartoon-network')
  })
```

Append to `describe('resolveRoute', …)` in `resolveRoute.test.ts`:

```ts
  it('passes the tv route through for the app to resolve against its lineup', () => {
    expect(resolveRoute({ name: 'tv', channel: 'cn' }, [])).toEqual({ name: 'tv', channel: 'cn' })
  })
```

Run: `npm test -w @go10/core -- src/router` → FAIL.

- [ ] **Step 2: Implement**

In `route.ts`, add to the `Route` union: `| { name: 'tv'; channel: string | null }`. In `parseRoute`, before the section slugs:

```ts
  if (segments[0] === 'tv' && segments.length <= 2) {
    return { name: 'tv', channel: segments[1] ?? null }
  }
```

In `routeToPath`'s switch:

```ts
    case 'tv':
      return route.channel ? `/tv/${encodeURIComponent(route.channel)}` : '/tv'
```

In `resolveRoute.ts`, add `| { name: 'tv'; channel: string | null }` to `ResolvedView` and, after the `home` check:

```ts
  if (route.name === 'tv') return { name: 'tv', channel: route.channel }
```

- [ ] **Step 3: Run tests and the full typecheck**

Run: `npm test -w @go10/core -- src/router && npm run typecheck`
Expected: PASS. If `apps/mobile` fails to typecheck because a `switch` over `Route`/`ResolvedView` is now non-exhaustive, add a `'tv'` case that behaves like `'home'` there (the mobile app gets TV in a later spec), and re-run.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/router apps/mobile
git commit -m "feat(core): /tv and /tv/:channel routes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Data — `channels.json`, bundling and the data test

**Files:**
- Create: `data/channels.json`
- Create: `apps/web/src/tv/channels.ts`, `apps/web/src/tv/channels.data.test.ts`, `apps/web/src/tv/useLineup.ts`

**Interfaces:**
- Consumes: `validateChannels`, `resolveLineup` (Task 5); `COLLECTIONS` from `../collections/collections`.
- Produces: `CHANNELS_FILE: unknown`; `useLineup(titles: Title[]): Lineup | null`.

- [ ] **Step 1: Write the lineup**

`data/channels.json` (one channel per collection, numbered in Home tile order; Cartoon Network is the default):

```json
{
  "epoch": "2026-10-01T00:00:00Z",
  "defaultChannel": "cartoon-network",
  "channels": [
    { "id": "cartoon-network", "number": 1, "collection": "cartoon-network" },
    { "id": "jetix", "number": 2, "collection": "jetix" },
    { "id": "disney", "number": 3, "collection": "disney" },
    { "id": "nickelodeon", "number": 4, "collection": "nickelodeon" },
    { "id": "adult-swim", "number": 5, "collection": "adult-swim" },
    { "id": "pixar", "number": 6, "collection": "pixar" },
    { "id": "fox", "number": 7, "collection": "fox" },
    { "id": "warner-bros", "number": 8, "collection": "warner-bros" },
    { "id": "dreamworks", "number": 9, "collection": "dreamworks" },
    { "id": "toei", "number": 10, "collection": "toei" },
    { "id": "animax", "number": 11, "collection": "animax" },
    { "id": "netflix", "number": 12, "collection": "netflix" },
    { "id": "prime-video", "number": 13, "collection": "prime-video" },
    { "id": "barbie", "number": 14, "collection": "barbie" },
    { "id": "monster-high", "number": 15, "collection": "monster-high" }
  ]
}
```

- [ ] **Step 2: Write the failing data test**

`apps/web/src/tv/channels.data.test.ts`:

```ts
/// <reference types="node" />
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildTitles, parseCatalogCsv } from '@go10/core/catalog/loadCatalog'
import { validateChannels } from '@go10/core/tv/validateChannels'
import { COLLECTIONS } from '../collections/collections'
import { CHANNELS_FILE } from './channels'

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public')

describe('data/channels.json', () => {
  it('is valid against the real catalog and collections', () => {
    const titles = buildTitles(parseCatalogCsv(readFileSync(join(PUBLIC, 'data', 'catalog.csv'), 'utf8')))
    expect(validateChannels(CHANNELS_FILE, { collections: COLLECTIONS, titles })).toEqual([])
  })
})
```

Run: `npm test -w @go10/web -- src/tv/channels.data.test.ts` → FAIL (`./channels` missing).

- [ ] **Step 3: Bundle the file and add the hook**

`apps/web/src/tv/channels.ts` (a glob like `collections.ts`, so no JSON-module compiler option is needed):

```ts
const modules = import.meta.glob<unknown>('../../../../data/channels.json', { eager: true, import: 'default' })

/** `data/channels.json` as written; validated by `channels.data.test.ts`, resolved by `useLineup`. */
export const CHANNELS_FILE: unknown = Object.values(modules)[0] ?? null
```

`apps/web/src/tv/useLineup.ts`:

```ts
import { useMemo } from 'react'
import type { Title } from '@go10/core/types'
import type { Lineup } from '@go10/core/tv/types'
import { resolveLineup } from '@go10/core/tv/lineup'
import { COLLECTIONS } from '../collections/collections'
import { CHANNELS_FILE } from './channels'

/** The channels on air for the loaded catalog; null while it loads or when nothing can air. */
export function useLineup(titles: Title[]): Lineup | null {
  return useMemo(() => (titles.length > 0 ? resolveLineup(CHANNELS_FILE, COLLECTIONS, titles) : null), [titles])
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -w @go10/web -- src/tv/channels.data.test.ts`
Expected: PASS. If a channel reports "nothing … can air", remove that channel from `channels.json` (and renumber nothing — numbers may have gaps) rather than weakening the test.

- [ ] **Step 5: Commit**

```bash
git add data/channels.json apps/web/src/tv
git commit -m "feat: channel lineup, one channel per collection

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Web — `TvSlot`, one live iframe with the retry policy

**Files:**
- Create: `apps/web/src/tv/TvSlot.tsx`, `apps/web/src/tv/TvSlot.test.tsx`, `apps/web/src/tv/tv.css`

**Interfaces:**
- Consumes: `createLiveSession` (Task 4); `scheduleAt` (Task 3); `programLabel`, `clockLabel` (Task 5); `playerRetryReducer`, `initialPlayerRetryState`, `backoffMs` (core `player/playerRetry`); `LOAD_TIMEOUT_MS` (core `player/playbackSession`); `okru` (core `player/providers/okru`); `imageSrc` (core `lib/imageSrc`).
- Produces:

```ts
export type SlotMode = 'staged' | 'full' | 'tile' | 'mini'
export interface Rect { top: number; left: number; width: number; height: number }
export interface SlotHandle { post(message: unknown): void; isLoaded(): boolean }
export function TvSlot(props: {
  channel: Channel; epochMs: number; mode: SlotMode; rect?: Rect | null
  /** Preview slots give up after one retry and fall back to the thumbnail. */
  preview?: boolean
  /** Called with the slot's handle when mounted, null when unmounted. */
  bind?: (handle: SlotHandle | null) => void
  /** Fired once each time the iframe finishes loading. */
  onLoaded?: () => void
}): JSX.Element
```

DOM contract (used by tests and CSS): root `div.go-tvslot.go-tvslot--<mode>` with `data-channel`; iframe `.go-tvslot_frame`; overlays `role="status"` with texts "Reconectando…", "Señal interrumpida", and the finished-early card "A continuación: <label> · <HH:MM>".

- [ ] **Step 1: Write the failing tests**

`apps/web/src/tv/TvSlot.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { TvSlot } from './TvSlot'
import { buildChannelPlan } from '@go10/core/tv/plan'
import { scheduleAt } from '@go10/core/tv/schedule'
import { collectionOf, movieTitle, showTitle } from '@go10/core/tv/testing'
import type { Channel } from '@go10/core/tv/types'

const EPOCH = Date.UTC(2026, 9, 1)
const titles = [showTitle('a', 3, 600), movieTitle('m', 3000)]
const collection = collectionOf('cn', ['a', 'm'])
const channel: Channel = {
  id: 'cn', number: 1, name: 'CN', collection,
  plan: buildChannelPlan({ id: 'cn', number: 1, collection: 'cn' }, collection, titles),
}

const frame = () => document.querySelector('.go-tvslot_frame') as HTMLIFrameElement | null

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(EPOCH + 61_000)
})
afterEach(() => vi.useRealTimers())

describe('TvSlot', () => {
  it('loads the live second of the channel', () => {
    render(<TvSlot channel={channel} epochMs={EPOCH} mode="full" />)
    const s = scheduleAt(channel.plan, EPOCH, EPOCH + 61_000)
    expect(frame()!.src).toBe(`${s.current.unit.row.embed_url}?autoplay=1&fromTime=61`)
    expect(document.querySelector('.go-tvslot--full')).not.toBeNull()
  })

  it('retries a load that never finishes, rejoining live each time', () => {
    render(<TvSlot channel={channel} epochMs={EPOCH} mode="full" />)
    act(() => vi.advanceTimersByTime(8000))
    expect(screen.getByRole('status').textContent).toBe('Reconectando…')
    act(() => vi.advanceTimersByTime(1000))
    expect(frame()!.src).toMatch(/fromTime=70$/)
  })

  it('shows "Señal interrumpida" with the next program after the last retry, and retunes at the boundary', () => {
    render(<TvSlot channel={channel} epochMs={EPOCH} mode="full" />)
    // 4 timeouts (initial + 3 retries) with 1 s, 2 s, 3 s backoff between them.
    for (const wait of [8000, 1000, 8000, 2000, 8000, 3000, 8000]) act(() => vi.advanceTimersByTime(wait))
    expect(screen.getByRole('status').textContent).toMatch(/^Señal interrumpida/)
    expect(screen.getByRole('status').textContent).toMatch(/Volvemos con .+ a las \d\d:\d\d/)
    expect(frame()).toBeNull()
    // Fake timers move Date.now() along with the timers they fire.
    const s = scheduleAt(channel.plan, EPOCH, Date.now())
    act(() => vi.advanceTimersByTime(s.current.endsAt - Date.now() + 1))
    expect(frame()).not.toBeNull()
  })

  it('gives a preview one retry, then shows the program thumbnail', () => {
    render(<TvSlot channel={channel} epochMs={EPOCH} mode="tile" preview rect={{ top: 1, left: 2, width: 300, height: 169 }} />)
    for (const wait of [8000, 1000, 8000]) act(() => vi.advanceTimersByTime(wait))
    expect(frame()).toBeNull()
    expect(document.querySelector('.go-tvslot_thumb')).not.toBeNull()
  })

  it('stays ready once the frame loads', () => {
    render(<TvSlot channel={channel} epochMs={EPOCH} mode="full" />)
    fireEvent.load(frame()!)
    act(() => vi.advanceTimersByTime(20_000))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('moves to the next program at the boundary', () => {
    render(<TvSlot channel={channel} epochMs={EPOCH} mode="full" />)
    fireEvent.load(frame()!)
    const first = scheduleAt(channel.plan, EPOCH, Date.now())
    act(() => vi.advanceTimersByTime(first.current.endsAt - Date.now()))
    const next = scheduleAt(channel.plan, EPOCH, first.current.endsAt)
    expect(frame()!.src.startsWith(next.current.unit.row.embed_url)).toBe(true)
  })

  it('places a tile-mode slot on the given rectangle', () => {
    render(<TvSlot channel={channel} epochMs={EPOCH} mode="tile" preview rect={{ top: 10, left: 20, width: 300, height: 169 }} />)
    const root = document.querySelector('.go-tvslot') as HTMLElement
    expect([root.style.top, root.style.left, root.style.width, root.style.height]).toEqual(['10px', '20px', '300px', '169px'])
  })

  it('exposes a handle that posts to the embed', () => {
    let handle: { post(m: unknown): void } | null = null
    render(<TvSlot channel={channel} epochMs={EPOCH} mode="full" bind={(h) => (handle = h)} />)
    const post = vi.spyOn(frame()!.contentWindow!, 'postMessage')
    handle!.post({ action: 'play' })
    expect(post).toHaveBeenCalledWith({ action: 'play' }, 'https://ok.ru')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -w @go10/web -- src/tv/TvSlot.test.tsx`
Expected: FAIL — cannot resolve `./TvSlot`.

- [ ] **Step 3: Implement `TvSlot.tsx`**

```tsx
import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { Channel } from '@go10/core/tv/types'
import { createLiveSession } from '@go10/core/tv/liveSession'
import { scheduleAt } from '@go10/core/tv/schedule'
import { clockLabel, programLabel } from '@go10/core/tv/describe'
import { playerRetryReducer, initialPlayerRetryState, backoffMs } from '@go10/core/player/playerRetry'
import { LOAD_TIMEOUT_MS } from '@go10/core/player/playbackSession'
import { okru } from '@go10/core/player/providers/okru'
import { imageSrc } from '@go10/core/lib/imageSrc'
import './tv.css'

export type SlotMode = 'staged' | 'full' | 'tile' | 'mini'

export interface Rect {
  top: number
  left: number
  width: number
  height: number
}

export interface SlotHandle {
  post(message: unknown): void
  isLoaded(): boolean
}

/** How many retries a preview gets before it settles for the thumbnail. */
const PREVIEW_RETRIES = 1

/**
 * One channel's embed, kept on the live schedule. It never moves in the DOM
 * (a moved iframe reloads); `mode` only changes where CSS puts it.
 */
export function TvSlot({
  channel,
  epochMs,
  mode,
  rect,
  preview = false,
  bind,
  onLoaded,
}: {
  channel: Channel
  epochMs: number
  mode: SlotMode
  rect?: Rect | null
  preview?: boolean
  bind?: (handle: SlotHandle | null) => void
  onLoaded?: () => void
}) {
  const [state, dispatch] = useReducer(playerRetryReducer, initialPlayerRetryState)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const loaded = useRef(false)
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const onLoadedRef = useRef(onLoaded)
  onLoadedRef.current = onLoaded

  const [session] = useState(() =>
    createLiveSession({
      plan: channel.plan,
      epochMs,
      send: (command) => frameRef.current?.contentWindow?.postMessage(command, okru.origin),
      onFinishedEarly: rerender,
    }),
  )

  // Every load and every retry rejoins the live second.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const src = useMemo(() => session.tune(), [state.reloadToken])
  const airing = session.current()

  const gaveUp = state.status === 'failed' || (preview && state.attempt > PREVIEW_RETRIES)

  useEffect(() => {
    if (!bind) return
    bind({
      post: (message) => frameRef.current?.contentWindow?.postMessage(message, okru.origin),
      isLoaded: () => loaded.current,
    })
    return () => bind(null)
  }, [bind])

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== okru.origin || event.source !== frameRef.current?.contentWindow) return
      session.handle(event.data)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [session])

  // The on-demand Player's retry loop, unchanged: timeout → backoff → remount.
  useEffect(() => {
    if (gaveUp) return
    if (state.status === 'loading') {
      const timer = setTimeout(() => {
        if (!loaded.current) dispatch({ type: 'timeout' })
      }, LOAD_TIMEOUT_MS)
      return () => clearTimeout(timer)
    }
    if (state.status === 'retrying') {
      const timer = setTimeout(() => {
        loaded.current = false
        dispatch({ type: 'retryLoadStarted' })
      }, backoffMs(state.attempt))
      return () => clearTimeout(timer)
    }
  }, [state.status, state.attempt, state.reloadToken, gaveUp])

  // The program boundary. A dead slot retunes from scratch there, so the channel never stays down.
  const endsAt = airing?.endsAt ?? 0
  useEffect(() => {
    if (!endsAt) return
    const timer = setTimeout(() => {
      if (gaveUp || session.sync(endsAt) === 'load') {
        loaded.current = false
        dispatch({ type: 'reset' })
      } else {
        rerender()
      }
    }, Math.max(0, endsAt - Date.now()))
    return () => clearTimeout(timer)
  }, [endsAt, gaveUp, session])

  // Back from a hidden tab or a sleeping device: rejoin live.
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState !== 'visible') return
      if (gaveUp || session.sync() === 'load') {
        loaded.current = false
        dispatch({ type: 'reset' })
      } else {
        rerender()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [gaveUp, session])

  const upNext = () => {
    const after = scheduleAt(channel.plan, epochMs, endsAt, 1).current
    return `${programLabel(after.unit)} a las ${clockLabel(after.startsAt)}`
  }

  const style = mode === 'tile' && rect ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height } : undefined

  return (
    <div className={`go-tvslot go-tvslot--${mode}`} data-channel={channel.id} style={style}>
      {gaveUp ? (
        preview ? (
          airing && <img className="go-tvslot_thumb" src={imageSrc(airing.unit.row.thumbnail)} alt="" />
        ) : (
          <div className="go-tvslot_card" role="status">
            <strong>Señal interrumpida</strong>
            <span>Volvemos con {upNext()}</span>
          </div>
        )
      ) : (
        <iframe
          key={state.reloadToken}
          ref={frameRef}
          className="go-tvslot_frame"
          src={src}
          title={airing ? programLabel(airing.unit) : channel.name}
          allow="autoplay; fullscreen; encrypted-media"
          allowFullScreen
          onLoad={() => {
            loaded.current = true
            dispatch({ type: 'loaded' })
            onLoadedRef.current?.()
          }}
        />
      )}
      {!preview && !gaveUp && state.status === 'retrying' && (
        <div className="go-tvslot_reconnecting" role="status">
          Reconectando…
        </div>
      )}
      {!gaveUp && session.finishedEarly() && (
        <div className="go-tvslot_card" role="status">
          <span>A continuación: {upNext()}</span>
        </div>
      )}
    </div>
  )
}
```

Note: the finished-early card text reads "A continuación: <label> a las <HH:MM>" (same helper); that satisfies the spec's "A continuación: … · 21:40" intent with one formatter.

- [ ] **Step 4: Write `tv.css` (slot part)**

```css
/* The persistent layer: slots are positioned here, never re-parented. */
.go-tvslot {
  position: fixed;
  overflow: hidden;
  background: #000;
}
.go-tvslot_frame,
.go-tvslot_thumb {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  object-fit: cover;
}
.go-tvslot--staged {
  inset: 0;
  z-index: -1;
  opacity: 0;
  pointer-events: none;
}
.go-tvslot--full {
  inset: 0;
  z-index: 40;
}
.go-tvslot--tile {
  z-index: 46;
  border-radius: 6px;
  pointer-events: none;
}
.go-tvslot--mini {
  right: 16px;
  bottom: 16px;
  width: 320px;
  height: 180px;
  z-index: 60;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgb(0 0 0 / 0.6);
}
@media (pointer: coarse) {
  .go-tvslot--mini {
    width: 45vw;
    height: calc(45vw * 9 / 16);
    right: 12px;
    bottom: 12px;
  }
}
.go-tvslot_reconnecting,
.go-tvslot_card {
  position: absolute;
  inset: auto 0 0 0;
  padding: 12px 16px;
  background: rgb(0 0 0 / 0.75);
  color: #fff;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.go-tvslot_card {
  inset: 0;
  justify-content: center;
  align-items: center;
  text-align: center;
}
```

- [ ] **Step 5: Run tests**

Run: `npm test -w @go10/web -- src/tv/TvSlot.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/tv/TvSlot.tsx apps/web/src/tv/TvSlot.test.tsx apps/web/src/tv/tv.css
git commit -m "feat(web): TvSlot, a live channel embed with the player's retry policy

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Web — `TvProvider`, `TvLayer` and the mini-player

**Files:**
- Create: `apps/web/src/tv/canPreview.ts`, `apps/web/src/tv/TvProvider.tsx`, `apps/web/src/tv/TvLayer.tsx`, `apps/web/src/tv/TvProvider.test.tsx`
- Modify: `apps/web/src/tv/tv.css` (mini chrome)

**Interfaces:**
- Consumes: `TvSlot`, `SlotMode`, `Rect`, `SlotHandle` (Task 8); `pickChannel`, `writeLastChannel` (Task 5); `okru.playMessage` (core).
- Produces:

```ts
// canPreview.ts
export function canPreview(): boolean   // fine pointer and not a TV
// TvProvider.tsx
export interface SlotState { id: number; channelId: string; role: 'main' | 'preview' }
export interface TvApi {
  lineup: Lineup | null
  mainChannel: string | null
  /** True once the viewer has opened the TV screen since the layer was last closed. */
  activated: boolean
  /** True when the last watch() promoted a preview (the zap was instant). */
  promoted: boolean
  preload(channelId?: string): void
  watch(channelId: string): void
  previewAt(channelId: string, rect: Rect): void
  endPreview(): void
  setScreen(screen: 'tv' | 'away'): void
  close(): void
  /** Internal to TvLayer: slots, modes and handle binding. */
  slots: SlotState[]
  modeOf(slot: SlotState): SlotMode
  previewRect: Rect | null
  bindHandle(slotId: number, handle: SlotHandle | null): void
  onSlotLoaded(slotId: number): void
}
export function TvProvider(props: { lineup: Lineup | null; children: ReactNode }): JSX.Element
export function useTv(): TvApi
// TvLayer.tsx
export function TvLayer(props: { onOpen: (channelId: string) => void }): JSX.Element | null
```

Ordering rule (important): `slots` only ever **appends** new slots and **removes** old ones; it is never reordered. React moves keyed DOM nodes when an array is reordered, and moving an iframe reloads it. Promotion changes `role` in place.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/tv/TvProvider.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { TvProvider, useTv, type TvApi } from './TvProvider'
import { TvLayer } from './TvLayer'
import { buildChannelPlan } from '@go10/core/tv/plan'
import { collectionOf, movieTitle } from '@go10/core/tv/testing'
import type { Channel, Lineup } from '@go10/core/tv/types'
import { writeLastChannel } from '@go10/core/tv/lineup'

const EPOCH = Date.UTC(2026, 9, 1)
const titles = [movieTitle('m1', 3000), movieTitle('m2', 3000), movieTitle('m3', 3000)]
const channelOf = (id: string, number: number, key: string): Channel => {
  const collection = collectionOf(id, [key])
  return { id, number, name: id.toUpperCase(), collection, plan: buildChannelPlan({ id, number, collection: id }, collection, titles) }
}
const lineup: Lineup = { epochMs: EPOCH, defaultChannel: 'b', channels: [channelOf('a', 1, 'm1'), channelOf('b', 2, 'm2'), channelOf('c', 3, 'm3')] }

let api: TvApi
function Grab() {
  api = useTv()
  return null
}
const onOpen = vi.fn()
function renderLayer() {
  render(
    <TvProvider lineup={lineup}>
      <Grab />
      <TvLayer onOpen={onOpen} />
    </TvProvider>,
  )
}
const slots = () => [...document.querySelectorAll<HTMLElement>('.go-tvslot')].map((el) => [el.dataset.channel, el.className.replace('go-tvslot go-tvslot--', '')])

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(EPOCH + 1000)
  localStorage.clear()
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('fine'), addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  onOpen.mockReset()
})

describe('TvProvider + TvLayer', () => {
  it('preloads the default channel staged, then shows it full when watched', () => {
    renderLayer()
    act(() => api.preload())
    expect(slots()).toEqual([['b', 'staged']])
    const frame = document.querySelector('.go-tvslot_frame')
    act(() => api.setScreen('tv'))
    act(() => api.watch('b'))
    expect(slots()).toEqual([['b', 'full']])
    expect(document.querySelector('.go-tvslot_frame')).toBe(frame) // same iframe: no reload
  })

  it('preloads the last channel watched when there is one', () => {
    writeLastChannel('c')
    renderLayer()
    act(() => api.preload())
    expect(slots()).toEqual([['c', 'staged']])
  })

  it('does not replace a channel that is already loaded', () => {
    renderLayer()
    act(() => {
      api.setScreen('tv')
      api.watch('a')
    })
    act(() => api.preload('c'))
    expect(slots()).toEqual([['a', 'full']])
  })

  it('keeps one main slot through rapid zapping', () => {
    renderLayer()
    act(() => api.setScreen('tv'))
    for (const id of ['a', 'b', 'c', 'a', 'b']) act(() => api.watch(id))
    expect(slots()).toEqual([['b', 'full']])
    expect(document.querySelectorAll('iframe')).toHaveLength(1)
  })

  it('promotes the preview to main on watch, reusing its iframe', () => {
    renderLayer()
    act(() => {
      api.setScreen('tv')
      api.watch('a')
    })
    act(() => api.previewAt('c', { top: 0, left: 0, width: 300, height: 169 }))
    expect(slots()).toEqual([['a', 'full'], ['c', 'tile']])
    const previewFrame = document.querySelector('[data-channel="c"] iframe')
    act(() => api.watch('c'))
    expect(slots()).toEqual([['c', 'full']])
    expect(document.querySelector('[data-channel="c"] iframe')).toBe(previewFrame)
    expect(api.promoted).toBe(true)
  })

  it('replaces the preview when another tile is hovered, and drops it on endPreview', () => {
    renderLayer()
    act(() => {
      api.setScreen('tv')
      api.watch('a')
    })
    act(() => api.previewAt('b', { top: 0, left: 0, width: 1, height: 1 }))
    act(() => api.previewAt('c', { top: 0, left: 0, width: 1, height: 1 }))
    expect(slots()).toEqual([['a', 'full'], ['c', 'tile']])
    act(() => api.endPreview())
    expect(slots()).toEqual([['a', 'full']])
  })

  it('never previews the channel already on main, or on a touch screen', () => {
    renderLayer()
    act(() => {
      api.setScreen('tv')
      api.watch('a')
    })
    act(() => api.previewAt('a', { top: 0, left: 0, width: 1, height: 1 }))
    expect(slots()).toEqual([['a', 'full']])
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('coarse'), addEventListener() {}, removeEventListener() {} }))
    act(() => api.previewAt('b', { top: 0, left: 0, width: 1, height: 1 }))
    expect(slots()).toEqual([['a', 'full']])
  })

  it('shrinks to a mini-player away from the TV screen, which reopens it or closes', () => {
    renderLayer()
    act(() => {
      api.setScreen('tv')
      api.watch('a')
    })
    act(() => api.setScreen('away'))
    expect(slots()).toEqual([['a', 'mini']])
    fireEvent.click(screen.getByRole('button', { name: 'Volver a A en TV' }))
    expect(onOpen).toHaveBeenCalledWith('a')
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar TV' }))
    expect(slots()).toEqual([])
  })

  it('keeps a merely preloaded channel hidden away from the TV screen', () => {
    renderLayer()
    act(() => api.preload())
    act(() => api.setScreen('away'))
    expect(slots()).toEqual([['b', 'staged']])
    expect(screen.queryByRole('button', { name: /Volver a/ })).toBeNull()
  })

  it('remembers the channel watched', () => {
    renderLayer()
    act(() => api.watch('c'))
    expect(localStorage.getItem('go10:tvLastChannel')).toBe('c')
  })

  it('tells a loaded main embed to play once the viewer has opened TV', () => {
    renderLayer()
    act(() => api.preload('a'))
    const frame = document.querySelector('iframe') as HTMLIFrameElement
    const post = vi.spyOn(frame.contentWindow!, 'postMessage')
    fireEvent.load(frame)
    expect(post).not.toHaveBeenCalled() // staged, not activated: hands off
    act(() => {
      api.setScreen('tv')
      api.watch('a')
    })
    expect(post).toHaveBeenCalledWith({ action: 'play' }, 'https://ok.ru')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -w @go10/web -- src/tv/TvProvider.test.tsx`
Expected: FAIL — cannot resolve `./TvProvider`.

- [ ] **Step 3: Implement `canPreview.ts`**

```ts
import { isTvDevice } from '../focus/inputMode'

/** Hover previews are desktop-only: phones would pay in data, TVs in frames. */
export function canPreview(): boolean {
  return !isTvDevice() && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches
}
```

- [ ] **Step 4: Implement `TvProvider.tsx`**

```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Lineup } from '@go10/core/tv/types'
import { pickChannel, writeLastChannel } from '@go10/core/tv/lineup'
import { okru } from '@go10/core/player/providers/okru'
import type { Rect, SlotHandle, SlotMode } from './TvSlot'
import { canPreview } from './canPreview'

export interface SlotState {
  id: number
  channelId: string
  role: 'main' | 'preview'
}

export interface TvApi {
  lineup: Lineup | null
  mainChannel: string | null
  activated: boolean
  promoted: boolean
  preload(channelId?: string): void
  watch(channelId: string): void
  previewAt(channelId: string, rect: Rect): void
  endPreview(): void
  setScreen(screen: 'tv' | 'away'): void
  close(): void
  slots: SlotState[]
  modeOf(slot: SlotState): SlotMode
  previewRect: Rect | null
  bindHandle(slotId: number, handle: SlotHandle | null): void
  onSlotLoaded(slotId: number): void
}

const TvContext = createContext<TvApi | null>(null)

export function useTv(): TvApi {
  const api = useContext(TvContext)
  if (!api) throw new Error('useTv() outside <TvProvider>')
  return api
}

/**
 * Owns the live TV slots for the whole app, above the routed screens, so a
 * channel survives navigation. Slots are only appended or removed, never
 * reordered: React moves reordered keyed nodes, and a moved iframe reloads.
 */
export function TvProvider({ lineup, children }: { lineup: Lineup | null; children: ReactNode }) {
  const [slots, setSlotsState] = useState<SlotState[]>([])
  // The source of truth for the actions below, read synchronously, so no
  // state updater has side effects (StrictMode runs updaters twice).
  const slotsRef = useRef<SlotState[]>([])
  const [screen, setScreenState] = useState<'tv' | 'away'>('away')
  const [activated, setActivated] = useState(false)
  const [promoted, setPromoted] = useState(false)
  const [previewRect, setPreviewRect] = useState<Rect | null>(null)
  const nextId = useRef(1)
  const handles = useRef(new Map<number, SlotHandle>())

  const commit = useCallback((next: SlotState[]) => {
    if (next === slotsRef.current) return
    slotsRef.current = next
    setSlotsState(next)
  }, [])
  const newSlot = useCallback((channelId: string, role: SlotState['role']): SlotState => ({ id: nextId.current++, channelId, role }), [])
  const without = (role: SlotState['role']) => slotsRef.current.filter((s) => s.role !== role)

  const main = slots.find((s) => s.role === 'main') ?? null

  const preload = useCallback(
    (channelId?: string) => {
      if (!lineup || slotsRef.current.some((s) => s.role === 'main')) return
      const channel = pickChannel(lineup, channelId ?? null)
      if (channel) commit([...slotsRef.current, newSlot(channel.id, 'main')])
    },
    [lineup, commit, newSlot],
  )

  const watch = useCallback(
    (channelId: string) => {
      writeLastChannel(channelId)
      setActivated(true)
      const current = slotsRef.current
      if (current.find((s) => s.role === 'main')?.channelId === channelId) {
        setPromoted(false)
        return
      }
      const preview = current.find((s) => s.role === 'preview' && s.channelId === channelId)
      setPromoted(Boolean(preview))
      commit(
        preview
          ? without('main').map((s) => (s === preview ? { ...s, role: 'main' as const } : s))
          : [...without('main'), newSlot(channelId, 'main')],
      )
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commit, newSlot],
  )

  const previewAt = useCallback(
    (channelId: string, rect: Rect) => {
      if (!canPreview()) return
      const current = slotsRef.current
      if (current.some((s) => s.role === 'main' && s.channelId === channelId)) return commit(without('preview'))
      setPreviewRect(rect)
      if (current.some((s) => s.role === 'preview' && s.channelId === channelId)) return
      commit([...without('preview'), newSlot(channelId, 'preview')])
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commit, newSlot],
  )

  const endPreview = useCallback(() => {
    if (slotsRef.current.some((s) => s.role === 'preview')) commit(without('preview'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commit])

  const close = useCallback(() => {
    commit([])
    setActivated(false)
  }, [commit])

  const setScreen = useCallback(
    (next: 'tv' | 'away') => {
      setScreenState(next)
      if (next === 'away') endPreview()
    },
    [endPreview],
  )

  const modeOf = useCallback(
    (slot: SlotState): SlotMode => {
      if (slot.role === 'preview') return 'tile'
      if (screen === 'tv') return 'full'
      return activated ? 'mini' : 'staged'
    },
    [screen, activated],
  )

  // The click into TV is a user activation: tell a loaded main embed to play,
  // in case it was staged before any click and the browser held it back.
  const mainId = main?.id ?? null
  const playMain = useCallback(() => {
    if (mainId === null) return
    const handle = handles.current.get(mainId)
    if (handle?.isLoaded()) handle.post(okru.playMessage)
  }, [mainId])
  useEffect(() => {
    if (activated) playMain()
  }, [activated, playMain])

  const bindHandle = useCallback((slotId: number, handle: SlotHandle | null) => {
    if (handle) handles.current.set(slotId, handle)
    else handles.current.delete(slotId)
  }, [])

  const onSlotLoaded = useCallback(
    (slotId: number) => {
      if (activated && slotId === mainId) playMain()
    },
    [activated, mainId, playMain],
  )

  const api = useMemo<TvApi>(
    () => ({
      lineup, mainChannel: main?.channelId ?? null, activated, promoted,
      preload, watch, previewAt, endPreview, setScreen, close,
      slots, modeOf, previewRect, bindHandle, onSlotLoaded,
    }),
    [lineup, main, activated, promoted, preload, watch, previewAt, endPreview, setScreen, close, slots, modeOf, previewRect, bindHandle, onSlotLoaded],
  )

  return <TvContext.Provider value={api}>{children}</TvContext.Provider>
}
```

- [ ] **Step 5: Implement `TvLayer.tsx`**

```tsx
import { useCallback } from 'react'
import { useTv } from './TvProvider'
import { TvSlot, type SlotHandle } from './TvSlot'

/** Every live slot, plus the mini-player's controls. Mounted once at the App root. */
export function TvLayer({ onOpen }: { onOpen: (channelId: string) => void }) {
  const tv = useTv()
  const { lineup } = tv
  if (!lineup) return null
  const main = tv.slots.find((s) => s.role === 'main')
  const mini = main && tv.modeOf(main) === 'mini' ? lineup.channels.find((c) => c.id === main.channelId) : undefined

  return (
    <div className="go-tvlayer">
      {tv.slots.map((slot) => {
        const channel = lineup.channels.find((c) => c.id === slot.channelId)
        if (!channel) return null
        const mode = tv.modeOf(slot)
        return (
          <BoundSlot
            key={slot.id}
            slotId={slot.id}
            channel={channel}
            epochMs={lineup.epochMs}
            mode={mode}
            rect={mode === 'tile' ? tv.previewRect : null}
            preview={slot.role === 'preview'}
          />
        )
      })}
      {mini && (
        <div className="go-tvmini">
          <button type="button" className="go-tvmini_open" aria-label={`Volver a ${mini.name} en TV`} onClick={() => onOpen(mini.id)} />
          <span className="go-tvmini_name">
            <span className="go-tvmini_live" aria-hidden="true" />
            {mini.number} · {mini.name}
          </span>
          <button type="button" className="go-tvmini_close" aria-label="Cerrar TV" onClick={tv.close}>
            ✕
          </button>
        </div>
      )}
    </div>
  )
}

function BoundSlot({ slotId, ...props }: { slotId: number } & Omit<Parameters<typeof TvSlot>[0], 'bind' | 'onLoaded'>) {
  const tv = useTv()
  const { bindHandle, onSlotLoaded } = tv
  const bind = useCallback((handle: SlotHandle | null) => bindHandle(slotId, handle), [bindHandle, slotId])
  const onLoaded = useCallback(() => onSlotLoaded(slotId), [onSlotLoaded, slotId])
  return <TvSlot {...props} bind={bind} onLoaded={onLoaded} />
}
```

- [ ] **Step 6: Add the mini chrome to `tv.css`**

```css
/* The mini-player's controls sit exactly over the mini slot. */
.go-tvmini {
  position: fixed;
  right: 16px;
  bottom: 16px;
  width: 320px;
  height: 180px;
  z-index: 61;
  border-radius: 8px;
}
@media (pointer: coarse) {
  .go-tvmini {
    width: 45vw;
    height: calc(45vw * 9 / 16);
    right: 12px;
    bottom: 12px;
  }
}
.go-tvmini_open {
  position: absolute;
  inset: 0;
  cursor: pointer;
}
.go-tvmini_name {
  position: absolute;
  left: 8px;
  bottom: 8px;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgb(0 0 0 / 0.7);
  color: #fff;
  font-size: 0.8125rem;
  pointer-events: none;
  display: flex;
  align-items: center;
  gap: 6px;
}
.go-tvmini_live {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #e5262a;
}
.go-tvmini_close {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgb(0 0 0 / 0.7);
  color: #fff;
  cursor: pointer;
}
```

- [ ] **Step 7: Run tests**

Run: `npm test -w @go10/web -- src/tv`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/tv
git commit -m "feat(web): persistent TV layer with staged, full, tile and mini slots

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Web — live tiles (`useLiveNow`, `ChannelTile`)

**Files:**
- Create: `apps/web/src/tv/useLiveNow.ts`, `apps/web/src/tv/ChannelTile.tsx`, `apps/web/src/tv/ChannelTile.test.tsx`
- Modify: `apps/web/src/tv/tv.css` (tile styles)

**Interfaces:**
- Consumes: `scheduleAt` (Task 3); `programLabel`, `progressOf` (Task 5); `useFocusable(id, row, col, onEnter, { onKey })` from `../focus/useFocusable`; `useTv` (Task 9); `canPreview` (Task 9); `imageSrc`.
- Produces:

```ts
export const LIVE_REFRESH_MS = 5000
export function useLiveNow(lineup: Lineup | null): Map<string, Schedule>
export const PREVIEW_DELAY_MS = 600
export function ChannelTile(props: {
  channel: Channel; schedule: Schedule; row: number; col: number
  current?: boolean
  /** Prefix for the focus id, unique per screen ("tv", "live"). */
  scope: string
  onSelect: (channel: Channel) => void
  /** Extra remote keys while the tile is focused; return true when handled. */
  onKey?: (key: string) => boolean
}): JSX.Element
```

Tile behaviour: `aria-label` is `"<number> <name>: <program label>"`; hovering (pointer) or holding focus (keys) for `PREVIEW_DELAY_MS` calls `tv.previewAt(channel.id, rect of .go-chtile_thumb)` (a no-op off desktop); leaving / blurring calls `tv.endPreview()`. `pointerenter` also calls `tv.preload(channel.id)` (intent preload; a no-op when main is loaded).

- [ ] **Step 1: Write the failing tests**

`apps/web/src/tv/ChannelTile.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { FocusProvider } from '../focus/FocusProvider'
import { ChannelTile } from './ChannelTile'
import { useLiveNow } from './useLiveNow'
import { TvProvider, useTv, type TvApi } from './TvProvider'
import { buildChannelPlan } from '@go10/core/tv/plan'
import { scheduleAt } from '@go10/core/tv/schedule'
import { collectionOf, showTitle } from '@go10/core/tv/testing'
import type { Channel, Lineup } from '@go10/core/tv/types'

const EPOCH = Date.UTC(2026, 9, 1)
const collection = collectionOf('cn', ['coraje'])
const channel: Channel = {
  id: 'cn', number: 1, name: 'Cartoon Network', collection,
  plan: buildChannelPlan({ id: 'cn', number: 1, collection: 'cn' }, collection, [showTitle('coraje', 4, 600)]),
}
const otherCollection = collectionOf('jx', ['mulan'])
const other: Channel = {
  id: 'jx', number: 2, name: 'Jetix', collection: otherCollection,
  plan: buildChannelPlan({ id: 'jx', number: 2, collection: 'jx' }, otherCollection, [movieTitle('mulan', 5280)]),
}
const lineup: Lineup = { epochMs: EPOCH, defaultChannel: 'cn', channels: [channel, other] }

let api: TvApi
function Grab() {
  api = useTv()
  return null
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(EPOCH + 150_000)
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('fine'), addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function renderTile(onSelect = vi.fn()) {
  render(
    <TvProvider lineup={lineup}>
      <Grab />
      <FocusProvider onBack={() => {}}>
        <ChannelTile channel={channel} schedule={scheduleAt(channel.plan, EPOCH, Date.now())} row={0} col={0} scope="tv" onSelect={onSelect} />
      </FocusProvider>
    </TvProvider>,
  )
  return onSelect
}

describe('ChannelTile', () => {
  it("shows the channel and what's on, with its progress", () => {
    renderTile()
    const tile = screen.getByRole('button', { name: '1 Cartoon Network: coraje · T1 · E1' })
    expect(tile.querySelector('.go-chtile_progress i')!.getAttribute('style')).toContain('width: 25%')
  })

  it('selects on Enter and click', () => {
    const onSelect = renderTile()
    fireEvent.keyDown(window, { key: 'Enter' })
    fireEvent.click(screen.getByRole('button'))
    expect(onSelect).toHaveBeenCalledTimes(2)
  })

  it('preloads its channel on pointer enter when nothing is loaded yet', () => {
    renderTile()
    fireEvent.pointerEnter(screen.getByRole('button'))
    expect(api.slots.map((s) => [s.channelId, s.role])).toEqual([['cn', 'main']])
  })

  it('previews another channel after resting 600 ms, and ends it on pointer leave', () => {
    renderTile()
    act(() => api.watch('jx')) // something else is on main
    const tile = screen.getByRole('button')
    fireEvent.pointerEnter(tile)
    act(() => vi.advanceTimersByTime(599))
    expect(api.slots.filter((s) => s.role === 'preview')).toEqual([])
    act(() => vi.advanceTimersByTime(1))
    expect(api.slots.filter((s) => s.role === 'preview').map((s) => s.channelId)).toEqual(['cn'])
    fireEvent.pointerLeave(tile)
    expect(api.slots.filter((s) => s.role === 'preview')).toEqual([])
  })
})

describe('useLiveNow', () => {
  it('refreshes every 5 s and at the next boundary', () => {
    const { result } = renderHook(() => useLiveNow(lineup))
    const first = result.current.get('cn')!
    act(() => vi.advanceTimersByTime(5000))
    expect(result.current.get('cn')!.offset).toBe(first.offset + 5)
    act(() => vi.advanceTimersByTime(first.current.endsAt - Date.now()))
    expect(result.current.get('cn')!.current.unit.key).not.toBe(first.current.unit.key)
  })
})
```

Add `movieTitle` to the `@go10/core/tv/testing` import. Because the lineup now has two channels, the tile's focus id is `tv:cn` and it still claims initial focus (it's the only focusable rendered).

- [ ] **Step 2: Run to verify failure**

Run: `npm test -w @go10/web -- src/tv/ChannelTile.test.tsx`
Expected: FAIL — cannot resolve `./ChannelTile`.

- [ ] **Step 3: Implement `useLiveNow.ts`**

```ts
import { useEffect, useMemo, useReducer } from 'react'
import type { Lineup, Schedule } from '@go10/core/tv/types'
import { scheduleAt } from '@go10/core/tv/schedule'

export const LIVE_REFRESH_MS = 5000

/** What every channel is airing now, refreshed every few seconds and at the next program boundary. */
export function useLiveNow(lineup: Lineup | null): Map<string, Schedule> {
  const [tick, bump] = useReducer((n: number) => n + 1, 0)
  const now = useMemo(() => {
    const at = Date.now()
    return new Map((lineup?.channels ?? []).map((channel) => [channel.id, scheduleAt(channel.plan, lineup!.epochMs, at, 1)]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineup, tick])

  useEffect(() => {
    if (now.size === 0) return
    let boundary = Infinity
    for (const schedule of now.values()) boundary = Math.min(boundary, schedule.current.endsAt)
    const wait = Math.max(0, Math.min(LIVE_REFRESH_MS, boundary - Date.now()))
    const timer = setTimeout(bump, wait)
    return () => clearTimeout(timer)
  }, [now])

  return now
}
```

- [ ] **Step 4: Implement `ChannelTile.tsx`**

```tsx
import { useEffect, useRef } from 'react'
import type { Channel, Schedule } from '@go10/core/tv/types'
import { programLabel, progressOf } from '@go10/core/tv/describe'
import { imageSrc } from '@go10/core/lib/imageSrc'
import { useFocusable } from '../focus/useFocusable'
import { useTv } from './TvProvider'

export const PREVIEW_DELAY_MS = 600

/** A channel and what it's airing right now. */
export function ChannelTile({
  channel,
  schedule,
  row,
  col,
  current = false,
  scope,
  onSelect,
  onKey,
}: {
  channel: Channel
  schedule: Schedule
  row: number
  col: number
  current?: boolean
  scope: string
  onSelect: (channel: Channel) => void
  onKey?: (key: string) => boolean
}) {
  const tv = useTv()
  const { ref, focused, activate, tabIndex } = useFocusable(`${scope}:${channel.id}`, row, col, () => onSelect(channel), { onKey })
  const thumbRef = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const label = programLabel(schedule.current.unit)

  const startPreview = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const box = thumbRef.current?.getBoundingClientRect()
      if (box) tv.previewAt(channel.id, { top: box.top, left: box.left, width: box.width, height: box.height })
    }, PREVIEW_DELAY_MS)
  }
  const stopPreview = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    tv.endPreview()
  }

  // A remote resting on a tile previews it, like a mouse resting on it.
  useEffect(() => {
    if (!focused) return
    startPreview()
    return stopPreview
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused])

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  return (
    <div
      ref={ref}
      tabIndex={tabIndex}
      role="button"
      aria-label={`${channel.number} ${channel.name}: ${label}`}
      aria-current={current ? 'true' : undefined}
      className={`go-chtile${focused ? ' is-focused' : ''}${current ? ' is-current' : ''}`}
      data-focused={focused}
      onClick={activate}
      onPointerEnter={() => {
        tv.preload(channel.id)
        startPreview()
      }}
      onPointerLeave={stopPreview}
    >
      <div ref={thumbRef} className="go-chtile_thumb" style={{ backgroundColor: channel.collection.tile.color }}>
        <img className="go-chtile_img" src={imageSrc(schedule.current.unit.row.thumbnail)} alt="" loading="lazy" />
        <span className="go-chtile_badge">
          <img src={`/${channel.collection.logo}`} alt="" />
          <span>{channel.number}</span>
        </span>
      </div>
      <div className="go-chtile_progress">
        <i style={{ width: `${Math.round(progressOf(schedule) * 100)}%` }} />
      </div>
      <div className="go-chtile_label">{label}</div>
    </div>
  )
}
```

- [ ] **Step 5: Tile styles in `tv.css`**

```css
.go-chtile {
  flex: 0 0 auto;
  width: 13.5rem;
  border-radius: 6px;
  outline: 2px solid transparent;
  outline-offset: 2px;
  cursor: pointer;
  color: #fff;
  transition: transform 120ms ease;
}
.go-chtile:hover,
.go-chtile.is-focused {
  transform: scale(1.04);
  outline-color: rgb(255 255 255 / 0.6);
}
.go-chtile.is-current {
  outline-color: #fff;
}
.go-chtile_thumb {
  position: relative;
  aspect-ratio: 16 / 9;
  border-radius: 6px;
  overflow: hidden;
}
.go-chtile_img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.go-chtile_badge {
  position: absolute;
  top: 6px;
  left: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgb(0 0 0 / 0.65);
  font-weight: 700;
  font-size: 0.75rem;
}
.go-chtile_badge img {
  height: 1rem;
  width: auto;
}
.go-chtile_progress {
  height: 3px;
  margin-top: 4px;
  background: rgb(255 255 255 / 0.2);
}
.go-chtile_progress i {
  display: block;
  height: 100%;
  background: #e5262a;
}
.go-chtile_label {
  margin-top: 4px;
  font-size: 0.8125rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

- [ ] **Step 6: Run tests**

Run: `npm test -w @go10/web -- src/tv`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/tv
git commit -m "feat(web): live channel tiles with intent preload and hover preview

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Web — the TV screen and App wiring

**Files:**
- Create: `apps/web/src/tv/TvScreen.tsx`, `apps/web/src/tv/TvScreen.test.tsx`
- Modify: `apps/web/src/tv/tv.css` (screen styles)
- Modify: `apps/web/src/App.tsx`, `apps/web/src/App.test.tsx`

**Interfaces:**
- Consumes: `useTv`, `TvProvider`, `TvLayer` (Task 9); `ChannelTile`, `useLiveNow` (Task 10); `stepChannel`, `channelByNumber`, `pickChannel` (Task 5); `programLabel`, `clockLabel`, `progressOf` (Task 5); `useLineup` (Task 7); `FocusProvider`.
- Produces: `TvScreen(props: { channel: Channel; onZap: (channelId: string) => void; onOpenTitle: (titleKey: string) => void; onBack: () => void })`; `STRIP_IDLE_MS = 6000`, `ZAP_FLASH_MS = 400`.

Screen DOM contract: root `.go-tv` (`role="region"`, `aria-label="TV en vivo"`); shield `.go-tv_shield`; now-playing `.go-tv_now` with the "Ver ficha" button; strip `nav.go-tv_strip` (`aria-label="Canales"`) with class `is-open` when expanded; zap flash `.go-tv_flash` showing the channel number.

- [ ] **Step 1: Write the failing screen tests**

`apps/web/src/tv/TvScreen.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { FocusProvider } from '../focus/FocusProvider'
import { TvProvider, useTv, type TvApi } from './TvProvider'
import { TvScreen } from './TvScreen'
import { buildChannelPlan } from '@go10/core/tv/plan'
import { collectionOf, movieTitle, showTitle } from '@go10/core/tv/testing'
import type { Channel, Lineup } from '@go10/core/tv/types'

const EPOCH = Date.UTC(2026, 9, 1)
const titles = [showTitle('coraje', 4, 600), movieTitle('mulan', 5280), movieTitle('shrek', 5400)]
const channelOf = (id: string, number: number, keys: string[]): Channel => {
  const collection = collectionOf(id, keys)
  return { id, number, name: id.toUpperCase(), collection, plan: buildChannelPlan({ id, number, collection: id }, collection, titles) }
}
const lineup: Lineup = {
  epochMs: EPOCH, defaultChannel: 'cn',
  channels: [channelOf('cn', 1, ['coraje']), channelOf('dis', 2, ['mulan']), channelOf('dw', 3, ['shrek'])],
}

let api: TvApi
function Grab() {
  api = useTv()
  return null
}
const onZap = vi.fn()
const onOpenTitle = vi.fn()
const onBack = vi.fn()

function renderScreen(channel = lineup.channels[0]) {
  return render(
    <TvProvider lineup={lineup}>
      <Grab />
      <FocusProvider onBack={onBack}>
        <TvScreen channel={channel} onZap={onZap} onOpenTitle={onOpenTitle} onBack={onBack} />
      </FocusProvider>
    </TvProvider>,
  )
}
const press = (key: string) => fireEvent.keyDown(window, { key })
const strip = () => screen.getByRole('navigation', { name: 'Canales' })

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(EPOCH + 60_000)
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('fine'), addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  for (const fn of [onZap, onOpenTitle, onBack]) fn.mockReset()
})

describe('TvScreen', () => {
  it('watches its channel on the TV screen', () => {
    renderScreen()
    expect(api.mainChannel).toBe('cn')
    expect(api.modeOf(api.slots[0])).toBe('full')
  })

  it("shows what's on now and next", () => {
    renderScreen()
    const now = screen.getByRole('region', { name: 'TV en vivo' }).querySelector('.go-tv_now')!
    expect(now.textContent).toContain('coraje · T1 · E1')
    expect(now.textContent).toMatch(/A continuación: .+ · \d\d:\d\d/)
  })

  it('opens the program\'s title from "Ver ficha"', () => {
    renderScreen()
    fireEvent.click(screen.getByRole('button', { name: 'Ver ficha' }))
    expect(onOpenTitle).toHaveBeenCalledWith('coraje')
  })

  it('lists every channel in the strip, current one marked', () => {
    renderScreen()
    const tiles = strip().querySelectorAll('[role="button"]')
    expect(tiles).toHaveLength(3)
    expect(tiles[0].getAttribute('aria-current')).toBe('true')
  })

  it('opens the strip on arrival and collapses it after 6 s without input, never removing it', () => {
    renderScreen()
    expect(strip().classList.contains('is-open')).toBe(true)
    act(() => vi.advanceTimersByTime(6000))
    expect(strip().classList.contains('is-open')).toBe(false)
    fireEvent.pointerMove(screen.getByRole('region', { name: 'TV en vivo' }))
    expect(strip().classList.contains('is-open')).toBe(true)
  })

  it('zaps with Up/Down and PageUp/PageDown, wrapping', () => {
    renderScreen()
    press('ArrowDown')
    press('PageDown')
    press('ArrowUp')
    press('PageUp')
    expect(onZap.mock.calls.map((c) => c[0])).toEqual(['dis', 'dis', 'dw', 'dw'])
  })

  it('jumps by channel number', () => {
    renderScreen()
    press('3')
    press('9')
    expect(onZap.mock.calls).toEqual([['dw']])
  })

  it('tunes a tile on Enter after moving along the strip', () => {
    renderScreen()
    press('ArrowRight')
    press('Enter')
    expect(onZap).toHaveBeenCalledWith('dis')
  })

  it('goes back on Escape', () => {
    renderScreen()
    press('Escape')
    expect(onBack).toHaveBeenCalled()
  })

  it('flashes the channel number on a zap', () => {
    const { rerender } = renderScreen()
    rerender(
      <TvProvider lineup={lineup}>
        <Grab />
        <FocusProvider onBack={onBack}>
          <TvScreen channel={lineup.channels[1]} onZap={onZap} onOpenTitle={onOpenTitle} onBack={onBack} />
        </FocusProvider>
      </TvProvider>,
    )
    expect(document.querySelector('.go-tv_flash')!.textContent).toBe('2')
    act(() => vi.advanceTimersByTime(400))
    expect(document.querySelector('.go-tv_flash')).toBeNull()
  })

  it('zaps on a vertical swipe of the shield and toggles the strip on a tap', () => {
    renderScreen()
    const shield = document.querySelector('.go-tv_shield')!
    act(() => vi.advanceTimersByTime(6000))
    fireEvent.pointerDown(shield, { clientX: 100, clientY: 400 })
    fireEvent.pointerUp(shield, { clientX: 100, clientY: 405 })
    expect(strip().classList.contains('is-open')).toBe(true)
    fireEvent.pointerDown(shield, { clientX: 100, clientY: 400 })
    fireEvent.pointerUp(shield, { clientX: 100, clientY: 250 })
    expect(onZap).toHaveBeenCalledWith('dis')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -w @go10/web -- src/tv/TvScreen.test.tsx`
Expected: FAIL — cannot resolve `./TvScreen`.

- [ ] **Step 3: Implement `TvScreen.tsx`**

```tsx
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { Channel } from '@go10/core/tv/types'
import { channelByNumber, stepChannel } from '@go10/core/tv/lineup'
import { clockLabel, programLabel, progressOf } from '@go10/core/tv/describe'
import { useTv } from './TvProvider'
import { useLiveNow } from './useLiveNow'
import { ChannelTile } from './ChannelTile'
import './tv.css'

export const STRIP_IDLE_MS = 6000
export const ZAP_FLASH_MS = 400
/** A shield gesture moving less than this is a tap; more, vertically, is a zap. */
const SWIPE_PX = 60

/** `/tv/:channel`: the video (in the TV layer, beneath), the now-playing bar and the channel strip. */
export function TvScreen({
  channel,
  onZap,
  onOpenTitle,
  onBack,
}: {
  channel: Channel
  onZap: (channelId: string) => void
  onOpenTitle: (titleKey: string) => void
  onBack: () => void
}) {
  const tv = useTv()
  const lineup = tv.lineup!
  const live = useLiveNow(lineup)
  const [stripOpen, setStripOpen] = useState(true)
  const [activity, bump] = useReducer((n: number) => n + 1, 0)
  const [flash, setFlash] = useState<number | null>(null)
  const firstChannel = useRef(true)
  const press = useRef<{ x: number; y: number } | null>(null)

  const { watch, setScreen } = tv
  useEffect(() => {
    setScreen('tv')
    return () => setScreen('away')
  }, [setScreen])

  // Every arrival and every zap: tune in, open the strip, flash the number.
  useEffect(() => {
    watch(channel.id)
    setStripOpen(true)
    bump()
    if (firstChannel.current) {
      firstChannel.current = false
      return
    }
    setFlash(channel.number)
    const timer = setTimeout(() => setFlash(null), ZAP_FLASH_MS)
    return () => clearTimeout(timer)
  }, [channel.id, channel.number, watch])

  useEffect(() => {
    if (!stripOpen) return
    const timer = setTimeout(() => setStripOpen(false), STRIP_IDLE_MS)
    return () => clearTimeout(timer)
  }, [stripOpen, activity])

  const wake = useCallback(() => {
    setStripOpen(true)
    bump()
  }, [])

  // Any key wakes the strip; the focus grid still handles the key itself.
  useEffect(() => {
    window.addEventListener('keydown', wake, true)
    return () => window.removeEventListener('keydown', wake, true)
  }, [wake])

  const zap = useCallback((step: 1 | -1) => onZap(stepChannel(lineup, channel.id, step).id), [lineup, channel.id, onZap])

  const onKey = useCallback(
    (key: string): boolean => {
      if (key === 'ArrowUp' || key === 'PageUp') {
        zap(-1)
        return true
      }
      if (key === 'ArrowDown' || key === 'PageDown') {
        zap(1)
        return true
      }
      if (/^[1-9]$/.test(key)) {
        const target = channelByNumber(lineup, Number(key))
        if (target) onZap(target.id)
        return true
      }
      if (key === 'f' || key === 'F') {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
        else document.documentElement.requestFullscreen?.().catch(() => {})
        return true
      }
      return false
    },
    [zap, lineup, onZap],
  )

  const schedule = live.get(channel.id)
  const upNext = schedule?.next[0]

  return (
    <div className="go-tv" role="region" aria-label="TV en vivo" onPointerMove={wake}>
      <div
        className="go-tv_shield"
        onPointerDown={(event) => (press.current = { x: event.clientX, y: event.clientY })}
        onPointerUp={(event) => {
          const start = press.current
          press.current = null
          if (!start) return
          const dy = event.clientY - start.y
          if (Math.abs(dy) >= SWIPE_PX && Math.abs(dy) > Math.abs(event.clientX - start.x)) zap(dy < 0 ? 1 : -1)
          else if (stripOpen) setStripOpen(false)
          else wake()
        }}
      />

      {schedule && (
        <div className={`go-tv_now${stripOpen ? ' is-open' : ''}`}>
          <span className="go-tv_chip">
            <img src={`/${channel.collection.logo}`} alt="" />
            {channel.number}
          </span>
          <div className="go-tv_now-text">
            <strong className="go-tv_program">{programLabel(schedule.current.unit)}</strong>
            {upNext && (
              <span className="go-tv_next">
                A continuación: {programLabel(upNext.unit)} · {clockLabel(upNext.startsAt)}
              </span>
            )}
            <span className="go-tv_progress">
              <i style={{ width: `${Math.round(progressOf(schedule) * 100)}%` }} />
            </span>
          </div>
          <button type="button" className="go-tv_info" onClick={() => onOpenTitle(schedule.current.titleKey)}>
            Ver ficha
          </button>
          <button type="button" className="go-tv_back" aria-label="Volver" onClick={onBack}>
            <span className="go-back_chevron" aria-hidden="true" />
          </button>
        </div>
      )}

      <nav className={`go-tv_strip${stripOpen ? ' is-open' : ''}`} aria-label="Canales" onPointerDown={wake}>
        <div className="go-tv_track">
          {lineup.channels.map((c, col) => {
            const s = live.get(c.id)
            return s ? (
              <ChannelTile
                key={c.id}
                channel={c}
                schedule={s}
                row={0}
                col={col}
                current={c.id === channel.id}
                scope="tv"
                onSelect={(picked) => onZap(picked.id)}
                onKey={onKey}
              />
            ) : null
          })}
        </div>
      </nav>

      {flash !== null && (
        <div className={`go-tv_flash${tv.promoted ? '' : ' has-static'}`} aria-hidden="true">
          {flash}
        </div>
      )}
    </div>
  )
}
```

Note: the focus grid's initial focus lands on the first tile; to start on the current channel, call `focus(\`tv:${channel.id}\`)` from `useFocusState()` (exported by `../focus/FocusProvider`, as used in `Navbar.tsx`) inside the channel effect:

```tsx
  const { focus } = useFocusState()
  // inside the [channel.id] effect, before the firstChannel check:
  focus(`tv:${channel.id}`)
```

Add `import { useFocusState } from '../focus/FocusProvider'` and include `focus` in that effect's dependencies.

- [ ] **Step 4: Screen styles in `tv.css`**

```css
/* The screen sits above the full-mode slot (z-index 40) and below previews (46). */
.go-tv {
  position: fixed;
  inset: 0;
  z-index: 45;
  color: #fff;
  pointer-events: none;
}
.go-tv_shield {
  position: absolute;
  inset: 0;
  pointer-events: auto;
  touch-action: none;
}
.go-tv_now {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 24px 40px;
  background: linear-gradient(rgb(0 0 0 / 0.75), transparent);
  pointer-events: auto;
  opacity: 0;
  transition: opacity 200ms ease;
}
.go-tv_now.is-open {
  opacity: 1;
}
.go-tv_chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  border-radius: 6px;
  background: var(--go-accent, #e4007c);
  font-weight: 800;
  font-size: 1.25rem;
}
.go-tv_chip img {
  height: 1.5rem;
  width: auto;
}
.go-tv_now-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}
.go-tv_program {
  font-size: 1.25rem;
}
.go-tv_next {
  color: rgb(255 255 255 / 0.75);
}
.go-tv_progress {
  display: block;
  height: 3px;
  max-width: 22rem;
  background: rgb(255 255 255 / 0.25);
}
.go-tv_progress i {
  display: block;
  height: 100%;
  background: #fff;
}
.go-tv_info,
.go-tv_back {
  padding: 8px 14px;
  border-radius: 6px;
  background: rgb(255 255 255 / 0.15);
  cursor: pointer;
}
.go-tv_strip {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 48px 24px 20px;
  background: linear-gradient(transparent, rgb(0 0 0 / 0.85) 45%);
  pointer-events: auto;
  transform: translateY(calc(100% - 3.25rem));
  transition: transform 220ms ease;
}
.go-tv_strip.is-open {
  transform: none;
}
.go-tv_track {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding: 6px 4px;
  scrollbar-width: none;
}
/* Collapsed: only the badges' row peeks out, so channels are never out of sight. */
.go-tv_strip:not(.is-open) .go-chtile_label,
.go-tv_strip:not(.is-open) .go-chtile_progress {
  visibility: hidden;
}
.go-tv_flash {
  position: absolute;
  top: 24px;
  right: 32px;
  font-size: 4rem;
  font-weight: 800;
  text-shadow: 0 2px 12px rgb(0 0 0 / 0.8);
}
.go-tv_flash.has-static::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -1;
  background: repeating-radial-gradient(circle at 17% 32%, #fff 0 1px, #000 1px 3px);
  opacity: 0.35;
  animation: go-tv-static 120ms steps(2) infinite;
}
@keyframes go-tv-static {
  to {
    background-position: 7px 3px;
  }
}
@media (pointer: coarse) {
  .go-chtile {
    width: 10rem;
  }
  .go-tv_now {
    padding: 12px 12px 28px;
    gap: 10px;
  }
  .go-tv_program {
    font-size: 1rem;
  }
}
```

Run: `npm test -w @go10/web -- src/tv/TvScreen.test.tsx` → PASS.

- [ ] **Step 5: Write the failing App tests**

The suite runs against the real `data/channels.json` and collections. Its `CN_CSV` fixture has Chowder, which is in the `cartoon-network` collection, so the real lineup resolves to the single airable channel `cartoon-network` (the default); the other channels are skipped with warnings, silenced here. Append to `apps/web/src/App.test.tsx`, after the `App collections` block (it reuses `CN_CSV`):

```tsx
describe('App live TV', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', siteFetch(CN_CSV))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('opens /tv on the default channel, full screen', async () => {
    window.history.replaceState({}, '', '/tv')
    render(<App />)
    await screen.findByRole('region', { name: 'TV en vivo' })
    expect(window.location.pathname).toBe('/tv/cartoon-network')
    expect(document.querySelector('.go-tvslot--full[data-channel="cartoon-network"]')).not.toBeNull()
  })

  it('sends an unknown channel on to a real one', async () => {
    window.history.replaceState({}, '', '/tv/does-not-exist')
    render(<App />)
    await screen.findByRole('region', { name: 'TV en vivo' })
    expect(window.location.pathname).toBe('/tv/cartoon-network')
  })

  it('keeps the channel in a mini-player after leaving, and closes it for on-demand playback', async () => {
    window.history.replaceState({}, '', '/tv/cartoon-network')
    render(<App />)
    await screen.findByRole('region', { name: 'TV en vivo' })

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(window.location.pathname).toBe('/'))
    expect(document.querySelectorAll('.go-tvslot--mini')).toHaveLength(1)

    fireEvent.click(screen.getAllByText('Reproducir')[0])
    await waitFor(() => expect(window.location.pathname).toMatch(/\/play\//))
    expect(document.querySelectorAll('.go-tvslot')).toHaveLength(0)
  })
})
```

Run: `npm test -w @go10/web -- src/App.test.tsx` → FAIL.

- [ ] **Step 6: Wire the App**

In `apps/web/src/App.tsx`:

1. Imports:

```tsx
import type { ReactNode } from 'react'
import { useLineup } from './tv/useLineup'
import { TvProvider, useTv } from './tv/TvProvider'
import { TvLayer } from './tv/TvLayer'
import { TvScreen } from './tv/TvScreen'
import { pickChannel } from '@go10/core/tv/lineup'
```

2. After `const { route, navigate } = useRoute()`, add `const lineup = useLineup(titles)`.

3. In `back()`, add:

```tsx
      case 'tv':
        navigate({ name: 'home' })
        break
```

4. Restructure the post-error part so every screen renders inside one `TvProvider` (the mini-player must survive the TMDB loading/error screens too). Keep the `loading` and `error` early returns as they are. Move everything after them (from `if (tmdbKey && tmdb.status === 'loading')` to the end) into a nested function `function screenFor(): ReactNode { … }` declared inside `App` after the `error` check, with each `return` unchanged, and add the TV branch right after the `not-found` branch:

```tsx
    if (resolved.name === 'tv') {
      const channel = lineup ? pickChannel(lineup, resolved.channel) : null
      if (!channel) {
        // No lineup at all, or an unknown channel: /tv picks one, else Home.
        navigate(lineup && resolved.channel ? { name: 'tv', channel: null } : { name: 'home' }, { replace: true })
        return null
      }
      if (resolved.channel !== channel.id) {
        navigate({ name: 'tv', channel: channel.id }, { replace: true })
        return null
      }
      return (
        <FocusProvider key="tv" onBack={back}>
          <TvScreen
            channel={channel}
            onZap={(id) => navigate({ name: 'tv', channel: id }, { replace: true })}
            onOpenTitle={(key) => navigate({ name: 'title', key })}
            onBack={back}
          />
        </FocusProvider>
      )
    }
```

Then end `App` with:

```tsx
  return (
    <TvProvider lineup={lineup}>
      <TvRouteSync isPlayer={route.name === 'play'} />
      {screenFor()}
      <TvLayer onOpen={(id) => navigate({ name: 'tv', channel: id })} />
    </TvProvider>
  )
```

5. Add, below `ErrorBackButton`:

```tsx
/** Opening on-demand playback ends live TV: two audio streams never play at once. */
function TvRouteSync({ isPlayer }: { isPlayer: boolean }) {
  const { close } = useTv()
  useEffect(() => {
    if (isPlayer) close()
  }, [isPlayer, close])
  return null
}
```

(`TvScreen` itself sets the screen to `'tv'` on mount and `'away'` on unmount, so no other route sync is needed.)

- [ ] **Step 7: Run tests and typecheck**

Run: `npm test -w @go10/web && npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): /tv screen with live channel strip, zapping and mini-player

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Web — entry points: navbar "TV" and Home's "En vivo ahora"

**Files:**
- Create: `apps/web/src/tv/LiveRow.tsx`, `apps/web/src/tv/LiveRow.test.tsx`
- Modify: `apps/web/src/components/Navbar.tsx`, `apps/web/src/components/Navbar.css`, `apps/web/src/components/Navbar.test.tsx`
- Modify: `apps/web/src/screens/Home.tsx`, `apps/web/src/App.tsx`

**Interfaces:**
- Consumes: `ChannelTile`, `useLiveNow`, `useTv` (Tasks 9–10).
- Produces: `LiveRow(props: { rowIndex: number; onWatch: (channelId: string) => void })`; `Navbar` gains optional `onTvIntent?: () => void`; `Home` gains optional `liveRow?: (rowIndex: number) => ReactNode`.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/tv/LiveRow.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { FocusProvider } from '../focus/FocusProvider'
import { TvProvider } from './TvProvider'
import { LiveRow } from './LiveRow'
import { buildChannelPlan } from '@go10/core/tv/plan'
import { collectionOf, movieTitle } from '@go10/core/tv/testing'
import type { Lineup } from '@go10/core/tv/types'

const EPOCH = Date.UTC(2026, 9, 1)
const collection = collectionOf('cn', ['m'])
const lineup: Lineup = {
  epochMs: EPOCH, defaultChannel: 'cn',
  channels: [{ id: 'cn', number: 1, name: 'Cartoon Network', collection, plan: buildChannelPlan({ id: 'cn', number: 1, collection: 'cn' }, collection, [movieTitle('m', 3000)]) }],
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(EPOCH + 1000)
})
afterEach(() => vi.useRealTimers())

describe('LiveRow', () => {
  it('lists the live channels under "En vivo ahora" and tunes one in', () => {
    const onWatch = vi.fn()
    render(
      <TvProvider lineup={lineup}>
        <FocusProvider onBack={() => {}}>
          <LiveRow rowIndex={1} onWatch={onWatch} />
        </FocusProvider>
      </TvProvider>,
    )
    expect(screen.getByRole('heading', { name: /En vivo ahora/ })).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '1 Cartoon Network: m' }))
    expect(onWatch).toHaveBeenCalledWith('cn')
  })
})
```

Append to `apps/web/src/components/Navbar.test.tsx` (follow its existing render helper; pass the new props):

```tsx
  it('opens live TV from the "TV" item and preloads it on hover', () => {
    const onNavigate = vi.fn()
    const onTvIntent = vi.fn()
    render(
      <FocusProvider onBack={() => {}}>
        <Navbar route={{ name: 'home' }} onNavigate={onNavigate} onTvIntent={onTvIntent} />
      </FocusProvider>,
    )
    const tv = screen.getByRole('button', { name: 'TV en vivo' })
    fireEvent.pointerEnter(tv)
    expect(onTvIntent).toHaveBeenCalled()
    fireEvent.click(tv)
    expect(onNavigate).toHaveBeenCalledWith({ name: 'tv', channel: null })
  })
```

Run: `npm test -w @go10/web -- src/tv/LiveRow.test.tsx src/components/Navbar.test.tsx` → FAIL.

- [ ] **Step 2: Implement `LiveRow.tsx`**

```tsx
import { useTv } from './TvProvider'
import { useLiveNow } from './useLiveNow'
import { ChannelTile } from './ChannelTile'
import '../components/Row.css'
import './tv.css'

/** Home's "En vivo ahora": every channel and what it's airing, one tap from tuning in. */
export function LiveRow({ rowIndex, onWatch }: { rowIndex: number; onWatch: (channelId: string) => void }) {
  const { lineup } = useTv()
  const live = useLiveNow(lineup)
  if (!lineup) return null
  return (
    <section className="go-row go-row--live">
      <h2 className="go-row_label">
        <span className="go-live-dot" aria-hidden="true" />
        En vivo ahora
      </h2>
      <div className="go-row_track">
        {lineup.channels.map((channel, col) => {
          const schedule = live.get(channel.id)
          return schedule ? (
            <ChannelTile key={channel.id} channel={channel} schedule={schedule} row={rowIndex} col={col} scope="live" onSelect={(c) => onWatch(c.id)} />
          ) : null
        })}
      </div>
    </section>
  )
}
```

Add to `tv.css`:

```css
.go-live-dot {
  display: inline-block;
  width: 0.55em;
  height: 0.55em;
  margin-right: 0.45em;
  border-radius: 50%;
  background: #e5262a;
  vertical-align: 0.1em;
  animation: go-live-pulse 1.6s ease-in-out infinite;
}
@keyframes go-live-pulse {
  50% {
    opacity: 0.35;
  }
}
.go-tv .go-live-dot,
.go-tv-lite .go-live-dot {
  animation: none;
}
```

- [ ] **Step 3: Add the navbar item**

In `Navbar.tsx`:

1. Add an optional `onIntent?: () => void` prop to `NavButton`, and on its root `div` add `onPointerEnter={onIntent}` and `onFocus={onIntent}`.
2. Add `onTvIntent?: () => void` to `Navbar`'s props.
3. Inside `.go-nav_links`, before the Películas button:

```tsx
        <NavButton
          id="nav:tv"
          col={-1}
          className="go-nav_link go-nav_tv"
          active={route.name === 'tv'}
          ariaLabel="TV en vivo"
          onIntent={onTvIntent}
          onSelect={() => onNavigate({ name: 'tv', channel: null })}
        >
          <span className="go-live-dot" aria-hidden="true" />
          TV
        </NavButton>
```

Add `import '../tv/tv.css'` at the top of `Navbar.tsx` for `.go-live-dot`, and to `Navbar.css`:

```css
.go-nav_tv {
  display: inline-flex;
  align-items: center;
}
```

- [ ] **Step 4: Put the row on Home and wire both entry points in App**

In `Home.tsx`, add the prop `liveRow?: (rowIndex: number) => ReactNode` (import `type ReactNode` from `react`), and replace the row-index arithmetic:

```tsx
  // Focus rows: collections strip, then the live row, then Seguir viendo, then the catalog rows.
  const liveIndex = strip.length > 0 ? 1 : 0
  const live = liveRow?.(liveIndex) ?? null
  const firstRow = liveIndex + (live ? 1 : 0)
```

and render `{live}` right after the `CollectionStrip` line. The existing `firstRow` uses below stay as they are.

In `App.tsx`, inside the browse branch: pass `onTvIntent` to `Navbar` and `liveRow` to `Home`. Both need the TV context, which is available because the browse tree renders inside `TvProvider`; read it through a tiny wrapper to keep `App` hook-order-safe:

```tsx
function BrowseTv({ children }: { children: (tv: ReturnType<typeof useTv>) => ReactNode }) {
  return <>{children(useTv())}</>
}
```

and replace the browse `<div className="go-browse">…</div>` (inside `<FocusProvider key="browse">`) with:

```tsx
        <BrowseTv>
          {(tv) => (
            <div className="go-browse">
              <Navbar route={route} onNavigate={navigate} onTvIntent={() => tv.preload()} />
              {resolved.name === 'home' ? (
                <Home
                  titles={titles}
                  heroArt={heroArt}
                  onSelect={openTitle}
                  onResume={(title, row) => navigate({ name: 'play', key: title.key, videoId: rowKey(row) })}
                  collections={COLLECTIONS}
                  onOpenCollection={(collection) => navigate({ name: 'collection', id: collection.id })}
                  liveRow={
                    tv.lineup
                      ? (rowIndex) => <LiveRow rowIndex={rowIndex} onWatch={(id) => navigate({ name: 'tv', channel: id })} />
                      : undefined
                  }
                />
              ) : resolved.name === 'catalog' ? (
                <Catalog
                  titles={titles}
                  section={resolved.section}
                  query={resolved.query}
                  source={(route.name === 'catalog' && route.source) || 'all'}
                  onSelect={openTitle}
                />
              ) : (
                <Collection collection={resolved.collection} titles={resolved.titles} onSelect={openTitle} />
              )}
            </div>
          )}
        </BrowseTv>
```

Add `import { LiveRow } from './tv/LiveRow'`.

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test -w @go10/web && npm run typecheck`
Expected: PASS (the existing Home test "sits between the hero and the first row" still passes: Home without `liveRow` renders no live row, and `LiveRow`'s root is a `.go-row`).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): TV entry points — navbar item and En vivo ahora row

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Web — preview audio, per the spike

**Files:**
- Modify: `apps/web/src/tv/TvProvider.tsx`, `apps/web/src/tv/TvProvider.test.tsx`
- Modify (only for `STAGED_FIX = 'reload-on-click'`): `apps/web/src/tv/TvSlot.tsx`

**Interfaces:**
- Consumes: `PREVIEW_AUDIO` and `STAGED_FIX` from `docs/superpowers/spikes/2026-10-01-tv-embed-spike.md` (Task 1); `okru.muteMessage` / `okru.unmuteMessage` (Task 1, only for `'mute'`); `okru.pauseMessage`, `okru.playMessage`.

Implement exactly one of the two branches below, as recorded in the spike doc.

- [ ] **Step 1 (branch `PREVIEW_AUDIO = 'mute'`): test, then implement**

Add to `TvProvider.test.tsx`:

```tsx
  it('mutes a preview once loaded, and unmutes it when promoted', () => {
    renderLayer()
    act(() => {
      api.setScreen('tv')
      api.watch('a')
    })
    act(() => api.previewAt('c', { top: 0, left: 0, width: 1, height: 1 }))
    const frame = document.querySelector('[data-channel="c"] iframe') as HTMLIFrameElement
    const post = vi.spyOn(frame.contentWindow!, 'postMessage')
    fireEvent.load(frame)
    expect(post).toHaveBeenCalledWith(okru.muteMessage, 'https://ok.ru')
    act(() => api.watch('c'))
    expect(post).toHaveBeenCalledWith(okru.unmuteMessage, 'https://ok.ru')
  })
```

(import `okru` from `@go10/core/player/providers/okru`). In `TvProvider.tsx`, extend `onSlotLoaded` to post `okru.muteMessage` to a slot whose role is `preview`, and in `watch()`, when a preview is promoted, post `okru.unmuteMessage` to its handle after the state update (`Promise.resolve().then(() => handles.current.get(preview.id)?.post(okru.unmuteMessage))` — `Promise.resolve().then`, not `queueMicrotask`, per the Global Constraints).

- [ ] **Step 1 (branch `PREVIEW_AUDIO = 'pause-main'`): test, then implement**

Add to `TvProvider.test.tsx`:

```tsx
  it('pauses main while a preview plays and resumes it after', () => {
    renderLayer()
    act(() => {
      api.setScreen('tv')
      api.watch('a')
    })
    const mainFrame = document.querySelector('[data-channel="a"] iframe') as HTMLIFrameElement
    fireEvent.load(mainFrame)
    const post = vi.spyOn(mainFrame.contentWindow!, 'postMessage')
    act(() => api.previewAt('c', { top: 0, left: 0, width: 1, height: 1 }))
    expect(post).toHaveBeenCalledWith({ action: 'pause' }, 'https://ok.ru')
    act(() => api.endPreview())
    expect(post).toHaveBeenCalledWith({ action: 'play' }, 'https://ok.ru')
  })
```

In `TvProvider.tsx`: in `previewAt`, when a preview slot is being created, post `okru.pauseMessage` to the main handle; in `endPreview`, post `okru.playMessage` to the main handle (the boundary/drift logic in `TvSlot` re-syncs it to live within two reports). On promotion nothing is posted: the paused old main is torn down.

- [ ] **Step 2 (only `STAGED_FIX = 'reload-on-click'`): reload a staged main on activation**

In `TvProvider.tsx`, when `activated` flips to true and the main slot was created while not activated (track `stagedIds: Set<number>` in a ref, added in `preload()`), replace that slot with a fresh one (`{ id: nextId.current++, channelId, role: 'main' }`, appended, old one removed). Test:

```tsx
  it('reloads a staged main on the click into TV', () => {
    renderLayer()
    act(() => api.preload('a'))
    const staged = document.querySelector('iframe')
    act(() => {
      api.setScreen('tv')
      api.watch('a')
    })
    expect(document.querySelector('iframe')).not.toBe(staged)
  })
```

and change the earlier test "preloads the default channel staged, then shows it full when watched" to assert a reload instead of the same iframe (`.not.toBe(frame)`).

- [ ] **Step 3: Run tests**

Run: `npm test -w @go10/web -- src/tv`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/tv
git commit -m "feat(web): preview audio handling per the TV embed spike

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Verification — full suite, build, and manual pass on real ok.ru

**Files:**
- Modify: `README.md` (a short "Live TV" section)

- [ ] **Step 1: Full suite, typecheck, build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all PASS; the build succeeds with the `chrome69` target.

- [ ] **Step 2: Document the feature**

Add to `README.md`, after the collections paragraph:

```markdown
### Live TV (`/tv`)

Channels are listed in `data/channels.json`, one per collection (`id`,
`number`, `collection`, optional `name`, `blockMinutes`, `exclude`;
`defaultChannel`; `epoch`). Every device computes the same schedule from the
catalog and the clock — there's no backend — so editing a channel's
collection reshuffles its timeline from the next deploy. Channels rotate
through their titles in ~30-minute blocks; a series airs its next episodes
in order. `channels.data.test.ts` validates the file against the catalog.
```

- [ ] **Step 3: Manual pass (human, real ok.ru)**

Run `npm run dev` and check in desktop Chrome, desktop Firefox and a phone:
1. Hover "TV" in the navbar, then click it: the channel appears playing (or within ~2 s), with sound.
2. The strip is open, collapses after ~6 s to its slim row, and reopens on mouse move / tap / any key.
3. ↓/↑, PgUp/PgDn, 1–9 zap; Back leaves the screen with the channel in the mini-player; the mini-player reopens TV; ✕ closes it.
4. Desktop: resting on a tile shows a live preview in the tile (silent, or main paused, per the spike); clicking it zaps instantly.
5. Phone: vertical swipe zaps; tap toggles the strip; no previews.
6. Open two browsers on the same channel: the same program at (within a few seconds) the same moment.
7. Throttle the network until an embed fails: "Reconectando…" appears and retries; after the last retry, "Señal interrumpida — Volvemos con …".
8. While the mini-player plays, open a title and press Play: the mini-player disappears; only the title plays.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: live TV in the README

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
