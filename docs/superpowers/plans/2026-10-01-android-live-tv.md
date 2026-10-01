# Android Live TV Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring live TV (`/tv`: always-on channels, zapping, a live channel strip, an "En vivo ahora" row on Home) to the Android app (`apps/mobile`, one APK for Android TV and phones), in sync with the web and Tizen builds.

**Architecture:** The schedule engine, lineup, live session, labels and retry reducer are already platform-free in `packages/core/src/tv/` and `packages/core/src/player/`; the Android app reuses them unchanged. The web publishes `data/channels.json` next to the catalog so the app fetches it like collections (same catalog + same channels file = same schedule on every device). The app gets a **lean** live TV, the model Tizen already uses (spec §8 "TV builds"): one WebView at a time on the TV screen only — no preload, no hover preview, no mini-player — and a zap loads only once the zapping has stopped for 600 ms. That holds on phones too: a phone gets the touch gestures (tap for the strip, vertical swipe to zap) but the same single-embed model.

**Tech Stack:** Expo 57 + expo-router, react-native-tvos 0.86, react-native-webview (inline host page, `hostPage.ts`), Jest + @testing-library/react-native, Vitest for `apps/web/build`.

**Spec:** `docs/superpowers/specs/2026-10-01-live-tv-channels-design.md` (web design; §8 says the TV builds reuse core and drop the preview, mini-player and input shield) and `docs/superpowers/spikes/2026-10-01-tv-embed-spike.md` (ok.ru accepts `mute`/`unmute`/`volume`; the embed autoplays muted). The behavior to match is the web/Tizen TV screen as of `d49cc7d` (`apps/web/src/tv/TvScreen.tsx`, README "Live TV").

## Global Constraints

- No new runtime dependencies in `apps/mobile` (everything needed is already installed: `react-native-webview`, `expo-image`, `react-native-mmkv`).
- Core is imported, never copied: `resolveLineup`, `pickChannel`, `writeLastChannel`, `stepChannel` (`@go10/core/tv/lineup`), `scheduleAt` (`@go10/core/tv/schedule`), `createLiveSession` (`@go10/core/tv/liveSession`), `programLabel`/`clockLabel`/`progressOf` (`@go10/core/tv/describe`), `playerRetryReducer`/`backoffMs` (`@go10/core/player/playerRetry`), `LOAD_TIMEOUT_MS` (`@go10/core/player/playbackSession`), `okru` (`@go10/core/player/providers/okru`).
- Watch progress is never written by live TV.
- Timings copied from web: `STRIP_IDLE_MS = 6000`, `ZAP_SETTLE_MS = 600`, `ZAP_FLASH_MS = 400` (unused on Android: every zap settles), `LIVE_REFRESH_MS = 5000`, `STALL_MS = 4000`, swipe threshold `60` px.
- UI copy, verbatim from web: "En vivo ahora", "TV", "A continuación: <program> · HH:MM", "Señal interrumpida", "Volvemos con <program> a las HH:MM", "Reconectando…", "Tocá para ver", "Silenciar" / "Activar sonido", "Volver", "Canales".
- The ok.ru top/bottom chrome is cropped by 64 px each side, as `--go-okru-chrome` does on the web.
- The last channel is remembered through core's `keyValueStore` (`go10:tvLastChannel`), already MMKV-backed on Android (`src/platform/install.ts`).
- Android TV remote keys that reach JS (react-native-tvos `ReactAndroidHWInputDeviceHelper.kt`): D-pad, select, media keys, `info`, `menu`, `channelUp`, `channelDown`. **Number keys, PRE-CH and CH LIST are not delivered** — they are out of scope (see "Out of scope").

## Review Focus

1. **Zapping fast on a TV remote** (holding Down): only the channel where it stops loads; intermediate channels never mount a WebView. → Task 6 test "holding Down loads only where it stops".
2. **A channel that never loads**: three retries, then "Señal interrumpida" with the strip forced open, then a fresh attempt at the next program boundary. → Task 4 tests "gives up…" and "retunes at the boundary".
3. **App backgrounded and resumed** (phone locked, TV home button): the channel rejoins the live second, seeking in place when the file is the same. → Task 4 test "rejoins live when the app comes back".
4. **Back with the strip open** closes the strip; Back with it closed leaves `/tv`. → Task 6 test "Back closes the strip first".
5. **Old site / missing `channels.json`** (an APK talking to a site deployed before Task 1, or a corrupt file): no TV entry points and no crash; `/tv` deep-links fall back to Home. → Task 2 test "missing channels file" and Task 7 test "no lineup".

## File Structure

| File | Responsibility |
|---|---|
| `apps/web/build/channelsFile.ts` (new) | Reads `data/channels.json` for publishing; throws on invalid JSON. |
| `apps/web/vite.config.ts` (modify) | Emits `data/channels.json` alongside `data/collections/index.json`. |
| `apps/mobile/src/data/catalogStore.ts` (modify) | Fetches/caches `data/channels.json`; `CatalogData.channels`. |
| `apps/mobile/src/player/hostPage.ts` (modify) | `hostHtml` gains an optional `cropPx`. |
| `packages/core/src/player/playerKeys.ts` (modify) | `RemoteKey` gains `channelUp` / `channelDown` / `info`. |
| `apps/mobile/src/tv/useLineup.ts` (new) | `CatalogData` → `Lineup \| null`. |
| `apps/mobile/src/tv/useLiveNow.ts` (new) | Every channel's `Schedule`, refreshed every 5 s and at boundaries. |
| `apps/mobile/src/tv/liveKeys.ts` (new) | Pure remote-key map for the TV screen. |
| `apps/mobile/src/tv/LiveVideo.tsx` (new) | One channel's WebView kept on the live schedule: tune, retry, boundary, resume, stall, sound. |
| `apps/mobile/src/tv/ChannelTile.tsx` (new) | A channel and what it's airing (thumbnail, badge, progress, label). |
| `apps/mobile/src/tv/TvScreenView.tsx` (new) | The TV screen: video, now-playing bar, strip, zap/settle, keys, touch. |
| `apps/mobile/src/app/tv/index.tsx`, `apps/mobile/src/app/tv/[channel].tsx` (new) | Routes; `/tv` resolves to last/default channel. |
| `apps/mobile/src/tv/LiveRow.tsx` (new) | Home's "En vivo ahora". |
| `apps/mobile/src/browse/navigate.ts`, `components/Navbar.tsx`, `components/HomeView.tsx`, `components/HomeContent.tsx`, `app/index.tsx` (modify) | Entry points. |
| `README.md`, `docs/android-live-tv-checklist.md` (new) | Docs and on-device checklist. |

---

### Task 1: Publish `channels.json` from the web build

The app reads everything from the live site, and `channels.json` is currently only bundled into the web JS (`apps/web/src/tv/channels.ts`). Publish it at `/data/channels.json`.

**Files:**
- Create: `apps/web/build/channelsFile.ts`
- Create: `apps/web/build/channelsFile.test.ts`
- Modify: `apps/web/vite.config.ts`

**Interfaces:**
- Produces: `GET <site>/data/channels.json` — the file byte-for-byte as JSON (re-serialized).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/build/channelsFile.test.ts
// @vitest-environment node
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readChannelsFile } from './channelsFile.ts'

function fileWith(text: string): string {
  const path = join(mkdtempSync(join(tmpdir(), 'channels-')), 'channels.json')
  writeFileSync(path, text)
  return path
}

describe('readChannelsFile', () => {
  it('publishes the file as JSON', () => {
    const path = fileWith('{ "epoch": "2026-10-01T00:00:00Z", "defaultChannel": "a", "channels": [] }')
    expect(JSON.parse(readChannelsFile(path))).toEqual({ epoch: '2026-10-01T00:00:00Z', defaultChannel: 'a', channels: [] })
  })

  it('stops the build on a file that is not JSON', () => {
    expect(() => readChannelsFile(fileWith('{ nope'))).toThrow(/channels\.json: not valid JSON/)
  })

  it('reads the real file', () => {
    const real = new URL('../../../data/channels.json', import.meta.url)
    expect(JSON.parse(readChannelsFile(real.pathname)).channels.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run build/channelsFile.test.ts` (in `apps/web`)
Expected: FAIL — cannot find module `./channelsFile.ts`.

- [ ] **Step 3: Implement**

```ts
// apps/web/build/channelsFile.ts
import { readFileSync } from 'node:fs'

/**
 * `data/channels.json` for publishing at `/data/channels.json`, where the
 * mobile app fetches it: every device must schedule from the same file. Only
 * a file that isn't JSON stops the build; the content is validated by
 * channels.data.test.ts and, at runtime, by resolveLineup.
 */
export function readChannelsFile(path: string): string {
  const text = readFileSync(path, 'utf8')
  try {
    return JSON.stringify(JSON.parse(text))
  } catch (error) {
    throw new Error(`channels.json: not valid JSON (${(error as Error).message})`)
  }
}
```

In `apps/web/vite.config.ts`, rename the plugin and emit both files:

```ts
import { readChannelsFile } from './build/channelsFile.ts'

const COLLECTIONS_DIR = fileURLToPath(new URL('../../data/collections', import.meta.url))
const CHANNELS_FILE = fileURLToPath(new URL('../../data/channels.json', import.meta.url))

/** Publishes the data the mobile app fetches: /data/collections/index.json and /data/channels.json. */
function mobileData(): Plugin {
  return {
    name: 'go10-mobile-data',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'data/collections/index.json', source: buildCollectionsIndex(COLLECTIONS_DIR) })
      this.emitFile({ type: 'asset', fileName: 'data/channels.json', source: readChannelsFile(CHANNELS_FILE) })
    },
  }
}
```

and `plugins: [react(), mobileData(), tizenClassicScript()]`.

- [ ] **Step 4: Run tests and a build**

Run: `npx vitest run build/` then `npm run build -w apps/web && test -s apps/web/dist/data/channels.json && echo ok` (from repo root; use the web package's actual name from `apps/web/package.json` if `-w apps/web` doesn't resolve).
Expected: PASS, `ok`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/build/channelsFile.ts apps/web/build/channelsFile.test.ts apps/web/vite.config.ts
git commit -m "feat(web): publish data/channels.json for the Android app"
```

> **Deploy note:** the site must be deployed with this before the APK can show live TV. Until then the app hides every TV entry point (Task 2).

---

### Task 2: The app fetches channels and resolves a lineup

**Files:**
- Modify: `apps/mobile/src/data/catalogStore.ts`
- Modify: `apps/mobile/src/data/catalogStore.test.ts`
- Create: `apps/mobile/src/tv/useLineup.ts`
- Create: `apps/mobile/src/tv/useLineup.test.ts`
- Create: `apps/mobile/src/tv/useLiveNow.ts`

**Interfaces:**
- Produces: `CatalogData.channels: unknown | null` (the raw file, top-level-validated, or null); `parseChannels(json: string): unknown | null`; `lineupOf(data: CatalogData): Lineup | null`; `useLineup(data: CatalogData | null): Lineup | null`; `useLiveNow(lineup: Lineup | null): Map<string, Schedule>`; `LIVE_REFRESH_MS = 5000`.

- [ ] **Step 1: Write the failing tests**

Add to `catalogStore.test.ts` (follow the file's existing fake `fetchText`/`cache` helpers; the snippet assumes a helper that maps paths to bodies — adapt to the file's actual helper names):

```ts
import { parseChannels } from './catalogStore'

describe('parseChannels', () => {
  it('keeps a channels file', () => {
    const raw = { epoch: '2026-10-01T00:00:00Z', defaultChannel: 'a', channels: [{ id: 'a', number: 1, collection: 'c' }] }
    expect(parseChannels(JSON.stringify(raw))).toEqual(raw)
  })
  it('rejects what is not one', () => {
    expect(parseChannels('<html>')).toBeNull()
    expect(parseChannels('[]')).toBeNull()
    expect(parseChannels('{"channels": 3}')).toBeNull()
  })
})

it('loads channels.json with the catalog', async () => {
  // site serves catalog.csv, collections index, hero_art.json and channels.json
  const store = storeServing({ 'data/channels.json': JSON.stringify(CHANNELS) })
  await store.start()
  expect(readyData(store).channels).toEqual(CHANNELS)
})

it('missing channels file: channels is null, the catalog still loads', async () => {
  const store = storeServing({}) // 404 for data/channels.json
  await store.start()
  expect(readyData(store).channels).toBeNull()
  expect(readyData(store).titles.length).toBeGreaterThan(0)
})

it('a changed channels file alone is a refresh', async () => {
  // cache holds catalog + collections + hero art + an old channels.json; the site returns 304 for all but channels
  // expect store.applyPending() to swap in the new channels
})
```

Write the third test concretely with the file's cache/ETag helpers (the existing "a changed collections file alone" test, if present, is the template).

`apps/mobile/src/tv/useLineup.test.ts`:

```ts
import { collectionOf, movieTitle, showTitle } from '@go10/core/tv/testing'
import { lineupOf } from './useLineup'
import type { CatalogData } from '../data/catalogStore'

const titles = [showTitle('coraje', 6, 660), movieTitle('mulan', 5300)]
const data = (channels: unknown): CatalogData => ({
  rows: titles.flatMap((t) => t.seasons), titles, heroArt: {},
  collections: [collectionOf('cn', ['coraje', 'mulan'])],
  channels,
})

describe('lineupOf', () => {
  it('resolves the channels file against the catalog', () => {
    const lineup = lineupOf(data({ epoch: '2026-10-01T00:00:00Z', defaultChannel: 'cn', channels: [{ id: 'cn', number: 1, collection: 'cn' }] }))
    expect(lineup?.channels.map((c) => c.id)).toEqual(['cn'])
  })
  it('is null without a channels file', () => {
    expect(lineupOf(data(null))).toBeNull()
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -- catalogStore useLineup` (in `apps/mobile`)
Expected: FAIL — `parseChannels` / `lineupOf` not exported.

- [ ] **Step 3: Implement**

In `catalogStore.ts`:

```ts
import { validateChannelsTop } from '@go10/core/tv/validateChannels'

export interface CatalogData {
  // …existing fields…
  /** data/channels.json as published (resolveLineup validates the entries); null when the site has none. */
  channels: unknown | null
}

/** A channels file whose top level is sound, or null (an HTML fallback page, a truncated download). */
export function parseChannels(json: string): unknown | null {
  try {
    const raw: unknown = JSON.parse(json)
    return validateChannelsTop(raw).length === 0 ? raw : null
  } catch {
    return null
  }
}

const CHANNELS: Resource<unknown> = { name: 'channels.json', path: 'data/channels.json', parse: parseChannels }
```

In `load()`: read `const cachedChannels = cached(CHANNELS)?.value ?? null`, include `channels: cachedChannels` in `current`, add `refresh(CHANNELS)` to the `Promise.all`, include `!freshChannels` in the "unchanged" check, and set `channels: freshChannels ?? cachedChannels` in `next`. Update every other `CatalogData` literal in the app and its tests (`grep -rn "heroArt:" apps/mobile/src`) to add `channels: null`.

`apps/mobile/src/tv/useLineup.ts`:

```ts
import { useMemo } from 'react'
import { resolveLineup } from '@go10/core/tv/lineup'
import type { Lineup } from '@go10/core/tv/types'
import type { CatalogData } from '../data/catalogStore'

/** The channels on air for this catalog; null without a channels file or when nothing can air. */
export function lineupOf(data: CatalogData): Lineup | null {
  return data.channels === null || data.titles.length === 0 ? null : resolveLineup(data.channels, data.collections, data.titles)
}

export function useLineup(data: CatalogData | null): Lineup | null {
  return useMemo(() => (data ? lineupOf(data) : null), [data])
}
```

`apps/mobile/src/tv/useLiveNow.ts` — the web hook (`apps/web/src/tv/useLiveNow.ts`) unchanged; it uses only React and core:

```ts
import { useEffect, useMemo, useReducer } from 'react'
import { scheduleAt } from '@go10/core/tv/schedule'
import type { Lineup, Schedule } from '@go10/core/tv/types'

export const LIVE_REFRESH_MS = 5000

/** What every channel is airing now, refreshed every few seconds and at the next program boundary (apps/web/src/tv/useLiveNow.ts). */
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
    const timer = setTimeout(bump, Math.max(0, Math.min(LIVE_REFRESH_MS, boundary - Date.now())))
    return () => clearTimeout(timer)
  }, [now])

  return now
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test && npm run typecheck` (in `apps/mobile`)
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/data apps/mobile/src/tv apps/mobile/src/**/*.test.ts*
git commit -m "feat(mobile): fetch the channels file and resolve the live lineup"
```

---

### Task 3: Remote keys and the cropped host page

**Files:**
- Modify: `packages/core/src/player/playerKeys.ts`, `packages/core/src/player/playerKeys.test.ts`
- Modify: `apps/mobile/src/player/hostPage.ts`, `apps/mobile/src/player/hostPage.test.ts`
- Create: `apps/mobile/src/tv/liveKeys.ts`, `apps/mobile/src/tv/liveKeys.test.ts`

**Interfaces:**
- Produces: `RemoteKey` adds `'channelUp' | 'channelDown' | 'info'` (`playerKeyAction` returns null for them); `hostHtml(embedSrc, origin, options?: { cropPx?: number })`; `OKRU_CHROME_PX = 64`; `liveKeyAction(key: RemoteKey, stripOpen: boolean): LiveKeyAction | null` with `type LiveKeyAction = { type: 'zap'; step: 1 | -1 } | { type: 'reveal' } | { type: 'activity' }`.

- [ ] **Step 1: Write the failing tests**

`playerKeys.test.ts` — add:

```ts
it('passes the channel keys through as remote keys', () => {
  expect(remoteKey({ eventType: 'channelUp', eventKeyAction: 0 })).toBe('channelUp')
  expect(remoteKey({ eventType: 'channelDown', eventKeyAction: 0 })).toBe('channelDown')
  expect(remoteKey({ eventType: 'info', eventKeyAction: 0 })).toBe('info')
})
it('the on-demand player ignores the channel keys', () => {
  expect(playerKeyAction('channelUp', false)).toBeNull()
  expect(playerKeyAction('info', false)).toBeNull()
})
```

`hostPage.test.ts` — add:

```ts
it('crops the embed chrome when asked', () => {
  const html = hostHtml('https://ok.ru/videoembed/1', 'https://ok.ru', { cropPx: 64 })
  expect(html).toContain('top:-64px')
  expect(html).toContain('height:calc(100% + 128px)')
})
it('does not crop by default', () => {
  expect(hostHtml('https://ok.ru/videoembed/1', 'https://ok.ru')).not.toContain('top:-')
})
```

`apps/mobile/src/tv/liveKeys.test.ts`:

```ts
import { liveKeyAction } from './liveKeys'

describe('liveKeyAction', () => {
  it('Up/Down and CH+/CH− zap, strip open or not', () => {
    for (const open of [false, true]) {
      expect(liveKeyAction('up', open)).toEqual({ type: 'zap', step: -1 })
      expect(liveKeyAction('down', open)).toEqual({ type: 'zap', step: 1 })
      expect(liveKeyAction('channelUp', open)).toEqual({ type: 'zap', step: 1 })
      expect(liveKeyAction('channelDown', open)).toEqual({ type: 'zap', step: -1 })
    }
  })
  it('Left/Right first reveal the strip, then only keep it open (focus moves the tiles)', () => {
    expect(liveKeyAction('left', false)).toEqual({ type: 'reveal' })
    expect(liveKeyAction('right', false)).toEqual({ type: 'reveal' })
    expect(liveKeyAction('right', true)).toEqual({ type: 'activity' })
  })
  it('OK does nothing over the bare picture; on the strip the tile handles it', () => {
    expect(liveKeyAction('select', false)).toBeNull()
    expect(liveKeyAction('select', true)).toEqual({ type: 'activity' })
  })
  it('Info shows the strip', () => {
    expect(liveKeyAction('info', false)).toEqual({ type: 'reveal' })
  })
  it('media keys do nothing: it is live', () => {
    for (const key of ['playPause', 'play', 'pause', 'fastForward', 'rewind', 'next', 'previous'] as const) {
      expect(liveKeyAction(key, false)).toBeNull()
    }
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/player/playerKeys.test.ts` (in `packages/core`), `npm test -- hostPage liveKeys` (in `apps/mobile`)
Expected: FAIL.

- [ ] **Step 3: Implement**

`playerKeys.ts`: extend the union and the set:

```ts
export type RemoteKey =
  | 'up' | 'down' | 'left' | 'right' | 'select'
  | 'playPause' | 'play' | 'pause' | 'fastForward' | 'rewind' | 'next' | 'previous'
  | 'channelUp' | 'channelDown' | 'info'

const KEYS = new Set<string>([
  'up', 'down', 'left', 'right', 'select', 'playPause', 'play', 'pause', 'fastForward', 'rewind', 'next', 'previous',
  'channelUp', 'channelDown', 'info',
])
```

(`playerKeyAction`'s final `return null` already covers them; check that the web's `remoteKey` callers, if any, still typecheck: `npm run typecheck -w apps/web`.)

`hostPage.ts`:

```ts
/** ok.ru's title bar and control bar, cropped off live TV (the web's --go-okru-chrome). */
export const OKRU_CHROME_PX = 64

export function hostHtml(embedSrc: string, origin: string, { cropPx = 0 }: { cropPx?: number } = {}): string {
  const frame = cropPx > 0
    ? `iframe{border:0;position:absolute;left:0;top:-${cropPx}px;width:100%;height:calc(100% + ${2 * cropPx}px)}`
    : 'iframe{border:0;width:100%;height:100%}'
  return `<!doctype html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden;position:relative}${frame}</style>
…rest unchanged…`
}
```

`apps/mobile/src/tv/liveKeys.ts`:

```ts
import type { RemoteKey } from '@go10/core/player/playerKeys'

export type LiveKeyAction = { type: 'zap'; step: 1 | -1 } | { type: 'reveal' } | { type: 'activity' }

/**
 * The live TV screen's remote (the web's TvScreen key handling): Up/Down and
 * CH+/CH− zap; Left/Right first only reveal the strip, then move along it
 * (the focus engine does that, so they just count as activity); OK over the
 * bare picture does nothing. Media keys do nothing: it's live.
 */
export function liveKeyAction(key: RemoteKey, stripOpen: boolean): LiveKeyAction | null {
  switch (key) {
    case 'up':
    case 'channelDown':
      return { type: 'zap', step: -1 }
    case 'down':
    case 'channelUp':
      return { type: 'zap', step: 1 }
    case 'left':
    case 'right':
      return stripOpen ? { type: 'activity' } : { type: 'reveal' }
    case 'info':
      return { type: 'reveal' }
    case 'select':
      return stripOpen ? { type: 'activity' } : null
    default:
      return null
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run` (in `packages/core`), `npm test && npm run typecheck` (in `apps/mobile`), `npm run typecheck -w apps/web` if the web has that script.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/player/playerKeys.ts packages/core/src/player/playerKeys.test.ts apps/mobile/src/player apps/mobile/src/tv/liveKeys*
git commit -m "feat(mobile): live TV remote key map, channel keys, and a cropped embed page"
```

---

### Task 4: `LiveVideo` — one channel's WebView on the live schedule

The Android twin of `apps/web/src/tv/TvSlot.tsx`, in the style of `components/PlayerView.tsx`. Mounted by the TV screen with `key={channel.id}`, so a zap is a fresh session and fresh retry state.

**Files:**
- Create: `apps/mobile/src/tv/LiveVideo.tsx`
- Create: `apps/mobile/src/tv/LiveVideo.test.tsx`

**Interfaces:**
- Consumes: `hostHtml(src, origin, { cropPx })`, `OKRU_CHROME_PX`, `commandScript`, `parseHostMessage`, `allowNavigation` (Task 3 / existing).
- Produces:

```ts
export const STALL_MS = 4000
export function LiveVideo(props: {
  channel: Channel
  epochMs: number
  siteUrl: string
  soundOn: boolean
  /** True while the channel has given up ("Señal interrumpida"), false once it retunes. */
  onFailedChange?: (failed: boolean) => void
  /** True while loaded but not moving (an ad waiting for a tap), false once it moves. */
  onStalledChange?: (stalled: boolean) => void
}): JSX.Element
```

- [ ] **Step 1: Write the failing tests**

```tsx
// apps/mobile/src/tv/LiveVideo.test.tsx
import { act, render, screen } from '@testing-library/react-native'
import { AppState } from 'react-native'
import { resolveLineup } from '@go10/core/tv/lineup'
import { scheduleAt } from '@go10/core/tv/schedule'
import { collectionOf, showTitle } from '@go10/core/tv/testing'
import { LiveVideo } from './LiveVideo'

const mockInject = jest.fn()
jest.mock('react-native-webview', () => {
  const React = require('react')
  const { View } = require('react-native')
  const WebView = React.forwardRef((props: object, ref: unknown) => {
    React.useImperativeHandle(ref, () => ({ injectJavaScript: mockInject }))
    return React.createElement(View, props)
  })
  return { WebView }
})

const EPOCH = Date.parse('2026-10-01T00:00:00Z')
// Ten 10-minute episodes of separate files: every boundary is a new file.
const titles = [showTitle('coraje', 10, 600), showTitle('dexter', 10, 600)]
const lineup = resolveLineup(
  { epoch: '2026-10-01T00:00:00Z', defaultChannel: 'cn', channels: [{ id: 'cn', number: 1, collection: 'cn' }] },
  [collectionOf('cn', ['coraje', 'dexter'])],
  titles,
)!
const channel = lineup.channels[0]
const SITE = 'https://tv.test/'

const webview = () => screen.getByTestId('live-webview')
const host = (message: object) => act(() => webview().props.onMessage({ nativeEvent: { data: JSON.stringify(message) } }))
const injected = () => mockInject.mock.calls.map(([script]) => script as string)

beforeEach(() => {
  jest.useFakeTimers({ now: EPOCH + 90_000 })
  mockInject.mockClear()
})
afterEach(() => jest.useRealTimers())

const renderLive = (props: Partial<Parameters<typeof LiveVideo>[0]> = {}) =>
  render(<LiveVideo channel={channel} epochMs={lineup.epochMs} siteUrl={SITE} soundOn {...props} />)

describe('LiveVideo', () => {
  it('joins the live second, cropped, on the site origin', async () => {
    await renderLive()
    const { current, offset } = scheduleAt(channel.plan, lineup.epochMs, Date.now(), 0)
    expect(webview().props.source.baseUrl).toBe(SITE)
    expect(webview().props.source.html).toContain(`fromTime=${Math.floor(current.unit.start + offset)}`)
    expect(webview().props.source.html).toContain('top:-64px')
    expect(webview().props.mediaPlaybackRequiresUserAction).toBe(false)
  })

  it('asks for play and sound once loaded, and mute when sound is off', async () => {
    const { rerender } = await renderLive()
    await host({ kind: 'loaded' })
    expect(injected().join()).toContain('"action":"play"')
    expect(injected().join()).toContain('"action":"unmute"')
    expect(injected().join()).toContain('"action":"volume","value":1')
    mockInject.mockClear()
    await rerender(<LiveVideo channel={channel} epochMs={lineup.epochMs} siteUrl={SITE} soundOn={false} />)
    expect(injected().join()).toContain('"action":"mute"')
  })

  it('retries a load that times out, rejoining live each time', async () => {
    await renderLive()
    const first = webview().props.source.html
    await act(() => jest.advanceTimersByTime(8000))
    expect(screen.getByText('Reconectando…')).toBeTruthy()
    await act(() => jest.advanceTimersByTime(1000)) // the first backoff
    expect(webview().props.source.html).not.toBe(first) // nine seconds later: a later fromTime
  })

  it('gives up after the last retry: "Señal interrumpida" with the next program', async () => {
    const onFailedChange = jest.fn()
    await renderLive({ onFailedChange })
    for (let i = 0; i < 4; i++) await act(() => jest.advanceTimersByTime(8000 + 3000))
    expect(screen.getByText('Señal interrumpida')).toBeTruthy()
    expect(screen.getByText(/^Volvemos con .+ a las \d\d:\d\d$/)).toBeTruthy()
    expect(onFailedChange).toHaveBeenLastCalledWith(true)
  })

  it('retunes at the boundary after giving up', async () => {
    const onFailedChange = jest.fn()
    await renderLive({ onFailedChange })
    for (let i = 0; i < 4; i++) await act(() => jest.advanceTimersByTime(8000 + 3000))
    const { current } = scheduleAt(channel.plan, lineup.epochMs, Date.now(), 0)
    await act(() => jest.advanceTimersByTime(current.endsAt - Date.now() + 1))
    expect(screen.getByTestId('live-webview')).toBeTruthy()
    expect(onFailedChange).toHaveBeenLastCalledWith(false)
  })

  it('loads the next file at the program boundary', async () => {
    await renderLive()
    await host({ kind: 'loaded' })
    const before = webview().props.source.html
    const { current } = scheduleAt(channel.plan, lineup.epochMs, Date.now(), 0)
    await act(() => jest.advanceTimersByTime(current.endsAt - Date.now() + 1))
    expect(webview().props.source.html).not.toBe(before)
  })

  it('rejoins live when the app comes back', async () => {
    const listeners: Array<(state: string) => void> = []
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, fn) => {
      listeners.push(fn as (state: string) => void)
      return { remove: jest.fn() } as never
    })
    await renderLive()
    await host({ kind: 'loaded' })
    const before = webview().props.source.html
    await act(() => jest.advanceTimersByTime(30 * 60_000)) // asleep for half an hour…
    await act(() => listeners.forEach((fn) => fn('active')))
    expect(webview().props.source.html).not.toBe(before) // …wakes on a new program
  })

  it('reports a stall when loaded but not moving, and clears it when the time moves', async () => {
    const onStalledChange = jest.fn()
    await renderLive({ onStalledChange })
    await host({ kind: 'loaded' })
    await act(() => jest.advanceTimersByTime(5000))
    expect(onStalledChange).toHaveBeenLastCalledWith(true)
    await host({ kind: 'embed', data: { event: 'timeupdate', time: 95, duration: 600 } })
    await act(() => jest.advanceTimersByTime(1000))
    expect(onStalledChange).toHaveBeenLastCalledWith(false)
  })

  it('covers a file that ended early with "A continuación"', async () => {
    await renderLive()
    await host({ kind: 'loaded' })
    await host({ kind: 'embed', data: { event: 'ended', time: 600 } })
    expect(screen.getByText(/^A continuación: .+ a las \d\d:\d\d$/)).toBeTruthy()
  })
})
```

Adjust the retry-count loop to `MAX_RETRIES` from `@go10/core/player/playerRetry` if it isn't 3 (read the reducer first; the loop must cover one timeout + every backoff).

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -- LiveVideo` (in `apps/mobile`)
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// apps/mobile/src/tv/LiveVideo.tsx
import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { AppState, Platform, StyleSheet, Text, View } from 'react-native'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'
import { LOAD_TIMEOUT_MS } from '@go10/core/player/playbackSession'
import { backoffMs, initialPlayerRetryState, playerRetryReducer } from '@go10/core/player/playerRetry'
import { okru } from '@go10/core/player/providers/okru'
import { clockLabel, programLabel } from '@go10/core/tv/describe'
import { createLiveSession } from '@go10/core/tv/liveSession'
import { scheduleAt } from '@go10/core/tv/schedule'
import type { Channel } from '@go10/core/tv/types'
import { commandScript, hostHtml, OKRU_CHROME_PX, parseHostMessage } from '../player/hostPage'
import { allowNavigation } from '../player/navigationGuard'
import { theme } from '../theme'

const tv = Platform.isTV

/**
 * Loaded, but the position hasn't moved for this long: something in the
 * embed waits for a tap (an ok.ru ad), so the screen lets taps through.
 */
export const STALL_MS = 4000

/**
 * One channel's embed, kept on the live schedule (apps/web/src/tv/TvSlot.tsx
 * on the player's WebView host page). Every load and retry rejoins the live
 * second; a dead channel retunes at the next program boundary.
 */
export function LiveVideo({ channel, epochMs, siteUrl, soundOn, onFailedChange, onStalledChange }: {
  channel: Channel
  epochMs: number
  siteUrl: string
  soundOn: boolean
  onFailedChange?: (failed: boolean) => void
  onStalledChange?: (stalled: boolean) => void
}) {
  const [state, dispatch] = useReducer(playerRetryReducer, initialPlayerRetryState)
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const webRef = useRef<WebView>(null)
  const loaded = useRef(false)
  const send = (command: unknown) => webRef.current?.injectJavaScript(commandScript(command))
  const [session] = useState(() => createLiveSession({ plan: channel.plan, epochMs, send, onFinishedEarly: rerender }))

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const src = useMemo(() => session.tune(), [state.reloadToken])
  const airing = session.current()
  const gaveUp = state.status === 'failed'

  const soundRef = useRef(soundOn)
  soundRef.current = soundOn
  // ok.ru autoplays muted (spike 2026-10-01): sound is always asked for.
  const applySound = () => {
    if (soundRef.current) {
      send(okru.unmuteMessage)
      send(okru.volumeMessage?.(1))
    } else {
      send(okru.muteMessage)
    }
  }
  useEffect(() => {
    if (loaded.current) applySound()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soundOn])

  const onFailedRef = useRef(onFailedChange)
  onFailedRef.current = onFailedChange
  useEffect(() => onFailedRef.current?.(gaveUp), [gaveUp])

  // The on-demand player's retry loop: timeout → backoff → remount.
  useEffect(() => {
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
  }, [state.status, state.attempt, state.reloadToken])

  const reload = () => {
    loaded.current = false
    dispatch({ type: 'reset' })
  }

  // The program boundary; a dead channel retunes from scratch there.
  const endsAt = airing?.endsAt ?? 0
  useEffect(() => {
    if (!endsAt) return
    const timer = setTimeout(() => {
      if (gaveUp || session.sync(endsAt) === 'load') reload()
      else rerender()
    }, Math.max(0, endsAt - Date.now()))
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endsAt, gaveUp, session])

  // Back from the background (phone locked, TV home key): rejoin live.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return
      if (gaveUp || session.sync() === 'load') reload()
      else rerender()
    })
    return () => subscription.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gaveUp, session])

  // Stall: loaded, not finished early, and the position frozen for STALL_MS.
  const [stalled, setStalled] = useState(false)
  const lastProgressAt = useRef(0)
  const lastTime = useRef<number | null>(null)
  useEffect(() => {
    if (state.status !== 'ready') {
      setStalled(false)
      return
    }
    const timer = setInterval(() => setStalled(!session.finishedEarly() && Date.now() - lastProgressAt.current >= STALL_MS), 1000)
    return () => clearInterval(timer)
  }, [state.status, state.reloadToken, session])
  const onStalledRef = useRef(onStalledChange)
  onStalledRef.current = onStalledChange
  useEffect(() => onStalledRef.current?.(stalled), [stalled])

  const heard = useRef(false)
  const onMessage = (event: WebViewMessageEvent) => {
    const message = parseHostMessage(event.nativeEvent.data)
    if (message?.kind === 'loaded') {
      loaded.current = true
      heard.current = false
      lastProgressAt.current = Date.now()
      lastTime.current = null
      dispatch({ type: 'loaded' })
      send(okru.playMessage)
      applySound()
      return
    }
    if (!message) return
    // The embed's first message: its player is up and listening now, ask again.
    if (!heard.current) {
      heard.current = true
      applySound()
    }
    const row = session.current()?.unit.row
    const report = row ? okru.parse(message.data, row) : null
    if (report?.kind === 'time' && report.time !== lastTime.current) {
      lastTime.current = report.time
      lastProgressAt.current = Date.now()
      setStalled(false)
    }
    session.handle(message.data)
  }

  const upNext = () => {
    const after = scheduleAt(channel.plan, epochMs, endsAt, 1).current
    return `${programLabel(after.unit)} a las ${clockLabel(after.startsAt)}`
  }

  return (
    <View style={styles.root}>
      {gaveUp ? (
        <View style={styles.card} accessibilityRole="alert">
          <Text style={styles.cardTitle}>Señal interrumpida</Text>
          <Text style={styles.cardText}>{`Volvemos con ${upNext()}`}</Text>
        </View>
      ) : (
        <WebView
          key={state.reloadToken}
          ref={webRef}
          testID="live-webview"
          style={styles.web}
          source={{ html: hostHtml(src, okru.origin, { cropPx: OKRU_CHROME_PX }), baseUrl: siteUrl }}
          originWhitelist={['*']}
          onMessage={onMessage}
          onShouldStartLoadWithRequest={(request) => allowNavigation(request, siteUrl)}
          mediaPlaybackRequiresUserAction={false}
          setSupportMultipleWindows={false}
          // Live TV: the remote's keys belong to the screen, never to ok.ru's controls.
          focusable={!tv}
        />
      )}
      {!gaveUp && state.status === 'retrying' && (
        <View style={styles.pill} pointerEvents="none">
          <Text style={styles.pillText}>Reconectando…</Text>
        </View>
      )}
      {!gaveUp && session.finishedEarly() && (
        <View style={styles.card} pointerEvents="none">
          <Text style={styles.cardText}>{`A continuación: ${upNext()}`}</Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, backgroundColor: '#000' },
  web: { flex: 1, backgroundColor: '#000' },
  card: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.color.bg },
  cardTitle: { color: theme.color.text, fontFamily: theme.font.displayBold, fontSize: theme.size.section },
  cardText: { color: theme.color.textMuted, fontFamily: theme.font.mono, fontSize: theme.size.body },
  pill: { position: 'absolute', top: '45%', alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: theme.color.scrim },
  pillText: { color: theme.color.text, fontFamily: theme.font.mono, fontSize: theme.size.meta },
})
```

Note the boundary timer's "A continuación" text uses the same `upNext()` wording as web (`TvSlot` renders "A continuación: {upNext()}", i.e. "… a las HH:MM").

- [ ] **Step 4: Run tests**

Run: `npm test -- LiveVideo && npm run typecheck` (in `apps/mobile`)
Expected: PASS. If the AppState test's spy fights the component's subscription, mock `AppState.addEventListener` before render exactly as written (it is).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/tv/LiveVideo.tsx apps/mobile/src/tv/LiveVideo.test.tsx
git commit -m "feat(mobile): a live channel's WebView, kept on the schedule with the player's retry policy"
```

---

### Task 5: `ChannelTile`

**Files:**
- Create: `apps/mobile/src/tv/ChannelTile.tsx`
- Create: `apps/mobile/src/tv/ChannelTile.test.tsx`

**Interfaces:**
- Produces:

```ts
export function ChannelTile(props: {
  channel: Channel
  schedule: Schedule
  imageBase: string
  current?: boolean
  /** TV: the strip opens with focus on the playing channel. */
  preferred?: boolean
  onSelect: (channel: Channel) => void
}): JSX.Element
```

- [ ] **Step 1: Write the failing test**

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native'
import { resolveLineup } from '@go10/core/tv/lineup'
import { scheduleAt } from '@go10/core/tv/schedule'
import { programLabel } from '@go10/core/tv/describe'
import { collectionOf, showTitle } from '@go10/core/tv/testing'
import { ChannelTile } from './ChannelTile'

const lineup = resolveLineup(
  { epoch: '2026-10-01T00:00:00Z', defaultChannel: 'cn', channels: [{ id: 'cn', number: 7, collection: 'cn' }] },
  [collectionOf('cn', ['coraje'])],
  [showTitle('coraje', 4, 600)],
)!
const channel = lineup.channels[0]
const schedule = scheduleAt(channel.plan, lineup.epochMs, lineup.epochMs + 90_000, 1)

describe('ChannelTile', () => {
  it('shows the number and the program, and is labelled for screen readers', async () => {
    await render(<ChannelTile channel={channel} schedule={schedule} imageBase="https://tv.test/" onSelect={jest.fn()} />)
    const label = programLabel(schedule.current.unit)
    expect(screen.getByText('7')).toBeTruthy()
    expect(screen.getByText(label)).toBeTruthy()
    expect(screen.getByLabelText(`7 CN: ${label}`)).toBeTruthy()
  })

  it('selects its channel', async () => {
    const onSelect = jest.fn()
    await render(<ChannelTile channel={channel} schedule={schedule} imageBase="https://tv.test/" onSelect={onSelect} />)
    fireEvent.press(screen.getByRole('button'))
    expect(onSelect).toHaveBeenCalledWith(channel)
  })

  it('marks the playing channel', async () => {
    await render(<ChannelTile channel={channel} schedule={schedule} imageBase="https://tv.test/" current onSelect={jest.fn()} />)
    expect(screen.getByRole('button').props.accessibilityState).toMatchObject({ selected: true })
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- ChannelTile`
Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// apps/mobile/src/tv/ChannelTile.tsx
import { Image } from 'expo-image'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { imageSrc } from '@go10/core/lib/imageSrc'
import { programLabel, progressOf } from '@go10/core/tv/describe'
import type { Channel, Schedule } from '@go10/core/tv/types'
import { theme } from '../theme'

/** A channel and what it's airing right now (apps/web/src/tv/ChannelTile.tsx, without the hover preview). */
export function ChannelTile({ channel, schedule, imageBase, current = false, preferred = false, onSelect }: {
  channel: Channel
  schedule: Schedule
  imageBase: string
  current?: boolean
  preferred?: boolean
  onSelect: (channel: Channel) => void
}) {
  const label = programLabel(schedule.current.unit)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${channel.number} ${channel.name}: ${label}`}
      accessibilityState={{ selected: current }}
      hasTVPreferredFocus={preferred}
      onPress={() => onSelect(channel)}
      style={({ focused }) => [styles.tile, focused && styles.tileFocused]}
    >
      {({ focused }) => (
        <>
          <View style={[styles.thumb, { backgroundColor: channel.collection.tile.color }, (focused || current) && styles.thumbLit, current && !focused && styles.thumbCurrent]}>
            <Image source={{ uri: imageSrc(schedule.current.unit.row.thumbnail, imageBase) }} style={StyleSheet.absoluteFill} contentFit="cover" />
            <View style={styles.badge}>
              <Image source={{ uri: imageSrc(channel.collection.logo, imageBase) }} style={styles.logo} contentFit="contain" />
              <Text style={styles.number}>{channel.number}</Text>
            </View>
          </View>
          <View style={styles.progress}>
            <View style={[styles.progressFill, { width: `${Math.round(progressOf(schedule) * 100)}%` }]} />
          </View>
          <Text style={styles.label} numberOfLines={1}>{label}</Text>
        </>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  tile: { width: theme.tile.width },
  tileFocused: { transform: [{ scale: theme.focusScale }], zIndex: 2 },
  thumb: { height: theme.tile.height, borderRadius: theme.radius, overflow: 'hidden', borderWidth: 1, borderColor: theme.color.hairline },
  thumbLit: { borderWidth: 3, borderColor: theme.color.accent },
  thumbCurrent: { borderColor: theme.color.text },
  badge: { position: 'absolute', left: 6, top: 6, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: theme.color.scrim },
  logo: { width: 28, height: 16 },
  number: { color: theme.color.text, fontFamily: theme.font.monoMedium, fontSize: theme.size.meta },
  progress: { height: 3, marginTop: 6, borderRadius: 2, backgroundColor: theme.color.hairline, overflow: 'hidden' },
  progressFill: { height: 3, backgroundColor: theme.color.accent },
  label: { marginTop: 4, color: theme.color.text, fontFamily: theme.font.mono, fontSize: theme.size.meta },
})
```

Check every `theme.*` key used here exists in `apps/mobile/src/theme.ts` (`scrim`, `hairline`, `accent`, `monoMedium`, `focusScale`, `radius`, `size.meta`); substitute the nearest existing key if one doesn't.

- [ ] **Step 4: Run tests**

Run: `npm test -- ChannelTile && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/tv/ChannelTile.tsx apps/mobile/src/tv/ChannelTile.test.tsx
git commit -m "feat(mobile): live channel tile"
```

---

### Task 6: `TvScreenView` — the TV screen

The screen body, route-free so it's testable: the video, the now-playing bar, the strip, zap-then-settle, the remote, Back, and touch.

**Files:**
- Create: `apps/mobile/src/tv/TvScreenView.tsx`
- Create: `apps/mobile/src/tv/TvScreenView.test.tsx`

**Interfaces:**
- Consumes: `LiveVideo` (Task 4), `ChannelTile` (Task 5), `useLiveNow` (Task 2), `liveKeyAction` (Task 3), `useRemoteKeys`/`useBackPress` (`src/platform/remote.ts`), `usePlayerChrome` (`src/platform/playerChrome.ts`), `stepChannel`/`writeLastChannel` (core), `backAction` (core `playerKeys`).
- Produces:

```ts
export const STRIP_IDLE_MS = 6000
export const ZAP_SETTLE_MS = 600
export const SWIPE_PX = 60
export function TvScreenView(props: {
  lineup: Lineup
  channel: Channel
  siteUrl: string
  imageBase: string
  /** Zaps replace the route: Back leaves the TV screen instead of replaying zaps. */
  onZap: (channelId: string) => void
  onBack: () => void
}): JSX.Element
```

- [ ] **Step 1: Write the failing tests**

```tsx
// apps/mobile/src/tv/TvScreenView.test.tsx
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { memoryStore, setKeyValueStore } from '@go10/core/ports/keyValueStore'
import { readLastChannel, resolveLineup } from '@go10/core/tv/lineup'
import { collectionOf, movieTitle, showTitle } from '@go10/core/tv/testing'
import { TvScreenView, STRIP_IDLE_MS, ZAP_SETTLE_MS } from './TvScreenView'

jest.mock('react-native-webview', () => {
  const React = require('react')
  const { View } = require('react-native')
  return { WebView: React.forwardRef((props: object, ref: unknown) => {
    React.useImperativeHandle(ref, () => ({ injectJavaScript: jest.fn() }))
    return React.createElement(View, props)
  }) }
})
jest.mock('../platform/playerChrome', () => ({ usePlayerChrome: jest.fn() }))
const mockRemote: { key?: (key: string) => void; back?: () => boolean } = {}
jest.mock('../platform/remote', () => ({
  useRemoteKeys: (onKey: (key: string) => void) => { mockRemote.key = onKey },
  useBackPress: (onBack: () => boolean) => { mockRemote.back = onBack },
}))

const EPOCH = Date.parse('2026-10-01T00:00:00Z')
const lineup = resolveLineup(
  {
    epoch: '2026-10-01T00:00:00Z', defaultChannel: 'a',
    channels: [
      { id: 'a', number: 1, collection: 'a' },
      { id: 'b', number: 2, collection: 'b' },
      { id: 'c', number: 3, collection: 'c' },
    ],
  },
  [collectionOf('a', ['s1']), collectionOf('b', ['m1']), collectionOf('c', ['s2'])],
  [showTitle('s1', 6, 600), movieTitle('m1', 5400), showTitle('s2', 6, 900)],
)!
const byId = (id: string) => lineup.channels.find((c) => c.id === id)!

function Harness({ initial, onBack = jest.fn() }: { initial: string; onBack?: () => void }) {
  const React = require('react')
  const [id, setId] = React.useState(initial)
  return <TvScreenView lineup={lineup} channel={byId(id)} siteUrl="https://tv.test/" imageBase="https://tv.test/" onZap={setId} onBack={onBack} />
}

const press = (key: string) => act(() => mockRemote.key!(key))
const webviews = () => screen.queryAllByTestId('live-webview')

beforeEach(() => {
  jest.useFakeTimers({ now: EPOCH + 60_000 })
  setKeyValueStore(memoryStore())
})
afterEach(() => jest.useRealTimers())

describe('TvScreenView', () => {
  it('plays the channel at once on arrival, with nothing over the picture', async () => {
    await render(<Harness initial="a" />)
    expect(webviews()).toHaveLength(1)
    expect(screen.queryByLabelText('Canales')).toBeNull()
    expect(readLastChannel()).toBe('a')
  })

  it('Down zaps to the next channel, black with its number until it settles', async () => {
    await render(<Harness initial="a" />)
    await press('down')
    expect(webviews()).toHaveLength(0)
    expect(screen.getByText('2')).toBeTruthy()
    await act(() => jest.advanceTimersByTime(ZAP_SETTLE_MS))
    expect(webviews()).toHaveLength(1)
    expect(readLastChannel()).toBe('b')
  })

  it('holding Down loads only where it stops', async () => {
    await render(<Harness initial="a" />)
    await press('down')
    await act(() => jest.advanceTimersByTime(ZAP_SETTLE_MS - 100))
    await press('down')
    await act(() => jest.advanceTimersByTime(ZAP_SETTLE_MS - 100))
    expect(webviews()).toHaveLength(0)
    expect(readLastChannel()).toBe('a')
    await act(() => jest.advanceTimersByTime(100))
    expect(webviews()).toHaveLength(1)
    expect(readLastChannel()).toBe('c')
  })

  it('Up from the first channel wraps to the last; CH+ and CH− zap too', async () => {
    await render(<Harness initial="a" />)
    await press('up')
    expect(screen.getByText('3')).toBeTruthy()
    await press('channelUp')
    expect(screen.getByText('1')).toBeTruthy()
  })

  it('Left/Right reveal the strip, focused on the playing channel; it hides after 6 s idle', async () => {
    await render(<Harness initial="b" />)
    await press('right')
    expect(screen.getByLabelText('Canales')).toBeTruthy()
    expect(screen.getByRole('button', { selected: true }).props.accessibilityLabel).toMatch(/^2 /)
    await act(() => jest.advanceTimersByTime(STRIP_IDLE_MS - 1000))
    await press('right') // activity keeps it open
    await act(() => jest.advanceTimersByTime(STRIP_IDLE_MS - 1000))
    expect(screen.getByLabelText('Canales')).toBeTruthy()
    await act(() => jest.advanceTimersByTime(1000))
    expect(screen.queryByLabelText('Canales')).toBeNull()
  })

  it('OK over the bare picture does nothing', async () => {
    await render(<Harness initial="a" />)
    await press('select')
    expect(screen.queryByLabelText('Canales')).toBeNull()
  })

  it('a tile tunes its channel; the playing channel’s tile hides the strip', async () => {
    await render(<Harness initial="a" />)
    await press('right')
    fireEvent.press(screen.getByLabelText(/^1 /))
    expect(screen.queryByLabelText('Canales')).toBeNull()
    await press('right')
    fireEvent.press(screen.getByLabelText(/^3 /))
    await act(() => jest.advanceTimersByTime(ZAP_SETTLE_MS))
    expect(readLastChannel()).toBe('c')
  })

  it('shows the program and what comes next in the bar', async () => {
    await render(<Harness initial="a" />)
    await press('right')
    expect(screen.getByText(/^A continuación: .+ · \d\d:\d\d$/)).toBeTruthy()
  })

  it('Back closes the strip first, then leaves', async () => {
    const onBack = jest.fn()
    await render(<Harness initial="a" onBack={onBack} />)
    await press('right')
    let consumed = false
    await act(() => { consumed = mockRemote.back!() })
    expect(consumed).toBe(true)
    expect(onBack).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Canales')).toBeNull()
    await act(() => { mockRemote.back!() })
    expect(onBack).toHaveBeenCalled()
  })

  it('touch: a tap toggles the strip, a vertical swipe zaps', async () => {
    await render(<Harness initial="a" />)
    const shield = screen.getByTestId('tv-shield')
    fireEvent(shield, 'touchStart', { nativeEvent: { pageX: 100, pageY: 300 } })
    fireEvent(shield, 'touchEnd', { nativeEvent: { pageX: 100, pageY: 300 } })
    expect(screen.getByLabelText('Canales')).toBeTruthy()
    fireEvent(shield, 'touchStart', { nativeEvent: { pageX: 100, pageY: 300 } })
    fireEvent(shield, 'touchEnd', { nativeEvent: { pageX: 100, pageY: 200 } }) // swipe up: next channel
    expect(screen.getByTestId('tv-flash')).toHaveTextContent('2')
  })
})
```

(The zap flash carries `testID="tv-flash"`; assert on it whenever the strip may be open, since the tiles' badges also show channel numbers.)

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -- TvScreenView`
Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// apps/mobile/src/tv/TvScreenView.tsx
import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { StatusBar } from 'expo-status-bar'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native'
import { imageSrc } from '@go10/core/lib/imageSrc'
import { backAction } from '@go10/core/player/playerKeys'
import { clockLabel, programLabel, progressOf } from '@go10/core/tv/describe'
import { stepChannel, writeLastChannel } from '@go10/core/tv/lineup'
import type { Channel, Lineup } from '@go10/core/tv/types'
import { usePlayerChrome } from '../platform/playerChrome'
import { useBackPress, useRemoteKeys } from '../platform/remote'
import { theme } from '../theme'
import { ChannelTile } from './ChannelTile'
import { liveKeyAction } from './liveKeys'
import { LiveVideo } from './LiveVideo'
import { useLiveNow } from './useLiveNow'

const tv = Platform.isTV

export const STRIP_IDLE_MS = 6000
/** A channel loads only once the zapping has stopped this long: each ok.ru load is heavy (the web's leanTv model). */
export const ZAP_SETTLE_MS = 600
/** A touch moving less than this is a tap; more, vertically, is a zap. */
export const SWIPE_PX = 60

/**
 * `/tv/[channel]` (apps/web/src/tv/TvScreen.tsx on TV hardware): one live
 * WebView, nothing over the picture until asked for, a zap that loads only
 * where the zapping stops.
 */
export function TvScreenView({ lineup, channel, siteUrl, imageBase, onZap, onBack }: {
  lineup: Lineup
  channel: Channel
  siteUrl: string
  imageBase: string
  onZap: (channelId: string) => void
  onBack: () => void
}) {
  usePlayerChrome()
  const live = useLiveNow(lineup)
  const [stripOpen, setStripOpen] = useState(false)
  const [activity, bump] = useReducer((n: number) => n + 1, 0)
  const [failed, setFailed] = useState(false)
  const [stalled, setStalled] = useState(false)
  const [soundOn, setSoundOn] = useState(true)

  // The channel actually on air: the arrival plays at once, a zap waits for the zapping to stop.
  const [tuned, setTuned] = useState<Channel | null>(null)
  useEffect(() => {
    if (tuned === null) {
      writeLastChannel(channel.id)
      setTuned(channel)
      return
    }
    if (tuned.id === channel.id) return
    setTuned(null)
    setFailed(false)
    setStalled(false)
    const timer = setTimeout(() => {
      writeLastChannel(channel.id)
      setTuned(channel)
    }, ZAP_SETTLE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id])

  useEffect(() => {
    if (!stripOpen) return
    const timer = setTimeout(() => setStripOpen(false), STRIP_IDLE_MS)
    return () => clearTimeout(timer)
  }, [stripOpen, activity])

  const wake = useCallback(() => {
    setStripOpen(true)
    bump()
  }, [])

  const zap = (step: 1 | -1) => onZap(stepChannel(lineup, channel.id, step).id)

  useRemoteKeys((key) => {
    const action = liveKeyAction(key, open)
    if (!action) return
    if (action.type === 'zap') zap(action.step)
    else if (action.type === 'reveal') wake()
    else bump()
  })

  // A dead signal keeps the channels in view: the way out is a zap.
  const open = stripOpen || failed

  useBackPress(() => {
    if (backAction(stripOpen) === 'closeBar') setStripOpen(false)
    else onBack()
    return true
  })

  // OK on the channel already playing: back to just the picture.
  const onTile = (picked: Channel) => {
    if (picked.id !== channel.id) onZap(picked.id)
    else setStripOpen(false)
  }

  // Touch (phone): a tap shows or hides the strip, a vertical swipe zaps.
  const touch = useRef<{ x: number; y: number } | null>(null)
  const onTouchStart = (event: GestureResponderEvent) => {
    touch.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY }
  }
  const onTouchEnd = (event: GestureResponderEvent) => {
    const start = touch.current
    touch.current = null
    if (!start) return
    const dy = event.nativeEvent.pageY - start.y
    const dx = event.nativeEvent.pageX - start.x
    if (Math.abs(dy) >= SWIPE_PX && Math.abs(dy) > Math.abs(dx)) zap(dy < 0 ? 1 : -1)
    else if (open) setStripOpen(false)
    else wake()
  }

  const schedule = live.get(channel.id)
  const upNext = schedule?.next[0]
  const zapping = tuned?.id !== channel.id

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      {tuned && !zapping && (
        <LiveVideo
          key={tuned.id}
          channel={tuned}
          epochMs={lineup.epochMs}
          siteUrl={siteUrl}
          soundOn={soundOn}
          onFailedChange={setFailed}
          onStalledChange={setStalled}
        />
      )}

      {/* An ad waiting for a tap (phone only; a TV autoplays) lets touches through to the embed. */}
      {!(stalled && !tv) && (
        <View testID="tv-shield" style={StyleSheet.absoluteFill} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} />
      )}

      {zapping && (
        <View testID="tv-flash" style={styles.flash} pointerEvents="none">
          <Text style={styles.flashText}>{channel.number}</Text>
        </View>
      )}

      {open && schedule && (
        <View style={styles.now}>
          <View style={styles.chip}>
            <Image source={{ uri: imageSrc(channel.collection.logo, imageBase) }} style={styles.chipLogo} contentFit="contain" />
            <Text style={styles.chipNumber}>{channel.number}</Text>
          </View>
          <View style={styles.nowText}>
            <Text style={styles.program} numberOfLines={1}>{programLabel(schedule.current.unit)}</Text>
            {upNext && (
              <Text style={styles.next} numberOfLines={1}>{`A continuación: ${programLabel(upNext.unit)} · ${clockLabel(upNext.startsAt)}`}</Text>
            )}
            <View style={styles.progress}>
              <View style={[styles.progressFill, { width: `${Math.round(progressOf(schedule) * 100)}%` }]} />
            </View>
          </View>
          {/* A TV has its own volume keys; a phone gets the web's sound toggle. */}
          {!tv && (
            <Pressable accessibilityRole="button" accessibilityLabel={soundOn ? 'Silenciar' : 'Activar sonido'} onPress={() => setSoundOn(!soundOn)} style={styles.iconBtn}>
              <Ionicons name={soundOn ? 'volume-high' : 'volume-mute'} size={22} color={theme.color.text} />
            </Pressable>
          )}
          {!tv && (
            <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={onBack} style={styles.iconBtn}>
              <Ionicons name="chevron-back" size={22} color={theme.color.text} />
            </Pressable>
          )}
        </View>
      )}

      {open && (
        <View style={styles.strip} accessibilityLabel="Canales" onTouchStart={bump}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.track}>
            {lineup.channels.map((c) => {
              const s = live.get(c.id)
              return s ? (
                <ChannelTile key={c.id} channel={c} schedule={s} imageBase={imageBase} current={c.id === channel.id} preferred={c.id === channel.id} onSelect={onTile} />
              ) : null
            })}
          </ScrollView>
        </View>
      )}

      {stalled && !tv && (
        <View style={styles.tap} pointerEvents="none">
          <Text style={styles.tapText}>Tocá para ver</Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  flash: { ...StyleSheet.absoluteFill, alignItems: 'flex-end', justifyContent: 'flex-start', padding: 32, backgroundColor: '#000' },
  flashText: { color: theme.color.text, fontFamily: theme.font.displayBold, fontSize: 64 },
  now: {
    position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: theme.space.safeX, paddingVertical: 12, backgroundColor: 'rgba(8, 9, 12, 0.85)',
  },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: theme.color.scrim },
  chipLogo: { width: 36, height: 20 },
  chipNumber: { color: theme.color.text, fontFamily: theme.font.monoMedium, fontSize: theme.size.body },
  nowText: { flex: 1, gap: 2 },
  program: { color: theme.color.text, fontFamily: theme.font.displayBold, fontSize: theme.size.body },
  next: { color: theme.color.textMuted, fontFamily: theme.font.mono, fontSize: theme.size.meta },
  progress: { height: 3, marginTop: 4, borderRadius: 2, backgroundColor: theme.color.hairline, overflow: 'hidden' },
  progressFill: { height: 3, backgroundColor: theme.color.accent },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  strip: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: theme.space.safeY, backgroundColor: 'rgba(8, 9, 12, 0.85)' },
  track: { paddingHorizontal: theme.space.safeX, paddingVertical: 12, gap: theme.space.gap },
  tap: { position: 'absolute', top: '45%', alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: theme.color.scrim },
  tapText: { color: theme.color.text, fontFamily: theme.font.mono, fontSize: theme.size.meta },
})
```

Notes for the implementer:
- `open` is used inside the `useRemoteKeys` callback before its `const` line; `useRemoteKeys` stores the callback and calls it later, so it reads the current render's value. Move the `const open` line above `useRemoteKeys` anyway for readability.
- The bar and strip render only while open, so on TV the strip mounts with `hasTVPreferredFocus` on the playing channel and the focus engine moves along it with Left/Right; with it closed there's nothing focusable and every key comes to `useRemoteKeys`.
- The settle model means `ZAP_FLASH_MS` and the web's "static" texture don't exist here; the flash is the black screen with the number.

- [ ] **Step 4: Run tests**

Run: `npm test -- TvScreenView && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/tv/TvScreenView.tsx apps/mobile/src/tv/TvScreenView.test.tsx
git commit -m "feat(mobile): live TV screen — zapping, channel strip, remote and touch"
```

---

### Task 7: Routes `/tv` and `/tv/[channel]`

**Files:**
- Create: `apps/mobile/src/app/tv/index.tsx`
- Create: `apps/mobile/src/app/tv/[channel].tsx`
- Create: `apps/mobile/src/tv/useTvRoute.ts`, `apps/mobile/src/tv/useTvRoute.test.ts`
- Modify: `apps/mobile/src/app/_layout.tsx`
- Modify: `apps/mobile/src/browse/navigate.ts`

**Interfaces:**
- Consumes: `useCatalog` (`src/data/CatalogProvider`), `useLineup` (Task 2), `pickChannel` (core), `TvScreenView` (Task 6).
- Produces: `tvTarget(lineup: Lineup | null, requested: string | null): { kind: 'home' } | { kind: 'redirect'; channelId: string } | { kind: 'show'; channel: Channel }`; `openTv(channelId?: string): void` in `browse/navigate.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/src/tv/useTvRoute.test.ts
import { memoryStore, setKeyValueStore } from '@go10/core/ports/keyValueStore'
import { resolveLineup, writeLastChannel } from '@go10/core/tv/lineup'
import { collectionOf, showTitle } from '@go10/core/tv/testing'
import { tvTarget } from './useTvRoute'

const lineup = resolveLineup(
  { epoch: '2026-10-01T00:00:00Z', defaultChannel: 'b', channels: [{ id: 'a', number: 1, collection: 'a' }, { id: 'b', number: 2, collection: 'b' }] },
  [collectionOf('a', ['s1']), collectionOf('b', ['s2'])],
  [showTitle('s1', 3, 600), showTitle('s2', 3, 600)],
)!

beforeEach(() => setKeyValueStore(memoryStore()))

describe('tvTarget', () => {
  it('no lineup: home', () => expect(tvTarget(null, 'a')).toEqual({ kind: 'home' }))
  it('/tv: the last channel, else the default', () => {
    expect(tvTarget(lineup, null)).toEqual({ kind: 'redirect', channelId: 'b' })
    writeLastChannel('a')
    expect(tvTarget(lineup, null)).toEqual({ kind: 'redirect', channelId: 'a' })
  })
  it('/tv/<known>: that channel', () => expect(tvTarget(lineup, 'a')).toMatchObject({ kind: 'show', channel: { id: 'a' } }))
  it('/tv/<unknown>: picks a channel as /tv does', () => expect(tvTarget(lineup, 'zzz')).toEqual({ kind: 'redirect', channelId: 'b' }))
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- useTvRoute`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// apps/mobile/src/tv/useTvRoute.ts
import { pickChannel } from '@go10/core/tv/lineup'
import type { Channel, Lineup } from '@go10/core/tv/types'

export type TvTarget = { kind: 'home' } | { kind: 'redirect'; channelId: string } | { kind: 'show'; channel: Channel }

/** Where a TV route lands: the requested channel, else (for /tv or an unknown id) the last one or the default. */
export function tvTarget(lineup: Lineup | null, requested: string | null): TvTarget {
  if (!lineup) return { kind: 'home' }
  const channel = requested ? pickChannel(lineup, requested) : null
  if (channel) return { kind: 'show', channel }
  const fallback = pickChannel(lineup, null)
  return fallback ? { kind: 'redirect', channelId: fallback.id } : { kind: 'home' }
}
```

`apps/mobile/src/app/tv/[channel].tsx`:

```tsx
import { Redirect, router, useLocalSearchParams } from 'expo-router'
import { LoadingScreen } from '../../components/LoadingScreen'
import { appExtra, siteBase } from '../../config/appConfig'
import { useCatalog } from '../../data/CatalogProvider'
import { TvScreenView } from '../../tv/TvScreenView'
import { tvTarget } from '../../tv/useTvRoute'
import { useLineup } from '../../tv/useLineup'

const siteUrl = siteBase(appExtra().siteUrl)

export default function TvChannelScreen() {
  const { channel } = useLocalSearchParams<{ channel: string }>()
  const { state } = useCatalog()
  const lineup = useLineup(state.status === 'ready' ? state.data : null)
  if (state.status === 'loading') return <LoadingScreen />
  const target = tvTarget(lineup, channel ?? null)
  if (target.kind === 'home') return <Redirect href="/" />
  if (target.kind === 'redirect') return <Redirect href={{ pathname: '/tv/[channel]', params: { channel: target.channelId } }} />
  return (
    <TvScreenView
      lineup={lineup!}
      channel={target.channel}
      siteUrl={siteUrl}
      imageBase={siteUrl}
      // Same screen, new channel: Back still leaves TV instead of replaying every zap.
      onZap={(id) => router.setParams({ channel: id })}
      onBack={() => router.back()}
    />
  )
}
```

`apps/mobile/src/app/tv/index.tsx`:

```tsx
import { Redirect } from 'expo-router'
import { LoadingScreen } from '../../components/LoadingScreen'
import { useCatalog } from '../../data/CatalogProvider'
import { tvTarget } from '../../tv/useTvRoute'
import { useLineup } from '../../tv/useLineup'

/** `/tv`: the last channel watched, else the default. */
export default function TvIndex() {
  const { state } = useCatalog()
  const lineup = useLineup(state.status === 'ready' ? state.data : null)
  if (state.status === 'loading') return <LoadingScreen />
  const target = tvTarget(lineup, null)
  if (target.kind !== 'redirect') return <Redirect href="/" />
  return <Redirect href={{ pathname: '/tv/[channel]', params: { channel: target.channelId } }} />
}
```

`_layout.tsx`: add `<Stack.Screen name="tv/[channel]" options={{ animation: 'fade', contentStyle: { backgroundColor: '#000' } }} />` beside the play screen.

`browse/navigate.ts`:

```ts
/** The live TV screen, on `channelId` or (without one) the last channel watched. */
export function openTv(channelId?: string): void {
  if (channelId) router.push({ pathname: '/tv/[channel]', params: { channel: channelId } })
  else router.push('/tv')
}
```

Check: `/tv` as a pushed route then `<Redirect>` replaces it, so Back from `/tv/a` lands on Home, not on `/tv` (expo-router's `Redirect` uses replace). Verify on device in Task 9.

- [ ] **Step 4: Run tests**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/app/tv apps/mobile/src/app/_layout.tsx apps/mobile/src/tv/useTvRoute* apps/mobile/src/browse/navigate.ts
git commit -m "feat(mobile): /tv routes"
```

---

### Task 8: Entry points — the navbar "TV" item and Home's "En vivo ahora"

**Files:**
- Create: `apps/mobile/src/tv/LiveRow.tsx`, `apps/mobile/src/tv/LiveRow.test.tsx`
- Modify: `apps/mobile/src/components/Navbar.tsx`, `apps/mobile/src/components/Navbar.test.tsx`
- Modify: `apps/mobile/src/components/HomeView.tsx`, `apps/mobile/src/components/HomeView.test.tsx`
- Modify: `apps/mobile/src/components/HomeContent.tsx` (thread `lineup` and `onWatchChannel` through), `apps/mobile/src/app/index.tsx`
- Modify: every other `<Navbar` caller (`grep -rn "<Navbar" apps/mobile/src`)

**Interfaces:**
- Consumes: `ChannelTile` (Task 5), `useLiveNow` (Task 2), `useLineup` (Task 2), `openTv` (Task 7).
- Produces: `LiveRow({ lineup, imageBase, onWatch }: { lineup: Lineup; imageBase: string; onWatch: (channelId: string) => void })`; `Navbar` prop `onTv?: () => void` (the item shows only when given); `homeSections(model, continueCount, hasLive)` with a `{ kind: 'live' }` section right after `strip`; `HomeView` props `lineup: Lineup | null`, `onWatchChannel: (channelId: string) => void`.

- [ ] **Step 1: Write the failing tests**

`LiveRow.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native'
import { resolveLineup } from '@go10/core/tv/lineup'
import { collectionOf, showTitle } from '@go10/core/tv/testing'
import { LiveRow } from './LiveRow'

const lineup = resolveLineup(
  { epoch: '2026-10-01T00:00:00Z', defaultChannel: 'a', channels: [{ id: 'a', number: 1, collection: 'a' }, { id: 'b', number: 2, collection: 'b' }] },
  [collectionOf('a', ['s1']), collectionOf('b', ['s2'])],
  [showTitle('s1', 3, 600), showTitle('s2', 3, 600)],
)!

it('lists every channel under "En vivo ahora", and a tile watches it', async () => {
  const onWatch = jest.fn()
  await render(<LiveRow lineup={lineup} imageBase="https://tv.test/" onWatch={onWatch} />)
  expect(screen.getByText('En vivo ahora')).toBeTruthy()
  fireEvent.press(screen.getByLabelText(/^2 /))
  expect(onWatch).toHaveBeenCalledWith('b')
})
```

`Navbar.test.tsx` — add:

```tsx
it('shows a TV item only when TV is on the air', async () => {
  const onTv = jest.fn()
  await render(<Navbar section="all" onSection={jest.fn()} onSearch={jest.fn()} onTv={onTv} />)
  fireEvent.press(screen.getByLabelText('TV en vivo'))
  expect(onTv).toHaveBeenCalled()
})
it('has no TV item without channels', async () => {
  await render(<Navbar section="all" onSection={jest.fn()} onSearch={jest.fn()} />)
  expect(screen.queryByLabelText('TV en vivo')).toBeNull()
})
```

`HomeView.test.tsx` — add (reuse the file's model fixture):

```ts
it('puts "En vivo ahora" right after the collection strip when channels are on the air', () => {
  expect(homeSections(model, 0, true).slice(0, 2)).toEqual([{ kind: 'strip' }, { kind: 'live' }])
  expect(homeSections(model, 0, false).some((s) => s.kind === 'live')).toBe(false)
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -- LiveRow Navbar HomeView`
Expected: FAIL.

- [ ] **Step 3: Implement**

`apps/mobile/src/tv/LiveRow.tsx` (Row's look, `Row.tsx`'s focus guide):

```tsx
import { ScrollView, StyleSheet, Text, TVFocusGuideView, View } from 'react-native'
import type { Lineup } from '@go10/core/tv/types'
import { theme } from '../theme'
import { ChannelTile } from './ChannelTile'
import { useLiveNow } from './useLiveNow'

/** Home's "En vivo ahora": every channel and what it's airing, one press from tuning in. */
export function LiveRow({ lineup, imageBase, onWatch }: { lineup: Lineup; imageBase: string; onWatch: (channelId: string) => void }) {
  const live = useLiveNow(lineup)
  return (
    <View style={styles.row}>
      <View style={styles.heading}>
        <View style={styles.dot} />
        <Text accessibilityRole="header" style={styles.label}>En vivo ahora</Text>
      </View>
      <TVFocusGuideView autoFocus>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.track}>
          {lineup.channels.map((channel) => {
            const schedule = live.get(channel.id)
            return schedule ? <ChannelTile key={channel.id} channel={channel} schedule={schedule} imageBase={imageBase} onSelect={(c) => onWatch(c.id)} /> : null
          })}
        </ScrollView>
      </TVFocusGuideView>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { marginBottom: theme.space.rowGap },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: theme.space.safeX, marginBottom: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#e50914' },
  label: { color: theme.color.text, fontFamily: theme.font.displayBold, fontSize: theme.size.section },
  track: { paddingHorizontal: theme.space.safeX, paddingVertical: 10, gap: theme.space.gap },
})
```

`Navbar.tsx`: add `onTv?: () => void`; render, after the section links:

```tsx
{onTv && (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel="TV en vivo"
    onPress={onTv}
    style={({ focused }) => [styles.link, styles.tvLink, focused && styles.linkFocused]}
  >
    {({ focused }) => (
      <>
        <View style={styles.liveDot} />
        <Text style={[styles.linkText, focused && styles.onAccent]}>TV</Text>
      </>
    )}
  </Pressable>
)}
```

with `tvLink: { flexDirection: 'row', alignItems: 'center', gap: 6 }` and `liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#e50914' }`.

`HomeView.tsx`:

```ts
type Section = { kind: 'strip' } | { kind: 'live' } | { kind: 'continue' } | { kind: 'row'; index: number }

export function homeSections(model: HomeModel, continueCount = 0, hasLive = false): Section[] {
  return [
    ...(model.strip.length > 0 ? [{ kind: 'strip' } as const] : []),
    ...(hasLive ? [{ kind: 'live' } as const] : []),
    ...(continueCount > 0 ? [{ kind: 'continue' } as const] : []),
    ...model.rows.map((_, index) => ({ kind: 'row', index }) as const),
  ]
}
```

New props `lineup: Lineup | null` and `onWatchChannel: (channelId: string) => void`; `homeSections(model, continueItems.length, lineup !== null)`; in `renderItem`: `if (item.kind === 'live') return <LiveRow lineup={lineup!} imageBase={imageBase} onWatch={onWatchChannel} />`; pass `onTv={lineup ? () => openTvFromHome() : undefined}` to `<Navbar>` — add a prop `onOpenTv: () => void` to HomeView rather than importing navigation into the view. Then in `HomeContent.tsx` thread `lineup` (via `useLineup(state.status === 'ready' ? state.data : null)`) and the two callbacks, and in `app/index.tsx` pass `onWatchChannel={openTv}` and `onOpenTv={() => openTv()}`. Do the same `onTv` wiring for the section/search screens that render `<Navbar>` (`SectionScreen.tsx`, etc.) using `useCatalog` + `useLineup`.

- [ ] **Step 4: Run tests**

Run: `npm test && npm run typecheck`
Expected: PASS (fix existing HomeView/HomeContent tests for the new required props by passing `lineup={null}` and `jest.fn()`s).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src
git commit -m "feat(mobile): TV entry points — navbar item and En vivo ahora row"
```

---

### Task 9: On-device verification and docs

Manual: the WebView's sound, focus and timing behaviors can't be unit-tested.

**Files:**
- Create: `docs/android-live-tv-checklist.md`
- Modify: `README.md` (Android app section + the Live TV remote table)

- [ ] **Step 1: Deploy the web build with Task 1** (or point the app at a local build: `GO10_SITE_URL=http://<lan-ip>:4173 npx expo start` after `npm run build && npx vite preview --host -w apps/web`).

- [ ] **Step 2: Write the checklist**

```markdown
# Live TV on Android: checklist (Android TV box + a phone)

## Sound and picture
- [ ] A channel plays **with sound** from the start (unmute + volume after load). If silent: note whether ok.ru's own mute icon shows; try posting the sound messages again after the first `timeupdate`.
- [ ] No ok.ru title or control bar peeks out at 1080p (`OKRU_CHROME_PX`, 64 today) — and on a phone in landscape.
- [ ] Nothing covers the picture while it plays.
- [ ] The screen doesn't dim or sleep after 10+ minutes of TV (if it does: add `expo-keep-awake` to the TV screen).

## Remote (Android TV)
- [ ] Up/Down and CH+/CH− zap; holding Down loads only where it stops (black with the number meanwhile).
- [ ] Left/Right bring the strip, focused on the playing channel; Left/Right then move along it; it hides after 6 s.
- [ ] OK while watching does nothing; OK on the playing tile hides the strip; OK on another tile tunes it.
- [ ] Info shows the strip.
- [ ] Back with the strip open closes it; Back again returns to Home (not to `/tv`, not through every zap).
- [ ] Back still works after the channel has loaded and after several zaps (the WebView never takes focus).
- [ ] Play/Pause, FF/RW do nothing.

## Phone
- [ ] `/tv` turns landscape and immersive; leaving restores portrait and the system bars.
- [ ] A tap shows the strip and bar; another tap hides them; a vertical swipe zaps (up = next).
- [ ] The sound button mutes and unmutes.
- [ ] Locking and unlocking the phone rejoins the live second.

## Failure paths
- [ ] Airplane mode on a channel: "Reconectando…", then "Señal interrumpida" with the strip open; zapping still works.
- [ ] A site without `data/channels.json`: no TV item, no En vivo ahora row, no crash.

## Sync
- [ ] The same channel on the web and on the TV shows the same program within a few seconds.
```

- [ ] **Step 3: Build, install and run the checklist**

```bash
cd apps/mobile
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
npm run prebuild
cd android && ./gradlew app:assembleDebug -PreactNativeArchitectures=arm64-v8a && cd ..
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb reverse tcp:8081 tcp:8081 && npx expo start
```

Tick the checklist; fix and commit anything that fails as its own `fix(mobile): …` commit before moving on.

- [ ] **Step 4: Update the README**

In "Android app (apps/mobile)", add a paragraph:

```markdown
Live TV (`/tv`) is in the app too, fetched from the site's `data/channels.json`
(the web build publishes it), so every device airs the same schedule. It runs
the TV model on both TVs and phones: one embed, no previews, no mini-player,
and a zap loads only once the zapping stops. Up/Down and CH+/CH− zap,
Left/Right bring the channel strip, Info shows it, Back closes it then
leaves. Number keys, PRE-CH and CH LIST don't reach a React Native app
(react-native-tvos forwards only the D-pad, media, Info, Menu and channel
keys). On a phone, tap for the strip and swipe up/down to zap.
```

- [ ] **Step 5: Commit**

```bash
git add docs/android-live-tv-checklist.md README.md
git commit -m "docs: live TV on Android — README and on-device checklist"
```

---

## Out of scope (later)

- **Number keys, PRE-CH, CH LIST on Android TV.** react-native-tvos doesn't forward them to JS; supporting them means a native `onKeyDown` hook in `MainActivity` (an Expo config plugin + a small event module). Worth its own plan if the remote has them and they're missed.
- **Preload, hover preview, mini-player** on Android: the spec's TV builds drop them; a phone could later get a mini-player via a root-level WebView host, but RN offers no equivalent of the web's never-moving iframe for free.
- A **TV button on Detail** ("en vivo en canal 3") and an EPG grid.

## Self-review notes

- Spec coverage: schedule/session/labels reused from core (§2–3); retry + "Señal interrumpida" + boundary retune (§4) in Task 4; routes and last channel (§5 Routes) in Task 7; strip, bar, zap, keys, Back (§5 Anatomy/Controls, as amended by `3d6fc3b`/`b78c3f0`: nothing over the picture until asked for) in Task 6; entry points (§5) in Task 8; hidden-tab/wake (§6) in Task 4 via `AppState`; ended-early card (§6) in Task 4; no progress writes (§1 decisions) — nothing in these tasks calls `progressStore`.
- Dropped deliberately, per §8 and the Tizen model: preload, preview, mini-player, fullscreen button (an Android app is already fullscreen), "Ver ficha" (removed on the web in `d49cc7d`).
```
