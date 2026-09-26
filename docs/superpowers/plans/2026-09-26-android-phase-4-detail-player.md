# Android Phase 4 — Detail + Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The title's Detail screen (seasons, episodes, Reproducir/Reanudar, progress bars) and the real player (ok.ru + vidlove in a WebView host page, progress, resume, prev/next, auto-advance, the TV key map), so a person can play → Back → relaunch → resume.

**Architecture:** Playback bookkeeping that the web keeps inside its Player component (resume, 5 s saves, chapter end, `ended`, chapter switching) becomes a pure, tested `createPlaybackSession` in `packages/core`; the web Player is not rewired in this phase (it works, and the session's tests encode its behaviour). The mobile app adds pure helpers (host page, navigation guard, key map), a `PlayerView` built on `react-native-webview`, a `DetailView`, and two expo-router routes. Episode changes inside the player use `router.setParams`, so one screen instance (and one session) lives for the whole viewing.

**Tech Stack:** Expo SDK 57, react-native-tvos 0.86, expo-router, react-native-webview 13.16.1, expo-image, expo-linear-gradient, @expo/vector-icons; Jest + RNTL 14 (mobile), Vitest (core, web).

**Spec:** `docs/superpowers/specs/2026-09-26-android-app-design.md` (Phase 4 row; sections *Player*, *TV focus*, *Error handling*). Phase 0 findings: `docs/superpowers/spikes/2026-09-26-android-player-spike.md`.

## Global Constraints

- Playback stays on the third-party iframe embeds (ok.ru, vidlove). No stream extraction, no native video player.
- Host page: inline HTML with `baseUrl: SITE_URL` (`https://tv.go10.blog`).
- Navigation guard: allow sub-frame loads (`isTopFrame === false`); allow top-frame only for `SITE_URL` / `about:blank`; `setSupportMultipleWindows={false}`.
- WebView: `mediaPlaybackRequiresUserAction={false}`, `allowsFullscreenVideo`, `focusable={false}` on TV.
- Resume: ok.ru via `fromTime` in the URL; vidlove seeks on first `time` event. Progress saved at most every 5 s and on pause and close, plus on app background (`AppState`).
- `ended` → auto-advance to the next episode; chapter-end handling; the retry reducer and 8 s load timeout; fallback link via `Linking.openURL`.
- ok.ru play/pause is `{action: 'play'|'pause'}`; vidlove has **no** play/pause (disabled); seek `{type:'seek', time}`.
- TV keys: Play/Pause toggles; FF/RW seek ±10 s from the last reported time; D-pad Left/Right with the bar hidden seek ±10 s; Select or Up with the bar hidden open the bar (back, prev, play/pause, next) and focus moves into it; Back closes the bar, else leaves the player.
- Back arrives via `BackHandler`; other keys via `useTVEventHandler` (`right`, `left`, `select`, `playPause`, `fastForward`, `rewind`).
- Progress in MMKV with the same keys and formats as the web (core's `progressStore`, unchanged).
- Each screen declares initial focus with `hasTVPreferredFocus`: Detail → Play/Reanudar.
- Unknown route / missing key → Home.
- Faithful port of the web UI (Spanish copy verbatim: "Reproducir", "Reanudar", "Volver", "Reconectando…", "No se pudo reproducir aquí.", "Episodios", "Visto", "Quedan …").
- Out of scope here (Phase 7): phone landscape lock and immersive mode. Out of scope (Phase 6): TMDB titles reachable from the UI (the vidlove path is built and unit-tested, not reachable yet).
- Testing is on the user's phone only; TV items go to `docs/superpowers/tv-checklist.md`.

## Review Focus

1. **A chaptered file played past its chapter end with no next chapter** — `onEnded` fires once and the chapter stays "Visto"; later `timeupdate`s must not overwrite it with an unwatched entry. Pinned in Task 1 (`chapter end marks watched once and stops saving`).
2. **Android TV reports every press as a key-down and a key-up** (`ReactAndroidHWInputDeviceHelper.kt` dispatches both) — one press must act once (one 10 s seek, not two). Pinned in Task 3 (`remoteKey` tests).
3. **vidlove's ad redirects and look-alike hosts** (`https://tv.go10.blog.evil.example`) — top-frame navigation away from the host page is refused. Pinned in Task 3 (`allowNavigation`).
4. **Next episode in another file vs. the next chapter of the same file** — another file reloads the WebView; a chapter seeks the loaded embed without reloading. Pinned in Task 4 (`a chapter of the same file seeks instead of reloading`).
5. **Back from the player after autoplay moved on** — Detail's Play/Reanudar and season follow what was just watched, not what was selected before playing. Pinned in Task 5 (`follows what was played while away`).

---

### Task 1: Core playback session

**Files:**
- Modify: `packages/core/src/player/providers/types.ts`
- Modify: `packages/core/src/player/providers/okru.ts`
- Create: `packages/core/src/player/playbackSession.ts`
- Test: `packages/core/src/player/playbackSession.test.ts`

**Interfaces:**
- Consumes: `providerFor(row)`, `EmbedProvider` (`providers/index.ts`); `readProgress`, `writeProgress`, `markWatched`, `resumeFromTime` (`progress/progressStore.ts`); `rowKey`.
- Produces:
  - `EmbedProvider.playMessage?: unknown`, `EmbedProvider.pauseMessage?: unknown` (ok.ru sets both; vidlove neither).
  - `LOAD_TIMEOUT_MS = 8000`, `PROGRESS_SAVE_INTERVAL_MS = 5000`
  - `playbackStart(row: CatalogRow): number | null`
  - `createPlaybackSession(options: { send(command: unknown): void; onEnded(): void; onPlayingChange?(playing: boolean): void; now?(): number }): PlaybackSession`
  - `interface PlaybackSession { load(row): string; select(row): void; handle(data: unknown): void; flush(): void; seekBy(delta: number): void; togglePlay(): void; canTogglePlay(): boolean }`

- [ ] **Step 1: Write the failing test**

`packages/core/src/player/playbackSession.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CatalogRow } from '../types'
import { readProgress, writeProgress, markWatched } from '../progress/progressStore'
import { createPlaybackSession, playbackStart } from './playbackSession'

const base = {
  catalog_index: 0, title: 'T', title_raw: 'T', series_id: '', series_title: '', season_label: '', year: null,
  studio: '', source: '', genre: '', genre_secondary: '', quality: '', language: '', subtitled: false,
  duration_raw: '', views: 0, thumbnail: '', video_url: '', chapter_start_seconds: null, chapter_end_seconds: null,
}
const movie: CatalogRow = {
  ...base, video_id: 'm1', type: 'movie', season_number: null, episode_number: null, duration_seconds: 700,
  embed_url: 'https://ok.ru/videoembed/1',
}
const chapter = (n: number, start: number, end: number): CatalogRow => ({
  ...base, video_id: 'f9', type: 'episode', season_number: 1, episode_number: n,
  chapter_start_seconds: start, chapter_end_seconds: end, duration_seconds: end - start,
  embed_url: 'https://ok.ru/videoembed/9',
})
const tmdb: CatalogRow = {
  ...base, video_id: 'tmdb-movie-155', type: 'movie', season_number: null, episode_number: null, duration_seconds: 0,
  embed_url: 'https://player.vidlove.cc/embed/movie/155', external: true,
}
const okTime = (time: number, duration = 700) => ({ event: 'timeupdate', time, duration })
const vidTime = (currentTime: number) => ({
  type: 'PLAYER_EVENT', data: { event: 'timeupdate', currentTime, duration: 2900, tmdbId: 155, mediaType: 'movie' },
})

let clock = 0
function setup() {
  const sent: unknown[] = []
  const onEnded = vi.fn()
  const onPlayingChange = vi.fn()
  const session = createPlaybackSession({ send: (c) => sent.push(c), onEnded, onPlayingChange, now: () => clock })
  return { session, sent, onEnded, onPlayingChange }
}

beforeEach(() => {
  localStorage.clear()
  clock = 100_000
})

describe('playbackStart', () => {
  it('resumes a saved position, else starts a chapter at its own start, else at the top', () => {
    writeProgress('m1', { time: 120, duration: 700 })
    expect(playbackStart(movie)).toBe(117)
    expect(playbackStart(chapter(2, 600, 1200))).toBe(600)
    expect(playbackStart(chapter(1, 0, 600))).toBeNull()
    markWatched('m1', 700)
    expect(playbackStart(movie)).toBeNull()
  })
})

describe('createPlaybackSession', () => {
  it('opens ok.ru at the resume point through the URL', () => {
    writeProgress('m1', { time: 120, duration: 700 })
    const { session, sent } = setup()
    expect(session.load(movie)).toBe('https://ok.ru/videoembed/1?autoplay=1&fromTime=117')
    session.handle(okTime(117))
    expect(sent).toEqual([])
  })

  it('resumes vidlove with one seek on its first time event', () => {
    writeProgress('tmdb-movie-155', { time: 300, duration: 2900 })
    const { session, sent } = setup()
    expect(session.load(tmdb)).not.toContain('fromTime')
    session.handle(vidTime(1))
    session.handle(vidTime(2))
    expect(sent).toEqual([{ type: 'seek', time: 297 }])
  })

  it('saves at most every 5 s, and always on pause', () => {
    const { session } = setup()
    session.load(movie)
    session.handle(okTime(20))
    expect(readProgress('m1')?.time).toBe(20)
    clock += 2000
    session.handle(okTime(30))
    expect(readProgress('m1')?.time).toBe(20)
    session.handle({ event: 'paused' })
    expect(readProgress('m1')?.time).toBe(30)
  })

  it('flush saves the latest position', () => {
    const { session } = setup()
    session.load(movie)
    session.handle(okTime(20))
    clock += 1000
    session.handle(okTime(40))
    session.flush()
    expect(readProgress('m1')?.time).toBe(40)
  })

  it('ended marks the row watched and advances once', () => {
    const { session, onEnded } = setup()
    session.load(movie)
    session.handle(okTime(650))
    session.handle({ event: 'ended', time: 700 })
    session.handle({ event: 'ended', time: 700 })
    expect(readProgress('m1')?.watched).toBe(true)
    expect(onEnded).toHaveBeenCalledTimes(1)
  })

  it('chapter end marks watched once and stops saving', () => {
    const { session, onEnded } = setup()
    session.load(chapter(1, 0, 600))
    session.handle(okTime(601, 1200))
    clock += 10_000
    session.handle(okTime(605, 1200))
    session.flush()
    expect(readProgress('f9:1')?.watched).toBe(true)
    expect(onEnded).toHaveBeenCalledTimes(1)
  })

  it('selecting another chapter of the same file saves the outgoing one and seeks', () => {
    const { session, sent } = setup()
    session.load(chapter(1, 0, 600))
    session.handle(okTime(20, 1200))
    clock += 1000
    session.handle(okTime(300, 1200))
    session.select(chapter(2, 600, 1200))
    expect(readProgress('f9:1')?.time).toBe(300)
    expect(sent).toEqual([{ action: 'seek', time: 600 }])
    session.handle(okTime(610, 1200))
    expect(readProgress('f9:2')?.time).toBe(610)
  })

  it('selecting the same row, or a row of another file, sends nothing', () => {
    const { session, sent } = setup()
    session.load(chapter(1, 0, 600))
    session.select(chapter(1, 0, 600))
    session.select(movie)
    expect(sent).toEqual([])
  })

  it('seeks by steps from the last reported time, within the video', () => {
    const { session, sent } = setup()
    session.load(movie)
    session.handle(okTime(100))
    session.seekBy(10)
    session.seekBy(10)
    session.seekBy(-500)
    session.handle(okTime(695))
    session.seekBy(10)
    expect(sent).toEqual([
      { action: 'seek', time: 110 },
      { action: 'seek', time: 120 },
      { action: 'seek', time: 0 },
      { action: 'seek', time: 699 },
    ])
  })

  it('toggles ok.ru between pause and play, reporting the playing state', () => {
    const { session, sent, onPlayingChange } = setup()
    session.load(movie)
    expect(session.canTogglePlay()).toBe(true)
    session.handle(okTime(50))
    session.togglePlay()
    session.togglePlay()
    expect(sent).toEqual([{ action: 'pause' }, { action: 'play' }])
    expect(onPlayingChange.mock.calls).toEqual([[true], [false], [true]])
  })

  it('cannot toggle vidlove, which has no play/pause command', () => {
    const { session, sent } = setup()
    session.load(tmdb)
    session.handle(vidTime(5))
    expect(session.canTogglePlay()).toBe(false)
    session.togglePlay()
    expect(sent).toEqual([])
  })

  it('ignores everything before a row is loaded', () => {
    const { session, sent, onEnded } = setup()
    session.handle(okTime(50))
    session.seekBy(10)
    session.flush()
    expect(sent).toEqual([])
    expect(onEnded).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @go10/core -- src/player/playbackSession.test.ts`
Expected: FAIL — cannot resolve `./playbackSession`.

- [ ] **Step 3: Write minimal implementation**

In `packages/core/src/player/providers/types.ts`, add to `EmbedProvider` after `seekMessage`:

```ts
  /** Resume/pause commands; absent when the embed has none (vidlove). */
  playMessage?: unknown
  pauseMessage?: unknown
```

In `packages/core/src/player/providers/okru.ts`, after `seekMessage`:

```ts
  playMessage: { action: 'play' },
  pauseMessage: { action: 'pause' },
```

and extend its doc comment's last line to: `accepts {action: 'seek', time} and {action: 'play' | 'pause'}.`

`packages/core/src/player/playbackSession.ts`:

```ts
import type { CatalogRow } from '../types'
import { rowKey } from '../catalog/rowKey'
import { markWatched, readProgress, resumeFromTime, writeProgress } from '../progress/progressStore'
import { providerFor, type EmbedProvider } from './providers/index'

/** How long to wait for the embed before treating it as a load failure. */
export const LOAD_TIMEOUT_MS = 8000

/** `timeupdate` fires several times a second; storage only needs a few. */
export const PROGRESS_SAVE_INTERVAL_MS = 5000

/** Where `row` starts: its saved position, else its chapter's own start, else the top (null). */
export function playbackStart(row: CatalogRow): number | null {
  const resumeAt = resumeFromTime(readProgress(rowKey(row)))
  if (resumeAt !== null) return resumeAt
  return row.chapter_start_seconds && row.chapter_start_seconds > 0 ? row.chapter_start_seconds : null
}

export interface PlaybackSession {
  /** Start `row`'s file: saves where the previous one got to, returns the embed src. */
  load(row: CatalogRow): string
  /** The row changed without a reload: another chapter of the loaded file seeks to its start. */
  select(row: CatalogRow): void
  /** A raw message from the embed. */
  handle(data: unknown): void
  flush(): void
  seekBy(delta: number): void
  togglePlay(): void
  canTogglePlay(): boolean
}

/**
 * The web Player's playback bookkeeping (apps/web/src/screens/Player.tsx),
 * free of any UI: the embed's own reports drive progress, never a clock.
 * `send` posts a command to the embed; `onEnded` fires once per row when it
 * finishes (the file's `ended`, or its chapter's end time).
 */
export function createPlaybackSession({ send, onEnded, onPlayingChange, now = Date.now }: {
  send: (command: unknown) => void
  onEnded: () => void
  onPlayingChange?: (playing: boolean) => void
  now?: () => number
}): PlaybackSession {
  let row: CatalogRow | null = null
  let provider: EmbedProvider | null = null
  let position: { key: string; time: number; duration: number } | null = null
  // Kept apart from `position` so seeking still works after a save clears it.
  let lastTime = 0
  let lastDuration = 0
  let lastSave = 0
  let pendingSeek: number | null = null
  let playing = false
  let ended = false

  function setPlaying(value: boolean) {
    if (value === playing) return
    playing = value
    onPlayingChange?.(value)
  }

  function flush() {
    if (!position) return
    writeProgress(position.key, position, now())
    lastSave = now()
  }

  function finish(current: CatalogRow, duration: number) {
    ended = true
    setPlaying(false)
    markWatched(rowKey(current), duration, now())
    position = null
    onEnded()
  }

  return {
    load(next) {
      flush()
      row = next
      provider = providerFor(next)
      position = null
      ended = false
      setPlaying(false)
      const start = playbackStart(next)
      lastTime = start ?? 0
      lastDuration = 0
      pendingSeek = provider.resumesViaUrl ? null : start
      return provider.src(next, provider.resumesViaUrl ? start : null)
    },

    select(next) {
      if (!row || !provider || next.video_id !== row.video_id || rowKey(next) === rowKey(row)) return
      flush()
      row = next
      position = null
      ended = false
      lastTime = next.chapter_start_seconds ?? 0
      send(provider.seekMessage(lastTime))
    },

    handle(data) {
      if (!row || !provider) return
      const event = provider.parse(data, row)
      if (!event || ended) return

      if (event.kind === 'time') {
        setPlaying(true)
        lastTime = event.time
        lastDuration = event.duration
        position = { key: rowKey(row), time: event.time, duration: event.duration }
        if (pendingSeek !== null) {
          send(provider.seekMessage(pendingSeek))
          lastTime = pendingSeek
          pendingSeek = null
        }
        if (now() - lastSave >= PROGRESS_SAVE_INTERVAL_MS) flush()
        const chapterEnd = row.chapter_end_seconds
        if (chapterEnd != null && event.time >= chapterEnd) finish(row, row.duration_seconds)
      } else if (event.kind === 'paused') {
        setPlaying(false)
        flush()
      } else {
        finish(row, position?.duration || event.time || 0)
      }
    },

    flush,

    seekBy(delta) {
      if (!provider) return
      let target = Math.max(0, lastTime + delta)
      if (lastDuration > 0) target = Math.min(target, Math.max(0, lastDuration - 1))
      lastTime = target
      send(provider.seekMessage(target))
    },

    togglePlay() {
      if (!provider?.playMessage || !provider.pauseMessage) return
      send(playing ? provider.pauseMessage : provider.playMessage)
      setPlaying(!playing)
    },

    canTogglePlay: () => Boolean(provider?.playMessage && provider.pauseMessage),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w @go10/core -- src/player/playbackSession.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Run the core and web suites**

Run: `npm test -w @go10/core && npm test -w @go10/web`
Expected: all pass (core 257, web 180).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/player
git commit -m "feat(core): a UI-free playback session (resume, saves, chapters, ended, seek, play/pause)"
```

---

### Task 2: Core Detail descriptions, and the web Detail on them

**Files:**
- Modify: `packages/core/src/progress/describe.ts`
- Create: `packages/core/src/progress/describe.test.ts`
- Modify: `packages/core/src/catalog/describeTitle.ts`
- Modify: `packages/core/src/catalog/describeTitle.test.ts`
- Modify: `apps/web/src/screens/Detail.tsx`

**Interfaces:**
- Produces:
  - `rowStatus(row: CatalogRow, progress: Progress | null | undefined): string` — "24 min · Visto" / "24 min · Quedan 8 min" / "24 min"
  - `playMeta(title: Title, row: CatalogRow, progress: Progress | null): string` — "T1 · E2 · Quedan 8 min"
  - `detailEyebrow(title: Title): string` — "Serie · 2 temporadas · Studio" / "Película"
  - `detailMeta(title: Title, row: CatalogRow): string[]`

- [ ] **Step 1: Write the failing tests**

`packages/core/src/progress/describe.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { CatalogRow, Title } from '../types'
import type { Progress } from './progressStore'
import { playMeta, rowStatus } from './describe'

const row = { type: 'episode', season_number: 1, episode_number: 2, duration_seconds: 1440 } as CatalogRow
const p = (time: number, watched = false): Progress => ({ time, duration: 1440, updatedAt: 1, watched })

describe('rowStatus', () => {
  it('is the duration, then Visto or what is left', () => {
    expect(rowStatus(row, undefined)).toBe('24 min')
    expect(rowStatus(row, p(1440, true))).toBe('24 min · Visto')
    expect(rowStatus(row, p(960))).toBe('24 min · Quedan 8 min')
  })

  it('drops the duration when unknown', () => {
    expect(rowStatus({ ...row, duration_seconds: 0 }, p(1440, true))).toBe('Visto')
  })
})

describe('playMeta', () => {
  const show = { kind: 'show' } as Title
  const movie = { kind: 'movie' } as Title

  it('names the episode and what is left of it', () => {
    expect(playMeta(show, row, p(960))).toBe('T1 · E2 · Quedan 8 min')
    expect(playMeta(show, row, null)).toBe('T1 · E2')
  })

  it('is empty for a movie not started', () => {
    expect(playMeta(movie, { ...row, type: 'movie' }, null)).toBe('')
    expect(playMeta(movie, { ...row, type: 'movie' }, p(960))).toBe('Quedan 8 min')
  })
})
```

Append to `packages/core/src/catalog/describeTitle.test.ts` (and add `detailEyebrow, detailMeta` to its import from `./describeTitle`):

```ts
describe('detailEyebrow', () => {
  it('says what it is, how many seasons, and the studio', () => {
    expect(detailEyebrow(title({ kind: 'show', studio: 'Toei', seasons: [row(1), row(2)] }))).toBe('Serie · 2 temporadas · Toei')
    expect(detailEyebrow(title({ kind: 'show', seasons: [row(1, 1), row(1, 2)] }))).toBe('Serie · 1 temporada')
    expect(detailEyebrow(title({}))).toBe('Película')
  })
})

describe('detailMeta', () => {
  it('lists year, quality, language, the row runtime and views', () => {
    const r = { year: 1999, duration_seconds: 1440 } as CatalogRow
    expect(detailMeta(title({ views: 1444, subtitled: true, language: 'Japonés' }), r))
      .toEqual(['1999', '1080p', 'Japonés (sub)', '24 min', '1.444 vistas'])
  })

  it('falls back to the title year and hides views for external titles', () => {
    const r = { year: null, duration_seconds: 0 } as CatalogRow
    expect(detailMeta(title({ external: true }), r)).toEqual(['2001', '1080p', 'Español'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @go10/core -- src/progress/describe.test.ts src/catalog/describeTitle.test.ts`
Expected: FAIL — `rowStatus`/`playMeta`/`detailEyebrow`/`detailMeta` are not exported.

- [ ] **Step 3: Implement**

`packages/core/src/progress/describe.ts` becomes:

```ts
import type { CatalogRow, Title } from '../types'
import { resumeFromTime, type Progress } from './progressStore'
import { formatDuration } from '../lib/format'

/** Short position within a title, e.g. "T2 · E5" or "Temporada 3"; '' for a movie. */
export function rowLabel(row: CatalogRow): string {
  if (row.type === 'episode') return `T${row.season_number ?? 1} · E${row.episode_number ?? 1}`
  if (row.type === 'season') return row.season_label || `Temporada ${row.season_number}`
  return ''
}

/** e.g. "Quedan 8 min". Never "0 min" — under a minute still reads as one. */
export function remainingLabel(progress: Progress): string {
  return `Quedan ${formatDuration(Math.max(60, progress.duration - progress.time))}`
}

/** Duration, then "Visto" once finished or how much is left mid-way. */
export function rowStatus(row: CatalogRow, progress: Progress | null | undefined): string {
  const state = progress?.watched
    ? 'Visto'
    : progress && resumeFromTime(progress) !== null
      ? remainingLabel(progress)
      : null
  return [formatDuration(row.duration_seconds), state].filter(Boolean).join(' · ')
}

/** Context under Play: which episode it starts and how much of it is left. */
export function playMeta(title: Title, row: CatalogRow, progress: Progress | null): string {
  const resuming = progress !== null && resumeFromTime(progress) !== null
  return [title.kind === 'show' ? rowLabel(row) : null, resuming ? remainingLabel(progress) : null]
    .filter(Boolean)
    .join(' · ')
}
```

In `packages/core/src/catalog/describeTitle.ts`, change the first import line to `import { formatDuration, formatViews } from '../lib/format'`, add `CatalogRow` to the types import (`import type { CatalogRow, Title } from '../types'`), and append:

```ts
/** Detail's eyebrow: "Serie · 3 temporadas · Toei", or "Película". */
export function detailEyebrow(title: Title): string {
  const count = groupSeasons(title.seasons).length
  const kind = title.kind === 'show' ? `Serie · ${count} ${count === 1 ? 'temporada' : 'temporadas'}` : 'Película'
  return title.studio ? `${kind} · ${title.studio}` : kind
}

/** Detail's metadata line, for the row Play would start. */
export function detailMeta(title: Title, row: CatalogRow): string[] {
  return [
    row.year ?? title.year,
    title.quality,
    title.subtitled ? `${title.language} (sub)` : title.language,
    formatDuration(row.duration_seconds),
    // TMDB has no view counts; "0 vistas" would read as unpopular.
    title.external ? null : formatViews(title.views),
  ]
    .filter(Boolean)
    .map(String)
}
```

In `apps/web/src/screens/Detail.tsx`:
- Delete the local `rowStatus` function and its doc comment.
- Imports: drop `formatViews` (keep nothing else from format if unused — `formatDuration` becomes unused too; remove the whole `format` import), drop `resumeFromTime`'s sibling use only if unused (it stays: `resuming` uses it), change `import { remainingLabel, rowLabel } from '@go10/core/progress/describe'` to `import { playMeta, rowStatus } from '@go10/core/progress/describe'`, add `import { detailEyebrow, detailMeta } from '@go10/core/catalog/describeTitle'`.
- Replace the `meta` constant with `const meta = detailMeta(title, activeRow)`.
- Replace the `playMeta` array with `const playNote = playMeta(title, activeRow, activeProgress)`.
- Replace the eyebrow paragraph's contents with `{detailEyebrow(title)}`.
- Replace the play-meta block with:

```tsx
          {playNote !== '' && (
            <p className="go-play_meta">
              {resuming && <ProgressBar fraction={playedFraction(activeProgress)} className="go-play_progress" />}
              {playNote}
            </p>
          )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w @go10/core && npm test -w @go10/web && npm run typecheck -w @go10/web`
Expected: all pass (core 263, web 180); typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/progress packages/core/src/catalog apps/web/src/screens/Detail.tsx
git commit -m "feat(core): Detail's eyebrow, meta, row status and play note, shared with the web"
```

---

### Task 3: Mobile player plumbing (WebView, host page, guard, key map)

**Files:**
- Modify: `apps/mobile/package.json` (via `npx expo install react-native-webview`)
- Create: `apps/mobile/src/player/hostPage.ts`, `apps/mobile/src/player/hostPage.test.ts`
- Create: `apps/mobile/src/player/navigationGuard.ts`, `apps/mobile/src/player/navigationGuard.test.ts`
- Create: `apps/mobile/src/player/playerKeys.ts`, `apps/mobile/src/player/playerKeys.test.ts`
- Create: `apps/mobile/src/platform/remote.ts`

**Interfaces:**
- Produces:
  - `hostHtml(embedSrc: string, origin: string, sandbox?: string): string`
  - `commandScript(command: unknown): string`
  - `type HostMessage = { kind: 'embed'; data: unknown } | { kind: 'loaded' }`; `parseHostMessage(raw: string): HostMessage | null`
  - `allowNavigation(request: { url: string; isTopFrame?: boolean }, siteUrl: string): boolean`
  - `type RemoteKey = 'up' | 'down' | 'left' | 'right' | 'select' | 'playPause' | 'fastForward' | 'rewind' | 'next' | 'previous'`
  - `type PlayerAction = { type: 'seekBy'; delta: number } | { type: 'togglePlay' } | { type: 'openBar' } | { type: 'next' } | { type: 'previous' }`
  - `SEEK_STEP_SECONDS = 10`; `playerKeyAction(key: RemoteKey, barOpen: boolean): PlayerAction | null`; `backAction(barOpen: boolean): 'closeBar' | 'leave'`
  - `remoteKey(event: { eventType?: string; eventKeyAction?: string | number }): RemoteKey | null`
  - `useRemoteKeys(onKey: (key: RemoteKey) => void): void`; `useBackPress(onBack: () => boolean): void`

- [ ] **Step 1: Install the WebView**

Run: `cd apps/mobile && npx expo install react-native-webview`
Expected: `apps/mobile/package.json` gains `"react-native-webview": "13.16.1"` (the SDK 57 pin).

- [ ] **Step 2: Write the failing tests**

`apps/mobile/src/player/hostPage.test.ts`:

```ts
import { commandScript, hostHtml, parseHostMessage } from './hostPage'

describe('hostHtml', () => {
  it('embeds the src attribute-escaped and relays only the embed origin', () => {
    const html = hostHtml('https://ok.ru/videoembed/1?autoplay=1&fromTime=117', 'https://ok.ru')
    expect(html).toContain('src="https://ok.ru/videoembed/1?autoplay=1&amp;fromTime=117"')
    expect(html).toContain('var ORIGIN = "https://ok.ru";')
    expect(html).toContain('e.origin === ORIGIN && e.source === f.contentWindow')
    expect(html).not.toContain('sandbox=')
  })

  it('sandboxes the iframe when the provider asks', () => {
    expect(hostHtml('https://player.vidlove.cc/embed/movie/1', 'https://player.vidlove.cc', 'allow-scripts allow-same-origin'))
      .toContain('sandbox="allow-scripts allow-same-origin"')
  })
})

describe('commandScript', () => {
  it('posts the command through the host page', () => {
    expect(commandScript({ action: 'seek', time: 10 })).toBe('window.go10Command({"action":"seek","time":10}); true;')
  })
})

describe('parseHostMessage', () => {
  it('reads embed messages and the iframe load', () => {
    expect(parseHostMessage('{"kind":"embed","data":{"event":"paused"}}')).toEqual({ kind: 'embed', data: { event: 'paused' } })
    expect(parseHostMessage('{"kind":"loaded"}')).toEqual({ kind: 'loaded' })
  })

  it('ignores anything else', () => {
    expect(parseHostMessage('not json')).toBeNull()
    expect(parseHostMessage('{"kind":"other"}')).toBeNull()
    expect(parseHostMessage('null')).toBeNull()
  })
})
```

`apps/mobile/src/player/navigationGuard.test.ts`:

```ts
import { allowNavigation } from './navigationGuard'

const SITE = 'https://tv.go10.blog/'

describe('allowNavigation', () => {
  it('lets the embed and its sub-frames load anything', () => {
    expect(allowNavigation({ url: 'https://ads.example/x', isTopFrame: false }, SITE)).toBe(true)
  })

  it('keeps the top frame on the host page', () => {
    expect(allowNavigation({ url: 'about:blank', isTopFrame: true }, SITE)).toBe(true)
    expect(allowNavigation({ url: 'https://tv.go10.blog/', isTopFrame: true }, SITE)).toBe(true)
    expect(allowNavigation({ url: 'https://tv.go10.blog', isTopFrame: true }, SITE)).toBe(true)
  })

  it('refuses top-frame navigation anywhere else, look-alikes included', () => {
    expect(allowNavigation({ url: 'https://ok.ru/video/1', isTopFrame: true }, SITE)).toBe(false)
    expect(allowNavigation({ url: 'https://tv.go10.blog.evil.example/', isTopFrame: true }, SITE)).toBe(false)
    expect(allowNavigation({ url: 'https://ads.example/' }, SITE)).toBe(false)
  })
})
```

`apps/mobile/src/player/playerKeys.test.ts`:

```ts
import { backAction, playerKeyAction, remoteKey } from './playerKeys'

describe('playerKeyAction', () => {
  it('seeks with the D-pad and media keys while the bar is hidden', () => {
    expect(playerKeyAction('right', false)).toEqual({ type: 'seekBy', delta: 10 })
    expect(playerKeyAction('left', false)).toEqual({ type: 'seekBy', delta: -10 })
    expect(playerKeyAction('fastForward', false)).toEqual({ type: 'seekBy', delta: 10 })
    expect(playerKeyAction('rewind', false)).toEqual({ type: 'seekBy', delta: -10 })
  })

  it('opens the bar with Select or Up', () => {
    expect(playerKeyAction('select', false)).toEqual({ type: 'openBar' })
    expect(playerKeyAction('up', false)).toEqual({ type: 'openBar' })
    expect(playerKeyAction('down', false)).toBeNull()
  })

  it('leaves the D-pad to the bar while it is open; media keys still work', () => {
    for (const key of ['left', 'right', 'up', 'down', 'select'] as const) expect(playerKeyAction(key, true)).toBeNull()
    expect(playerKeyAction('fastForward', true)).toEqual({ type: 'seekBy', delta: 10 })
    expect(playerKeyAction('playPause', true)).toEqual({ type: 'togglePlay' })
  })

  it('toggles play and steps episodes from the media keys', () => {
    expect(playerKeyAction('playPause', false)).toEqual({ type: 'togglePlay' })
    expect(playerKeyAction('next', false)).toEqual({ type: 'next' })
    expect(playerKeyAction('previous', false)).toEqual({ type: 'previous' })
  })
})

describe('backAction', () => {
  it('closes the bar first, then leaves', () => {
    expect(backAction(true)).toBe('closeBar')
    expect(backAction(false)).toBe('leave')
  })
})

describe('remoteKey', () => {
  it('acts on key-down only: Android TV reports each press as a down and an up', () => {
    expect(remoteKey({ eventType: 'right', eventKeyAction: 0 })).toBe('right')
    expect(remoteKey({ eventType: 'right', eventKeyAction: 1 })).toBeNull()
    expect(remoteKey({ eventType: 'right', eventKeyAction: '0' })).toBe('right')
  })

  it('ignores focus events and keys the player has no use for', () => {
    expect(remoteKey({ eventType: 'focus', eventKeyAction: -1 })).toBeNull()
    expect(remoteKey({ eventType: 'menu', eventKeyAction: 0 })).toBeNull()
    expect(remoteKey({})).toBeNull()
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npm test -w @go10/mobile -- src/player`
Expected: FAIL — modules `./hostPage`, `./navigationGuard`, `./playerKeys` not found.

- [ ] **Step 4: Implement**

`apps/mobile/src/player/hostPage.ts`:

```ts
/** Escapes a value for a double-quoted HTML attribute. */
function attr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

/**
 * The page the player's WebView loads (inline, with `baseUrl` = the site):
 * one iframe plus a relay. Messages the embed posts from its own origin go
 * to RN as {kind:'embed'}; everything else is dropped. RN sends commands by
 * injecting `window.go10Command(cmd)` (see commandScript).
 */
export function hostHtml(embedSrc: string, origin: string, sandbox?: string): string {
  const sandboxAttr = sandbox ? ` sandbox="${attr(sandbox)}"` : ''
  return `<!doctype html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}iframe{border:0;width:100%;height:100%}</style>
</head><body>
<iframe id="f" src="${attr(embedSrc)}" allow="autoplay; fullscreen; encrypted-media" allowfullscreen${sandboxAttr}></iframe>
<script>
  var ORIGIN = ${JSON.stringify(origin)};
  var f = document.getElementById('f');
  function send(o) { window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
  window.addEventListener('message', function (e) {
    if (e.origin === ORIGIN && e.source === f.contentWindow) send({ kind: 'embed', data: e.data });
  });
  window.go10Command = function (cmd) { f.contentWindow.postMessage(cmd, ORIGIN); };
  f.addEventListener('load', function () { send({ kind: 'loaded' }); });
</script>
</body></html>`
}

/** Script for `WebView.injectJavaScript` that posts `command` to the embed. */
export function commandScript(command: unknown): string {
  return `window.go10Command(${JSON.stringify(command)}); true;`
}

export type HostMessage = { kind: 'embed'; data: unknown } | { kind: 'loaded' }

export function parseHostMessage(raw: string): HostMessage | null {
  try {
    const message = JSON.parse(raw) as { kind?: string; data?: unknown } | null
    if (message?.kind === 'loaded') return { kind: 'loaded' }
    if (message?.kind === 'embed') return { kind: 'embed', data: message.data }
  } catch {
    // not ours
  }
  return null
}
```

`apps/mobile/src/player/navigationGuard.ts`:

```ts
/**
 * The host page must stay put: vidlove serves ads that redirect the top
 * frame (seen twice in Phase 0). Sub-frames (the embed, its ads) may load
 * anything; the top frame only the site itself or about:blank.
 */
export function allowNavigation(request: { url: string; isTopFrame?: boolean }, siteUrl: string): boolean {
  if (request.isTopFrame === false) return true
  if (request.url === 'about:blank') return true
  const site = siteUrl.replace(/\/+$/, '')
  return request.url === site || request.url.startsWith(`${site}/`)
}
```

`apps/mobile/src/player/playerKeys.ts`:

```ts
export type RemoteKey = 'up' | 'down' | 'left' | 'right' | 'select' | 'playPause' | 'fastForward' | 'rewind' | 'next' | 'previous'

export type PlayerAction =
  | { type: 'seekBy'; delta: number }
  | { type: 'togglePlay' }
  | { type: 'openBar' }
  | { type: 'next' }
  | { type: 'previous' }

export const SEEK_STEP_SECONDS = 10

const KEYS = new Set<string>(['up', 'down', 'left', 'right', 'select', 'playPause', 'fastForward', 'rewind', 'next', 'previous'])

/**
 * The player's TV key map (spec: Player → TV remote). While the bar is open
 * the D-pad and Select belong to the bar's buttons (native focus); media
 * keys work either way.
 */
export function playerKeyAction(key: RemoteKey, barOpen: boolean): PlayerAction | null {
  switch (key) {
    case 'playPause':
      return { type: 'togglePlay' }
    case 'fastForward':
      return { type: 'seekBy', delta: SEEK_STEP_SECONDS }
    case 'rewind':
      return { type: 'seekBy', delta: -SEEK_STEP_SECONDS }
    case 'next':
      return { type: 'next' }
    case 'previous':
      return { type: 'previous' }
    default:
      break
  }
  if (barOpen) return null
  if (key === 'right') return { type: 'seekBy', delta: SEEK_STEP_SECONDS }
  if (key === 'left') return { type: 'seekBy', delta: -SEEK_STEP_SECONDS }
  if (key === 'select' || key === 'up') return { type: 'openBar' }
  return null
}

export function backAction(barOpen: boolean): 'closeBar' | 'leave' {
  return barOpen ? 'closeBar' : 'leave'
}

/**
 * A `useTVEventHandler` event as a key press, or null. Android TV dispatches
 * every press twice, as key-down (0) and key-up (1); acting on the down
 * alone makes one press one action, and a held key repeats. Focus/blur
 * events carry -1. The typings say string, Android sends a number.
 */
export function remoteKey(event: { eventType?: string; eventKeyAction?: string | number }): RemoteKey | null {
  if (Number(event.eventKeyAction) !== 0 || !event.eventType || !KEYS.has(event.eventType)) return null
  return event.eventType as RemoteKey
}
```

`apps/mobile/src/platform/remote.ts`:

```ts
import { useEffect, useRef } from 'react'
import { BackHandler, useTVEventHandler } from 'react-native'
import { remoteKey, type RemoteKey } from '../player/playerKeys'

/** Remote key presses (see remoteKey). The latest `onKey` is always used. */
export function useRemoteKeys(onKey: (key: RemoteKey) => void): void {
  const handler = useRef(onKey)
  handler.current = onKey
  useTVEventHandler((event) => {
    const key = remoteKey(event)
    if (key) handler.current(key)
  })
}

/** Hardware, gesture and remote Back; `onBack` returns true to consume it. */
export function useBackPress(onBack: () => boolean): void {
  const handler = useRef(onBack)
  handler.current = onBack
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => handler.current())
    return () => subscription.remove()
  }, [])
}
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `npm test -w @go10/mobile -- src/player && npm run typecheck -w @go10/mobile`
Expected: PASS (14 tests); typecheck exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/package.json package-lock.json apps/mobile/src/player apps/mobile/src/platform/remote.ts
git commit -m "feat(mobile): WebView host page, navigation guard and the player's TV key map"
```

---

### Task 4: PlayerView

**Files:**
- Create: `apps/mobile/src/components/PlayerView.tsx`
- Test: `apps/mobile/src/components/PlayerView.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`createPlaybackSession`, `LOAD_TIMEOUT_MS`), Task 3 (all of it), core `providerFor`, `playerRetryReducer`, `initialPlayerRetryState`, `backoffMs`, `rowLabel`.
- Produces: `PlayerView({ row, siteUrl, onClose, onPrev?, onNext? }: { row: CatalogRow; siteUrl: string; onClose(): void; onPrev?(): void; onNext?(): void })`. `onNext` doubles as auto-advance.

- [ ] **Step 1: Write the failing test**

`apps/mobile/src/components/PlayerView.test.tsx`:

```tsx
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { Linking } from 'react-native'
import { memoryStore, setKeyValueStore } from '@go10/core/ports/keyValueStore'
import { readProgress, writeProgress } from '@go10/core/progress/progressStore'
import type { CatalogRow } from '@go10/core/types'
import { PlayerView } from './PlayerView'

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

const mockRemote: { key?: (key: string) => void; back?: () => boolean } = {}
jest.mock('../platform/remote', () => ({
  useRemoteKeys: (onKey: (key: string) => void) => { mockRemote.key = onKey },
  useBackPress: (onBack: () => boolean) => { mockRemote.back = onBack },
}))

const base = {
  catalog_index: 0, title_raw: 'T', series_id: '', season_label: '', year: null, studio: '', source: '', genre: '',
  genre_secondary: '', quality: '', language: '', subtitled: false, duration_raw: '', views: 0, thumbnail: '',
  chapter_start_seconds: null, chapter_end_seconds: null,
}
const movie: CatalogRow = {
  ...base, video_id: 'm1', type: 'movie', title: 'Coraje', series_title: '', season_number: null, episode_number: null,
  duration_seconds: 700, video_url: 'https://ok.ru/video/1', embed_url: 'https://ok.ru/videoembed/1',
}
const chapter = (n: number, start: number, end: number): CatalogRow => ({
  ...base, video_id: 'f9', type: 'episode', title: `Ep ${n}`, series_title: 'Saint Seiya', season_number: 1, episode_number: n,
  chapter_start_seconds: start, chapter_end_seconds: end, duration_seconds: end - start,
  video_url: 'https://ok.ru/video/9', embed_url: 'https://ok.ru/videoembed/9',
})
const SITE = 'https://tv.test/'

const webview = () => screen.getByTestId('player-webview')
const post = (message: object) =>
  act(() => webview().props.onMessage({ nativeEvent: { data: JSON.stringify(message) } }))
const embed = (data: object) => post({ kind: 'embed', data })
const injected = () => mockInject.mock.calls.map(([script]) => script as string)

beforeEach(() => {
  setKeyValueStore(memoryStore())
  mockInject.mockClear()
})

describe('PlayerView', () => {
  it('loads the embed in the host page on the site origin, resuming the saved position', async () => {
    writeProgress('m1', { time: 120, duration: 700 })
    await render(<PlayerView row={movie} siteUrl={SITE} onClose={jest.fn()} />)
    expect(webview().props.source.baseUrl).toBe(SITE)
    expect(webview().props.source.html).toContain('src="https://ok.ru/videoembed/1?autoplay=1&amp;fromTime=117"')
    expect(webview().props.mediaPlaybackRequiresUserAction).toBe(false)
    expect(webview().props.setSupportMultipleWindows).toBe(false)
    expect(webview().props.onShouldStartLoadWithRequest({ url: 'https://ads.example/', isTopFrame: true })).toBe(false)
  })

  it('saves progress from the embed and on leaving with Back', async () => {
    const onClose = jest.fn()
    await render(<PlayerView row={movie} siteUrl={SITE} onClose={onClose} />)
    await embed({ event: 'timeupdate', time: 200, duration: 700 })
    await embed({ event: 'timeupdate', time: 204, duration: 700 })
    await act(() => { mockRemote.back!() })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(readProgress('m1')?.time).toBe(204)
  })

  it('seeks and pauses from the remote', async () => {
    await render(<PlayerView row={movie} siteUrl={SITE} onClose={jest.fn()} />)
    await embed({ event: 'timeupdate', time: 100, duration: 700 })
    await act(() => mockRemote.key!('right'))
    await act(() => mockRemote.key!('playPause'))
    expect(injected()).toEqual([
      'window.go10Command({"action":"seek","time":110}); true;',
      'window.go10Command({"action":"pause"}); true;',
    ])
  })

  it('Select opens the bar; Back closes it before leaving', async () => {
    const onClose = jest.fn()
    await render(<PlayerView row={chapter(1, 0, 600)} siteUrl={SITE} onClose={onClose} onNext={jest.fn()} />)
    expect(screen.queryByRole('button', { name: 'Volver' })).toBeNull()
    await act(() => mockRemote.key!('select'))
    expect(screen.getByRole('button', { name: 'Volver' })).toBeTruthy()
    expect(screen.getByText('Saint Seiya')).toBeTruthy()
    expect(screen.getByText('T1 · E1')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Pausar o reproducir' }).props.hasTVPreferredFocus).toBe(true)
    await act(() => { mockRemote.back!() })
    expect(screen.queryByRole('button', { name: 'Volver' })).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
    await act(() => { mockRemote.back!() })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('auto-advances when the episode ends', async () => {
    const onNext = jest.fn()
    await render(<PlayerView row={movie} siteUrl={SITE} onClose={jest.fn()} onNext={onNext} />)
    await embed({ event: 'ended', time: 700 })
    expect(onNext).toHaveBeenCalledTimes(1)
    expect(readProgress('m1')?.watched).toBe(true)
  })

  it('a chapter of the same file seeks instead of reloading', async () => {
    const { rerender } = await render(<PlayerView row={chapter(1, 0, 600)} siteUrl={SITE} onClose={jest.fn()} />)
    const html = webview().props.source.html
    await rerender(<PlayerView row={chapter(2, 600, 1200)} siteUrl={SITE} onClose={jest.fn()} />)
    expect(webview().props.source.html).toBe(html)
    expect(injected()).toEqual(['window.go10Command({"action":"seek","time":600}); true;'])
  })

  it('another file reloads the embed', async () => {
    const { rerender } = await render(<PlayerView row={chapter(1, 0, 600)} siteUrl={SITE} onClose={jest.fn()} />)
    await rerender(<PlayerView row={movie} siteUrl={SITE} onClose={jest.fn()} />)
    expect(webview().props.source.html).toContain('https://ok.ru/videoembed/1?autoplay=1')
    expect(injected()).toEqual([])
  })

  describe('when the embed never loads', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    it('reconnects after 8 s, then offers the fallback link', async () => {
      const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
      await render(<PlayerView row={movie} siteUrl={SITE} onClose={jest.fn()} />)
      await act(() => { jest.advanceTimersByTime(8000) })
      expect(screen.getByText('Reconectando…')).toBeTruthy()
      for (const backoff of [1000, 2000, 3000]) {
        await act(() => { jest.advanceTimersByTime(backoff) })
        await act(() => { jest.advanceTimersByTime(8000) })
      }
      expect(screen.getByText('No se pudo reproducir aquí.')).toBeTruthy()
      await fireEvent.press(screen.getByRole('link', { name: 'Abrir en ok.ru' }))
      expect(openURL).toHaveBeenCalledWith('https://ok.ru/video/1')
    })

    it('does not time out once the iframe has loaded', async () => {
      await render(<PlayerView row={movie} siteUrl={SITE} onClose={jest.fn()} />)
      await post({ kind: 'loaded' })
      await act(() => { jest.advanceTimersByTime(9000) })
      expect(screen.queryByText('Reconectando…')).toBeNull()
    })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @go10/mobile -- src/components/PlayerView.test.tsx`
Expected: FAIL — cannot find `./PlayerView`.

- [ ] **Step 3: Implement**

`apps/mobile/src/components/PlayerView.tsx`:

```tsx
import { Ionicons } from '@expo/vector-icons'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useMemo, useReducer, useRef, useState, type ComponentProps } from 'react'
import { AppState, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'
import { createPlaybackSession, LOAD_TIMEOUT_MS } from '@go10/core/player/playbackSession'
import { backoffMs, initialPlayerRetryState, playerRetryReducer } from '@go10/core/player/playerRetry'
import { providerFor } from '@go10/core/player/providers/index'
import { rowLabel } from '@go10/core/progress/describe'
import type { CatalogRow } from '@go10/core/types'
import { useBackPress, useRemoteKeys } from '../platform/remote'
import { commandScript, hostHtml, parseHostMessage } from '../player/hostPage'
import { allowNavigation } from '../player/navigationGuard'
import { backAction, playerKeyAction } from '../player/playerKeys'
import { theme } from '../theme'

const tv = Platform.isTV

function BarButton({ label, icon, onPress, disabled, preferred }: {
  label: string
  icon: ComponentProps<typeof Ionicons>['name']
  onPress?: () => void
  disabled?: boolean
  preferred?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hasTVPreferredFocus={preferred}
      onPress={onPress}
      style={({ focused }) => [styles.btn, focused && styles.btnFocused, disabled && styles.btnDisabled]}
    >
      {({ focused }) => <Ionicons name={icon} size={tv ? 16 : 22} color={focused ? theme.color.bg : theme.color.text} />}
    </Pressable>
  )
}

/**
 * The player (apps/web/src/screens/Player.tsx) on a WebView: the embed runs
 * in an inline host page on the site's origin, its messages drive a core
 * playback session, and commands go back through injected script. On TV the
 * WebView never takes focus, so every remote key reaches us.
 */
export function PlayerView({ row, siteUrl, onClose, onPrev, onNext }: {
  row: CatalogRow
  siteUrl: string
  onClose: () => void
  onPrev?: () => void
  /** The bar's next button, the remote's next key, and auto-advance at the end. */
  onNext?: () => void
}) {
  const provider = providerFor(row)
  const [retry, dispatch] = useReducer(playerRetryReducer, initialPlayerRetryState)
  const [barOpen, setBarOpen] = useState(false)
  const [playing, setPlaying] = useState(false)
  const webRef = useRef<WebView>(null)
  const loadedRef = useRef(false)
  const onNextRef = useRef(onNext)
  onNextRef.current = onNext

  // One session for the screen's life; it follows the row as episodes change.
  const [session] = useState(() =>
    createPlaybackSession({
      send: (command) => webRef.current?.injectJavaScript(commandScript(command)),
      onEnded: () => onNextRef.current?.(),
      onPlayingChange: setPlaying,
    }),
  )

  // A new file starts over: fresh retry state and a reload (the reset bumps reloadToken).
  const videoRef = useRef(row.video_id)
  useEffect(() => {
    if (videoRef.current === row.video_id) return
    videoRef.current = row.video_id
    loadedRef.current = false
    dispatch({ type: 'reset' })
  }, [row.video_id])

  // Computed once per load (a new file or a retry), never per render: a new
  // src would restart the video. load() also saves the outgoing position, so
  // a retry resumes from the very latest one.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const src = useMemo(() => session.load(row), [retry.reloadToken])

  // Another chapter of the loaded file: seek, don't reload.
  useEffect(() => {
    session.select(row)
  }, [row, session])

  // Save on leaving the screen and whenever the app goes to the background.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') session.flush()
    })
    return () => {
      subscription.remove()
      session.flush()
    }
  }, [session])

  useEffect(() => {
    if (retry.status === 'loading') {
      const timer = setTimeout(() => {
        if (!loadedRef.current) dispatch({ type: 'timeout' })
      }, LOAD_TIMEOUT_MS)
      return () => clearTimeout(timer)
    }
    if (retry.status === 'retrying') {
      const timer = setTimeout(() => {
        loadedRef.current = false
        dispatch({ type: 'retryLoadStarted' })
      }, backoffMs(retry.attempt))
      return () => clearTimeout(timer)
    }
  }, [retry.status, retry.attempt, retry.reloadToken])

  const leave = () => {
    session.flush()
    onClose()
  }

  useBackPress(() => {
    if (backAction(barOpen) === 'closeBar') setBarOpen(false)
    else leave()
    return true
  })

  useRemoteKeys((key) => {
    const action = playerKeyAction(key, barOpen)
    if (!action) return
    if (action.type === 'seekBy') session.seekBy(action.delta)
    else if (action.type === 'togglePlay') session.togglePlay()
    else if (action.type === 'openBar') setBarOpen(true)
    else if (action.type === 'next') onNext?.()
    else onPrev?.()
  })

  const onMessage = (event: WebViewMessageEvent) => {
    const message = parseHostMessage(event.nativeEvent.data)
    if (message?.kind === 'loaded') {
      loadedRef.current = true
      dispatch({ type: 'loaded' })
    } else if (message) {
      session.handle(message.data)
    }
  }

  const canToggle = session.canTogglePlay()
  const position = rowLabel(row)

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      {retry.status === 'failed' ? (
        <View style={styles.fallback}>
          <Text style={styles.fallbackMsg}>No se pudo reproducir aquí.</Text>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={provider.fallbackLabel}
            hasTVPreferredFocus
            onPress={() => void Linking.openURL(row.video_url)}
            style={({ focused }) => [styles.open, focused && styles.openFocused]}
          >
            <Text style={styles.openText}>{provider.fallbackLabel}</Text>
          </Pressable>
        </View>
      ) : (
        <WebView
          key={retry.reloadToken}
          ref={webRef}
          testID="player-webview"
          style={styles.web}
          source={{ html: hostHtml(src, provider.origin, provider.sandbox), baseUrl: siteUrl }}
          originWhitelist={['*']}
          onMessage={onMessage}
          onShouldStartLoadWithRequest={(request) => allowNavigation(request, siteUrl)}
          mediaPlaybackRequiresUserAction={false}
          allowsFullscreenVideo
          setSupportMultipleWindows={false}
          focusable={!tv}
        />
      )}

      {retry.status === 'retrying' && (
        <View style={styles.reconnecting} pointerEvents="none">
          <Text style={styles.reconnectingText}>Reconectando…</Text>
        </View>
      )}

      {barOpen && (
        <View style={styles.bar}>
          <BarButton label="Volver" icon="chevron-back" onPress={leave} preferred={!canToggle} />
          <View style={styles.heading}>
            <Text style={styles.title} numberOfLines={1}>{row.series_title || row.title}</Text>
            {position !== '' && <Text style={styles.season}>{position}</Text>}
          </View>
          {(onPrev || onNext || canToggle) && (
            <View style={styles.steps}>
              {(onPrev || onNext) && <BarButton label="Episodio anterior" icon="play-skip-back" onPress={onPrev} disabled={!onPrev} />}
              {canToggle && (
                <BarButton label="Pausar o reproducir" icon={playing ? 'pause' : 'play'} onPress={() => session.togglePlay()} preferred />
              )}
              {(onPrev || onNext) && <BarButton label="Episodio siguiente" icon="play-skip-forward" onPress={onNext} disabled={!onNext} />}
            </View>
          )}
        </View>
      )}

      {/* Touch: a small tab at the top edge drops the bar down (TV opens it from the remote). */}
      {!tv && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={barOpen ? 'Ocultar controles' : 'Mostrar controles'}
          onPress={() => setBarOpen((open) => !open)}
          style={[styles.handle, barOpen && styles.handleOpen]}
        >
          <Ionicons name={barOpen ? 'chevron-up' : 'chevron-down'} size={16} color={theme.color.text} />
        </Pressable>
      )}
    </View>
  )
}

const BAR_H = tv ? 44 : 56

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  web: { flex: 1, backgroundColor: '#000' },
  bar: {
    position: 'absolute', top: 0, left: 0, right: 0, height: BAR_H, flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: tv ? theme.space.safeX : 8, backgroundColor: 'rgba(8, 9, 12, 0.94)',
    borderBottomWidth: 1, borderBottomColor: theme.color.hairline,
  },
  heading: { flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  title: { flexShrink: 1, color: theme.color.text, fontFamily: theme.font.displayBold, fontSize: theme.size.body },
  season: { color: theme.color.textMuted, fontFamily: theme.font.mono, fontSize: theme.size.meta },
  steps: { flexDirection: 'row', gap: 4 },
  btn: { width: tv ? 32 : 44, height: tv ? 32 : 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  btnFocused: { backgroundColor: theme.color.accent, transform: [{ scale: 1.08 }] },
  btnDisabled: { opacity: 0.3 },
  handle: {
    position: 'absolute', top: 0, left: '50%', marginLeft: -28, width: 56, height: 32, alignItems: 'center', justifyContent: 'center',
    opacity: 0.6,
  },
  handleOpen: { top: BAR_H, opacity: 0.85 },
  reconnecting: { position: 'absolute', top: '45%', alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: theme.color.scrim },
  reconnectingText: { color: theme.color.text, fontFamily: theme.font.mono, fontSize: theme.size.meta },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, backgroundColor: theme.color.bg },
  fallbackMsg: { color: theme.color.textMuted, fontFamily: theme.font.mono, fontSize: theme.size.body },
  open: { paddingHorizontal: 22, paddingVertical: 12, borderRadius: theme.radius, backgroundColor: 'rgba(242,244,240,0.08)', borderWidth: 1, borderColor: theme.color.hairline },
  openFocused: { backgroundColor: theme.color.accent },
  openText: { color: theme.color.text, fontFamily: theme.font.displayBold, fontSize: theme.size.body },
})
```

Note on the `openFocused` text colour: on TV the focused button turns lime with light text; that matches `.go-player_open` closely enough for this phase (Phase 7 polish).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -w @go10/mobile -- src/components/PlayerView.test.tsx && npm run typecheck -w @go10/mobile`
Expected: PASS (9 tests); typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/PlayerView.tsx apps/mobile/src/components/PlayerView.test.tsx
git commit -m "feat(mobile): the player — WebView host, progress, resume, retry, fallback, bar and remote keys"
```

---

### Task 5: DetailView

**Files:**
- Create: `apps/mobile/src/components/ProgressBar.tsx`
- Create: `apps/mobile/src/components/Backdrop.tsx`
- Create: `apps/mobile/src/detail/episodeGrid.ts`, `apps/mobile/src/detail/episodeGrid.test.ts`
- Create: `apps/mobile/src/components/DetailView.tsx`
- Test: `apps/mobile/src/components/DetailView.test.tsx`

**Interfaces:**
- Consumes: Task 2 (`detailEyebrow`, `detailMeta`, `rowStatus`, `playMeta`); core `groupSeasons`, `titleProgress`, `playedFraction`, `resumeFromTime`, `rowKey`, `imageSrc`.
- Produces:
  - `episodeGrid(width: number, min: number, gap: number): { columns: number; tile: number }`
  - `ProgressBar({ fraction, style? })` — renders nothing at 0; testID `progress`
  - `Backdrop({ uri }: { uri: string | null })`
  - `DetailView({ title, progress, imageBase, onPlay, onBack }: { title: Title; progress: Record<string, Progress>; imageBase: string; onPlay(row: CatalogRow): void; onBack(): void })`

- [ ] **Step 1: Write the failing tests**

`apps/mobile/src/detail/episodeGrid.test.ts`:

```ts
import { episodeGrid } from './episodeGrid'

describe('episodeGrid', () => {
  it('fits as many tiles of the minimum width as it can, stretched to fill', () => {
    expect(episodeGrid(320, 56, 8)).toEqual({ columns: 5, tile: 57 })
    expect(episodeGrid(880, 44, 8)).toEqual({ columns: 17, tile: 44 })
  })

  it('always keeps one column', () => {
    expect(episodeGrid(40, 56, 8)).toEqual({ columns: 1, tile: 40 })
  })
})
```

`apps/mobile/src/components/DetailView.test.tsx`:

```tsx
import { fireEvent, render, screen, userEvent, within } from '@testing-library/react-native'
import type { Progress } from '@go10/core/progress/progressStore'
import type { CatalogRow, Title } from '@go10/core/types'
import { DetailView } from './DetailView'

const base = {
  catalog_index: 0, title: 'T', title_raw: 'T', series_id: 's', series_title: 'Saint Seiya', year: null, studio: '',
  source: '', genre: '', genre_secondary: '', quality: '', language: '', subtitled: false, duration_raw: '', views: 0,
  thumbnail: '', video_url: '', embed_url: '', chapter_start_seconds: null, chapter_end_seconds: null,
}
const ep = (season: number, n: number): CatalogRow => ({
  ...base, video_id: `s${season}e${n}`, type: 'episode', season_number: season, season_label: '', episode_number: n, duration_seconds: 1440,
})
const pack = (season: number): CatalogRow => ({
  ...base, video_id: `pack${season}`, type: 'season', season_number: season, season_label: '', episode_number: null, duration_seconds: 7200,
})
const titleOf = (overrides: Partial<Title>): Title => ({
  key: 'k', kind: 'show', title: 'Saint Seiya', year: 1986, studio: 'Toei', source: '', genre: 'Anime', genre_secondary: 'Acción',
  quality: '1080p', language: 'Español', subtitled: false, thumbnail: 'catalogo_files/ss.jpg', views: 10, durationSeconds: 0,
  catalogIndex: 0, seasons: [], ...overrides,
})
const movie: CatalogRow = { ...base, video_id: 'm1', type: 'movie', season_number: null, season_label: '', episode_number: null, duration_seconds: 5400 }
const film = titleOf({ kind: 'movie', title: 'Coraje', studio: '', seasons: [movie] })
const show = titleOf({ seasons: [ep(1, 1), ep(1, 2), ep(1, 3), ep(2, 1), ep(2, 2)] })
const p = (time: number, updatedAt: number, watched = false, duration = 1440): Progress => ({ time, duration, updatedAt, watched })
const IMG = 'https://tv.test/'

function renderDetail(title: Title, progress: Record<string, Progress> = {}, onPlay = jest.fn(), onBack = jest.fn()) {
  return render(<DetailView title={title} progress={progress} imageBase={IMG} onPlay={onPlay} onBack={onBack} />)
}

describe('DetailView', () => {
  it('presents a movie with Reproducir focused first', async () => {
    const onPlay = jest.fn()
    await renderDetail(film, {}, onPlay)
    expect(screen.getByRole('header', { name: 'Coraje' })).toBeTruthy()
    expect(screen.getByText('Película')).toBeTruthy()
    expect(screen.getByText('1 h 30 min')).toBeTruthy()
    expect(screen.getByText('Acción')).toBeTruthy()
    const play = screen.getByRole('button', { name: 'Reproducir' })
    expect(play.props.hasTVPreferredFocus).toBe(true)
    await userEvent.setup().press(play)
    expect(onPlay).toHaveBeenCalledWith(movie)
    expect(screen.queryByText('Episodios')).toBeNull()
  })

  it('offers Reanudar with what is left and a progress bar', async () => {
    await renderDetail(film, { m1: p(3000, 1, false, 5400) })
    expect(screen.getByRole('button', { name: 'Reanudar' })).toBeTruthy()
    expect(screen.getByText('Quedan 40 min')).toBeTruthy()
    expect(screen.getByTestId('progress')).toBeTruthy()
  })

  it('opens on the season being watched, with its episodes', async () => {
    await renderDetail(show, { s2e1: p(600, 5) })
    expect(screen.getByText('Serie · 2 temporadas · Toei')).toBeTruthy()
    expect(screen.getByText('T2 · E1 · Quedan 14 min')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Temporada 2, 2 episodios' }).props.accessibilityState).toMatchObject({ selected: true })
    expect(screen.getByRole('button', { name: 'Episodio 1, 24 min · Quedan 14 min' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Episodio 3/ })).toBeNull()
  })

  it('switches season from its tab and plays an episode from the grid', async () => {
    const onPlay = jest.fn()
    await renderDetail(show, { s1e1: p(1440, 1, true) }, onPlay)
    const user = userEvent.setup()
    await user.press(screen.getByRole('button', { name: 'Temporada 1, 3 episodios' }))
    expect(screen.getByRole('button', { name: 'Episodio 1, 24 min · Visto' })).toBeTruthy()
    await user.press(screen.getByRole('button', { name: 'Episodio 3, 24 min' }))
    expect(onPlay).toHaveBeenCalledWith(ep(1, 3))
  })

  it('plays a one-file season straight from its tab', async () => {
    const onPlay = jest.fn()
    await renderDetail(titleOf({ seasons: [pack(1), pack(2)] }), {}, onPlay)
    await userEvent.setup().press(screen.getByRole('button', { name: 'Temporada 2, 2 h 0 min' }))
    expect(onPlay).toHaveBeenCalledWith(pack(2))
  })

  it('captions the focused episode, else the one Play starts', async () => {
    await renderDetail(show, { s1e2: p(300, 1) })
    const caption = screen.getByTestId('episode-caption')
    expect(within(caption).getByText('Episodio 2')).toBeTruthy()
    await fireEvent(screen.getByRole('button', { name: 'Episodio 3, 24 min' }), 'focus')
    expect(within(caption).getByText('Episodio 3')).toBeTruthy()
  })

  it('follows what was played while away', async () => {
    const { rerender } = await renderDetail(show, { s1e1: p(300, 1) })
    expect(screen.getByText('T1 · E1 · Quedan 19 min')).toBeTruthy()
    await rerender(
      <DetailView title={show} progress={{ s1e1: p(1440, 1, true), s2e1: p(120, 9) }} imageBase={IMG} onPlay={jest.fn()} onBack={jest.fn()} />,
    )
    expect(screen.getByText('T2 · E1 · Quedan 22 min')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Temporada 2, 2 episodios' }).props.accessibilityState).toMatchObject({ selected: true })
  })

  it('has a touch back button', async () => {
    const onBack = jest.fn()
    await renderDetail(film, {}, jest.fn(), onBack)
    await userEvent.setup().press(screen.getByRole('button', { name: 'Volver' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('blurs the thumbnail behind, and requests nothing without one', async () => {
    const { rerender } = await renderDetail(film)
    expect(screen.getByTestId('backdrop').props.source).toEqual([{ uri: 'https://tv.test/catalogo_files/ss.jpg' }])
    await rerender(<DetailView title={{ ...film, thumbnail: '' }} progress={{}} imageBase={IMG} onPlay={jest.fn()} onBack={jest.fn()} />)
    expect(screen.queryByTestId('backdrop')).toBeNull()
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -w @go10/mobile -- src/detail src/components/DetailView.test.tsx`
Expected: FAIL — `./episodeGrid` and `./DetailView` not found.

- [ ] **Step 3: Implement**

`apps/mobile/src/detail/episodeGrid.ts`:

```ts
/**
 * The episode grid's columns (CSS `repeat(auto-fill, minmax(min, 1fr))`):
 * as many tiles at least `min` wide as fit in `width`, stretched to fill it.
 */
export function episodeGrid(width: number, min: number, gap: number): { columns: number; tile: number } {
  const columns = Math.max(1, Math.floor((width + gap) / (min + gap)))
  return { columns, tile: Math.floor((width - gap * (columns - 1)) / columns) }
}
```

`apps/mobile/src/components/ProgressBar.tsx`:

```tsx
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { theme } from '../theme'

/** A thin played-share bar (apps/web/src/components/ProgressBar.tsx); `fraction` is 0..1. Nothing at 0. */
export function ProgressBar({ fraction, style }: { fraction: number; style?: StyleProp<ViewStyle> }) {
  if (fraction <= 0) return null
  return (
    <View testID="progress" style={[styles.track, style]}>
      <View style={[styles.fill, { width: `${Math.round(fraction * 100)}%` }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  track: { height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: 'rgba(242, 244, 240, 0.18)' },
  fill: { height: '100%', backgroundColor: theme.color.accent },
})
```

`apps/mobile/src/components/Backdrop.tsx`:

```tsx
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { StyleSheet, View } from 'react-native'
import { theme } from '../theme'

/**
 * The web's Backdrop: the 368x210 thumbnail blurred hard into a colour field
 * behind the screen — mood, never detail. No thumbnail, no request.
 */
export function Backdrop({ uri }: { uri: string | null }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {uri && <Image testID="backdrop" source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={40} />}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8, 9, 12, 0.55)' }]} />
      <LinearGradient colors={['rgba(8, 9, 12, 0)', theme.color.bg]} locations={[0.2, 0.85]} style={StyleSheet.absoluteFill} />
    </View>
  )
}
```

`apps/mobile/src/components/DetailView.tsx`:

```tsx
import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, Text, TVFocusGuideView, View, useWindowDimensions } from 'react-native'
import { detailEyebrow, detailMeta } from '@go10/core/catalog/describeTitle'
import { rowKey } from '@go10/core/catalog/rowKey'
import { imageSrc } from '@go10/core/lib/imageSrc'
import { groupSeasons } from '@go10/core/player/groupSeasons'
import { playMeta, rowStatus } from '@go10/core/progress/describe'
import { resumeFromTime, type Progress } from '@go10/core/progress/progressStore'
import { playedFraction, titleProgress } from '@go10/core/progress/titleProgress'
import type { CatalogRow, Title } from '@go10/core/types'
import { episodeGrid } from '../detail/episodeGrid'
import { theme } from '../theme'
import { Backdrop } from './Backdrop'
import { ProgressBar } from './ProgressBar'

const tv = Platform.isTV
const GAP = 8
const TILE_MIN = tv ? 44 : 56
const TILE_H = tv ? 38 : 52

function EpisodeTile({ episode, progress, active, width, onPress, onFocus }: {
  episode: CatalogRow
  progress: Progress | undefined
  active: boolean
  width: number
  onPress: () => void
  onFocus: () => void
}) {
  const watched = progress?.watched === true
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[`Episodio ${episode.episode_number}`, rowStatus(episode, progress)].filter(Boolean).join(', ')}
      onPress={onPress}
      onFocus={onFocus}
      style={({ focused }) => [styles.ep, { width }, watched && styles.epWatched, active && styles.epActive, focused && styles.epFocused]}
    >
      <Text style={[styles.epN, watched && styles.epNWatched, active && styles.epNActive]}>{episode.episode_number}</Text>
      {watched && <Text style={styles.check}>✓</Text>}
      {!watched && <ProgressBar fraction={playedFraction(progress)} style={styles.epProgress} />}
    </Pressable>
  )
}

/**
 * A title's Detail screen (apps/web/src/screens/Detail.tsx): backdrop, title
 * block, Reproducir/Reanudar, and for shows the season tabs and a dense
 * grid of numbered episode tiles.
 */
export function DetailView({ title, progress, imageBase, onPlay, onBack }: {
  title: Title
  /** Re-read by the screen each time it regains focus, e.g. back from the player. */
  progress: Record<string, Progress>
  imageBase: string
  onPlay: (row: CatalogRow) => void
  onBack: () => void
}) {
  const { width } = useWindowDimensions()
  const seasonGroups = useMemo(() => groupSeasons(title.seasons), [title.seasons])
  const latest = titleProgress(title, progress)
  const [activeRow, setActiveRow] = useState<CatalogRow>(latest.row)
  const [season, setSeason] = useState<number>(latest.row.season_number ?? seasonGroups[0]?.seasonNumber ?? 0)
  const [focusedKey, setFocusedKey] = useState<string | null>(null)

  // Back from the player with something newer played (autoplay may have
  // moved on several episodes): Play and the season follow it.
  const seenRef = useRef(latest.updatedAt)
  useEffect(() => {
    if (latest.updatedAt <= seenRef.current) return
    seenRef.current = latest.updatedAt
    setActiveRow(latest.row)
    if (latest.row.season_number !== null) setSeason(latest.row.season_number)
  }, [latest.updatedAt, latest.row])

  const isShow = title.kind === 'show'
  const activeProgress = progress[rowKey(activeRow)] ?? null
  const resuming = resumeFromTime(activeProgress) !== null
  const note = playMeta(title, activeRow, activeProgress)
  const selected = seasonGroups.find((group) => group.seasonNumber === season)
  const thumb = title.thumbnail !== '' ? imageSrc(title.thumbnail, imageBase) : null
  const grid = episodeGrid(width - theme.space.safeX * 2, TILE_MIN, GAP)
  const playLabel = resuming ? 'Reanudar' : 'Reproducir'

  const described = selected
    ? selected.rows.find((episode) => rowKey(episode) === focusedKey) ?? selected.rows.find((episode) => rowKey(episode) === rowKey(activeRow))
    : undefined
  const describedStatus = described ? rowStatus(described, progress[rowKey(described)]) : ''

  return (
    <View style={styles.root}>
      <Backdrop uri={thumb} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.body}>
          <View style={styles.main}>
            <Text style={styles.eyebrow}>{detailEyebrow(title)}</Text>
            <Text accessibilityRole="header" style={styles.title}>{title.title}</Text>
            <View style={styles.metaRow}>
              {detailMeta(title, activeRow).map((item, index) => (
                <View key={index} style={styles.metaItem}>
                  {index > 0 && <View style={styles.sep} />}
                  <Text style={styles.meta}>{item}</Text>
                </View>
              ))}
            </View>
            <View style={styles.genres}>
              {[title.genre, title.genre_secondary].filter(Boolean).map((genre) => (
                <Text key={genre} style={styles.chip}>{genre}</Text>
              ))}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={playLabel}
              hasTVPreferredFocus
              onPress={() => onPlay(activeRow)}
              style={({ focused }) => [styles.play, focused && styles.playFocused]}
            >
              {({ focused }) => (
                <>
                  <View style={[styles.playIcon, focused && styles.playIconFocused]} />
                  <Text style={[styles.playText, focused && styles.onAccent]}>{playLabel}</Text>
                </>
              )}
            </Pressable>
            {note !== '' && (
              <View style={styles.playMeta}>
                {resuming && <ProgressBar fraction={playedFraction(activeProgress)} style={styles.playProgress} />}
                <Text style={styles.playMetaText}>{note}</Text>
              </View>
            )}
          </View>
          {tv && thumb && <Image source={{ uri: thumb }} style={styles.art} contentFit="cover" />}
        </View>

        {isShow && (
          <View style={styles.seasons}>
            {seasonGroups.length > 1 && (
              <TVFocusGuideView autoFocus>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
                  {seasonGroups.map((group) => {
                    // A season that is one whole file plays straight from its tab.
                    const single = group.rows.length === 1 ? group.rows[0] : null
                    const singleProgress = single ? progress[rowKey(single)] : undefined
                    const isSelected = group.seasonNumber === season
                    return (
                      <Pressable
                        key={group.seasonNumber}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                        accessibilityLabel={
                          single
                            ? [group.label, rowStatus(single, singleProgress)].filter(Boolean).join(', ')
                            : `${group.label}, ${group.rows.length} episodios`
                        }
                        onPress={() => {
                          setActiveRow(group.rows[0])
                          setSeason(group.seasonNumber)
                          if (single) onPlay(single)
                        }}
                        style={({ focused }) => [styles.tab, isSelected && styles.tabActive, focused && styles.tabFocused]}
                      >
                        <Text style={[styles.tabText, isSelected && styles.tabTextActive]}>{group.label}</Text>
                        {single && !singleProgress?.watched && (
                          <ProgressBar fraction={playedFraction(singleProgress)} style={styles.tabProgress} />
                        )}
                      </Pressable>
                    )
                  })}
                </ScrollView>
              </TVFocusGuideView>
            )}

            {selected && selected.rows.length > 1 && (
              <View>
                <Text accessibilityRole="header" style={styles.label}>
                  Episodios
                  <Text style={styles.count}>{`  ${selected.rows.length}`}</Text>
                </Text>
                {/* Height reserved so the grid never jumps as the caption changes. */}
                <Text testID="episode-caption" style={styles.caption}>
                  {described && (
                    <>
                      <Text style={styles.captionN}>{`Episodio ${described.episode_number}`}</Text>
                      {describedStatus !== '' && ` · ${describedStatus}`}
                    </>
                  )}
                </Text>
                <TVFocusGuideView autoFocus style={styles.grid}>
                  {selected.rows.map((episode) => (
                    <EpisodeTile
                      key={rowKey(episode)}
                      episode={episode}
                      progress={progress[rowKey(episode)]}
                      active={rowKey(episode) === rowKey(activeRow)}
                      width={grid.tile}
                      onFocus={() => setFocusedKey(rowKey(episode))}
                      onPress={() => {
                        setActiveRow(episode)
                        onPlay(episode)
                      }}
                    />
                  ))}
                </TVFocusGuideView>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Touch-only: the remote and the phone's back gesture already go back. */}
      {!tv && (
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={onBack} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={theme.color.text} />
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.bg },
  content: { paddingBottom: theme.space.safeY * 2 },
  body: {
    flexDirection: 'row', alignItems: 'center', gap: theme.space.safeX,
    paddingHorizontal: theme.space.safeX, paddingTop: tv ? 48 : theme.space.safeY + 56, paddingBottom: tv ? 24 : 32,
  },
  main: { flex: 1, maxWidth: tv ? 368 : undefined },
  eyebrow: { marginBottom: 8, color: theme.color.accent, fontFamily: theme.font.mono, fontSize: theme.size.eyebrow + 1, letterSpacing: 2, textTransform: 'uppercase' },
  title: { marginBottom: 14, color: theme.color.text, fontFamily: theme.font.displayHeavy, fontSize: theme.size.hero, lineHeight: theme.size.hero * 1.02, letterSpacing: -theme.size.hero * 0.03 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginBottom: tv ? 12 : 16 },
  metaItem: { flexDirection: 'row', alignItems: 'center' },
  sep: { width: 3, height: 3, borderRadius: 2, marginHorizontal: tv ? 8 : 8, backgroundColor: theme.color.textMuted },
  meta: { color: theme.color.textMuted, fontFamily: theme.font.mono, fontSize: theme.size.meta },
  genres: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: tv ? 20 : 24 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: theme.color.hairline, color: theme.color.text, fontFamily: theme.font.mono, fontSize: theme.size.tag + 2 },
  play: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: tv ? 'flex-start' : 'stretch', gap: 12,
    minHeight: tv ? undefined : 52, paddingHorizontal: tv ? 16 : 24, paddingVertical: tv ? 8 : 0, borderRadius: theme.radius,
    backgroundColor: 'rgba(242, 244, 240, 0.08)', borderWidth: 1, borderColor: theme.color.hairline,
  },
  playFocused: { backgroundColor: theme.color.accent, borderColor: theme.color.accent, transform: [{ scale: 1.03 }] },
  playIcon: { width: 0, height: 0, borderTopWidth: 7, borderBottomWidth: 7, borderLeftWidth: 12, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: theme.color.text },
  playIconFocused: { borderLeftColor: theme.color.bg },
  playText: { color: theme.color.text, fontFamily: theme.font.displayBold, fontSize: theme.size.body },
  onAccent: { color: theme.color.bg },
  playMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  playProgress: { width: 40, height: 3 },
  playMetaText: { color: theme.color.textMuted, fontFamily: theme.font.mono, fontSize: theme.size.tag + 3 },
  art: { width: 208, aspectRatio: 368 / 210, borderRadius: theme.radius, borderWidth: 1, borderColor: theme.color.hairline },
  seasons: { paddingHorizontal: theme.space.safeX },
  tabs: { gap: 8, paddingVertical: 8, marginBottom: tv ? 12 : 20 },
  tab: { minHeight: tv ? 28 : 44, justifyContent: 'center', paddingHorizontal: tv ? 12 : 18, borderRadius: 999, backgroundColor: 'rgba(242, 244, 240, 0.07)', borderWidth: 2, borderColor: 'transparent' },
  tabActive: { backgroundColor: theme.color.text },
  tabFocused: { borderColor: theme.color.accent, transform: [{ scale: 1.06 }] },
  tabText: { color: theme.color.textMuted, fontFamily: theme.font.displayBold, fontSize: tv ? 9 : 15 },
  tabTextActive: { color: theme.color.bg },
  tabProgress: { position: 'absolute', left: 18, right: 18, bottom: 6, height: 2 },
  label: { marginBottom: 4, color: theme.color.text, fontFamily: theme.font.displayBold, fontSize: theme.size.section },
  count: { color: theme.color.textMuted, fontFamily: theme.font.monoMedium, fontSize: theme.size.tag + 3 },
  caption: { minHeight: tv ? 14 : 20, marginBottom: tv ? 10 : 16, color: theme.color.textMuted, fontFamily: theme.font.mono, fontSize: theme.size.tag + 3 },
  captionN: { color: theme.color.text, fontFamily: theme.font.monoSemi },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  ep: { height: TILE_H, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius, backgroundColor: theme.color.bgRaised, borderWidth: 1, borderColor: theme.color.hairline },
  epWatched: { backgroundColor: 'transparent' },
  epActive: { backgroundColor: 'rgba(198, 242, 78, 0.12)', borderWidth: 1.5, borderColor: theme.color.accent },
  epFocused: { borderWidth: 2, borderColor: theme.color.accent, transform: [{ scale: 1.08 }], zIndex: 2 },
  epN: { color: theme.color.text, fontFamily: theme.font.displayBold, fontSize: tv ? 12 : 17, fontVariant: ['tabular-nums'] },
  epNWatched: { color: theme.color.textMuted },
  epNActive: { color: theme.color.accent },
  check: { position: 'absolute', top: 3, right: 6, color: theme.color.accentDim, fontSize: tv ? 7 : 10 },
  epProgress: { position: 'absolute', left: 8, right: 8, bottom: 6, height: 3 },
  back: {
    position: 'absolute', top: theme.space.safeY, left: theme.space.safeX, width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.scrim, borderWidth: 1, borderColor: theme.color.hairline,
  },
})
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w @go10/mobile -- src/detail src/components/DetailView.test.tsx && npm run typecheck -w @go10/mobile`
Expected: PASS (11 tests); typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/detail apps/mobile/src/components/DetailView.tsx apps/mobile/src/components/DetailView.test.tsx apps/mobile/src/components/ProgressBar.tsx apps/mobile/src/components/Backdrop.tsx
git commit -m "feat(mobile): the Detail screen — seasons, episode grid, Reproducir/Reanudar, progress bars"
```

---

### Task 6: Routes, and Home's hero plays

**Files:**
- Move: `apps/mobile/src/app/title/[key].tsx` → `apps/mobile/src/app/title/[key]/index.tsx` (rewritten)
- Create: `apps/mobile/src/app/title/[key]/play/[videoId].tsx`
- Modify: `apps/mobile/src/app/_layout.tsx` (player screen fades in)
- Modify: `apps/mobile/src/app/index.tsx`
- Modify: `apps/mobile/src/components/HomeContent.tsx`, `HomeView.tsx`, `Hero.tsx`
- Test: `apps/mobile/src/components/Hero.test.tsx`, `HomeContent.test.tsx`, `HomeView.test.tsx` (props)

**Interfaces:**
- Consumes: Tasks 4 and 5; core `resolveRoute`, `findNextEpisode`, `findPreviousEpisode`, `titleProgress`, `listProgress`, `rowLabel`.
- Produces:
  - `Hero` gains `progress: TitleProgress | null` (Reanudar + position note, like the web hero).
  - `HomeView` and `HomeContent` gain `progress: Record<string, Progress>`; `onPlayTitle(title, row)` now receives the row to play.
  - Routes `/title/[key]` (Detail) and `/title/[key]/play/[videoId]` (Player; `videoId` is a `rowKey`).

- [ ] **Step 1: Write the failing Hero test**

Append to `apps/mobile/src/components/Hero.test.tsx` (inside the `describe`), and pass `progress={null}` in the four existing renders:

```tsx
  it('says Reanudar with the episode when one is in progress', async () => {
    const row = { type: 'episode', season_number: 2, episode_number: 5 } as CatalogRow
    const progress = { row, mode: 'resume' as const, progress: { time: 300, duration: 1400, updatedAt: 1, watched: false }, updatedAt: 1 }
    await render(<Hero title={spidey} art={ART} imageBase={IMG} progress={progress} onPlay={jest.fn()} onInfo={jest.fn()} />)
    expect(screen.getByRole('button', { name: 'Reanudar' })).toBeTruthy()
    expect(screen.getByText('T2 · E5')).toBeTruthy()
  })

  it('names the next episode but keeps Reproducir once the last one was finished', async () => {
    const row = { type: 'episode', season_number: 1, episode_number: 3 } as CatalogRow
    await render(<Hero title={spidey} art={ART} imageBase={IMG} progress={{ row, mode: 'next', progress: null, updatedAt: 1 }} onPlay={jest.fn()} onInfo={jest.fn()} />)
    expect(screen.getByRole('button', { name: 'Reproducir' })).toBeTruthy()
    expect(screen.getByText('T1 · E3')).toBeTruthy()
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @go10/mobile -- src/components/Hero.test.tsx`
Expected: FAIL — no 'Reanudar' button / no 'T2 · E5' text (and a TS error on the unknown `progress` prop is reported by typecheck, not Jest).

- [ ] **Step 3: Implement the Hero, HomeView and HomeContent changes**

`Hero.tsx`:
- Imports: add `import { rowLabel } from '@go10/core/progress/describe'` and `import type { TitleProgress } from '@go10/core/progress/titleProgress'`.
- Props: add `progress: TitleProgress | null` (after `imageBase`), documented `/** The featured title's progress: Reanudar and the episode, as on the web hero. */`.
- `HeroButton` gains an optional `note?: string`, rendered after the label: `{note ? <Text style={[styles.note, (primary || focused) && styles.buttonTextOnAccent]}>{note}</Text> : null}`, and its `accessibilityLabel` stays `label`.
- In the body: `const resuming = progress?.mode === 'resume'` and `const position = progress && progress.mode !== 'start' ? rowLabel(progress.row) : ''`; the primary button becomes `<HeroButton label={resuming ? 'Reanudar' : 'Reproducir'} note={position} primary preferred onPress={onPlay} icon={<View style={styles.playIcon} />} />`.
- Style: `note: { paddingLeft: 10, borderLeftWidth: 1, borderLeftColor: 'rgba(8,9,12,0.5)', color: theme.color.text, fontFamily: theme.font.monoMedium, fontSize: theme.size.meta, opacity: 0.75 },`

`HomeView.tsx`:
- Props: add `progress: Record<string, Progress>`; change `onPlayTitle: (title: Title, row: CatalogRow) => void`.
- Imports: `import { useMemo } from 'react'`, `import type { Progress } from '@go10/core/progress/progressStore'`, `import { titleProgress } from '@go10/core/progress/titleProgress'`, `CatalogRow` from core types.
- In the body: `const heroProgress = useMemo(() => titleProgress(model.featured, progress), [model.featured, progress])`; the Hero gets `progress={heroProgress}` and `onPlay={() => onPlayTitle(model.featured, heroProgress.row)}`.

`HomeContent.tsx`: add and pass through `progress: Record<string, Progress>`, and retype `onPlayTitle` the same way.

Tests: add `progress: {}` to the `props` objects in `HomeContent.test.tsx` and to `HomeView.test.tsx`'s renders if it renders `HomeView`.

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -w @go10/mobile -- src/components && npm run typecheck -w @go10/mobile`
Expected: PASS; typecheck exit 0 except for `src/app/index.tsx` (not yet updated) — fix it in Step 5.

- [ ] **Step 5: The routes**

`git mv 'apps/mobile/src/app/title/[key].tsx' 'apps/mobile/src/app/title/[key]/index.tsx'`, then its contents:

```tsx
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback, useState } from 'react'
import { rowKey } from '@go10/core/catalog/rowKey'
import { listProgress } from '@go10/core/progress/progressStore'
import { resolveRoute } from '@go10/core/router/resolveRoute'
import { DetailView } from '../../../components/DetailView'
import { LoadingScreen } from '../../../components/LoadingScreen'
import { appExtra, siteBase } from '../../../config/appConfig'
import { useCatalog } from '../../../data/CatalogProvider'

const imageBase = siteBase(appExtra().siteUrl)

export default function TitleScreen() {
  const { key } = useLocalSearchParams<{ key: string }>()
  const { state } = useCatalog()
  // Re-read on every return to this screen (the player saves as it plays).
  const [progress, setProgress] = useState(listProgress)
  useFocusEffect(useCallback(() => setProgress(listProgress()), []))

  if (state.status === 'loading') return <LoadingScreen />
  const view = state.status === 'ready' ? resolveRoute({ name: 'title', key }, state.data.titles) : null
  // Unknown key (or no catalog at all): Home, which shows why.
  if (view?.name !== 'detail') return <Redirect href="/" />
  const { title } = view

  return (
    <DetailView
      title={title}
      progress={progress}
      imageBase={imageBase}
      onBack={() => router.back()}
      onPlay={(row) => router.push({ pathname: '/title/[key]/play/[videoId]', params: { key: title.key, videoId: rowKey(row) } })}
    />
  )
}
```

`apps/mobile/src/app/title/[key]/play/[videoId].tsx`:

```tsx
import { Redirect, router, useLocalSearchParams } from 'expo-router'
import { rowKey } from '@go10/core/catalog/rowKey'
import { findNextEpisode, findPreviousEpisode } from '@go10/core/player/nextEpisode'
import { resolveRoute } from '@go10/core/router/resolveRoute'
import type { CatalogRow } from '@go10/core/types'
import { LoadingScreen } from '../../../../components/LoadingScreen'
import { PlayerView } from '../../../../components/PlayerView'
import { appExtra, siteBase } from '../../../../config/appConfig'
import { useCatalog } from '../../../../data/CatalogProvider'

const siteUrl = siteBase(appExtra().siteUrl)

export default function PlayScreen() {
  const { key, videoId } = useLocalSearchParams<{ key: string; videoId: string }>()
  const { state } = useCatalog()

  if (state.status === 'loading') return <LoadingScreen />
  const view = state.status === 'ready' ? resolveRoute({ name: 'play', key, videoId }, state.data.titles) : null
  if (view?.name !== 'player') return <Redirect href="/" />
  const { title, row } = view

  const next = findNextEpisode(title.seasons, row)
  const previous = findPreviousEpisode(title.seasons, row)
  // Same screen, new episode: the player keeps its session, and for another
  // chapter of the same file, its loaded embed. Back still returns to Detail.
  const go = (target: CatalogRow) => router.setParams({ videoId: rowKey(target) })

  return (
    <PlayerView
      row={row}
      siteUrl={siteUrl}
      onClose={() => router.back()}
      onNext={next ? () => go(next) : undefined}
      onPrev={previous ? () => go(previous) : undefined}
    />
  )
}
```

`apps/mobile/src/app/_layout.tsx`: replace the self-closing `<Stack … />` with

```tsx
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.color.bg } }}>
        <Stack.Screen name="title/[key]/play/[videoId]" options={{ animation: 'fade', contentStyle: { backgroundColor: '#000' } }} />
      </Stack>
```

`apps/mobile/src/app/index.tsx`:

```tsx
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { rowKey } from '@go10/core/catalog/rowKey'
import { listProgress } from '@go10/core/progress/progressStore'
import { HomeContent } from '../components/HomeContent'
import { appExtra, siteBase } from '../config/appConfig'
import { useCatalog } from '../data/CatalogProvider'

const imageBase = siteBase(appExtra().siteUrl)

export default function Home() {
  const { state, store } = useCatalog()
  const [progress, setProgress] = useState(listProgress)
  // Arriving at Home: apply a background catalog refresh (never mid-browse)
  // and re-read progress, so the hero says Reanudar after watching.
  useFocusEffect(
    useCallback(() => {
      store.applyPending()
      setProgress(listProgress())
    }, [store]),
  )
  return (
    <HomeContent
      state={state}
      progress={progress}
      onRetry={() => void store.retry()}
      imageBase={imageBase}
      onSelectTitle={(title) => router.push({ pathname: '/title/[key]', params: { key: title.key } })}
      onPlayTitle={(title, row) => router.push({ pathname: '/title/[key]/play/[videoId]', params: { key: title.key, videoId: rowKey(row) } })}
      onSelectCollection={(c) => router.push({ pathname: '/coleccion/[id]', params: { id: c.id } })}
    />
  )
}
```

- [ ] **Step 6: Full mobile suite and typecheck**

Run: `npm test -w @go10/mobile && npm run typecheck -w @go10/mobile`
Expected: all pass (mobile 95); typecheck exit 0.

- [ ] **Step 7: Commit**

```bash
git add -A apps/mobile/src
git commit -m "feat(mobile): Detail and Player routes; Home's hero resumes and plays"
```

---

### Task 7: Build on the phone, and the checklists

**Files:**
- Modify: `docs/superpowers/tv-checklist.md`
- Modify: `README.md` (test counts line)

- [ ] **Step 1: Whole-repo verification**

Run: `npm test && npm run typecheck --workspaces --if-present && npm run build -w @go10/web && python3 -m pytest tests/ -q`
Expected: every suite passes (core 263, web 180, mobile 95; Python 92); typecheck and build exit 0.

- [ ] **Step 2: Native rebuild (react-native-webview is a new native module)**

Run (in `apps/mobile`):
```bash
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
npm run prebuild
cd android && ./gradlew app:assembleDebug -PreactNativeArchitectures=arm64-v8a
adb -s ZY22MTK86Z install -r app/build/outputs/apk/debug/app-debug.apk
adb -s ZY22MTK86Z reverse tcp:8081 tcp:8081
```
Then restart Metro (`EXPO_TV=1 npx expo start --port 8081 --clear < /dev/null`, background) and launch with `adb shell monkey -p blog.go10.tv -c android.intent.category.LAUNCHER 1`.
Expected: BUILD SUCCESSFUL; `Success` from install; the app opens on Home.

- [ ] **Step 3: TV checklist — append**

```markdown
## From Phase 4 (Detail + Player)
- [ ] Opening a title puts focus on **Reproducir / Reanudar**.
- [ ] Down from Play reaches the season tabs, then the episode grid; Up/Down/Left/Right move tile by tile and the caption follows the focused episode.
- [ ] Leaving the grid and coming back returns to the last focused tile (focus guide).
- [ ] Back from Detail returns to Home with focus on the card that opened it.
- [ ] In the player, the WebView never takes focus: Left/Right seek 10 s, FF/RW seek 10 s, Play/Pause toggles (ok.ru), and **one press acts once** (key-down only).
- [ ] Select or Up opens the bar with focus on play/pause; Left/Right move between its buttons; Back closes it; Back again leaves to Detail.
- [ ] Back from the player returns focus to the Play button or the episode tile that started it.
- [ ] Media next/previous keys step episodes.
- [ ] The embed plays and reports progress on the TV's system WebView (Reanudar shows up afterwards).
```

- [ ] **Step 4: README test counts**

In `README.md`, the `npm test` line under "## Tests" becomes (with the real counts from Step 1):
`npm test                      # 538 — core (logic: 263) + web (components: 180) + mobile (95), every workspace`

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/tv-checklist.md README.md
git commit -m "docs: Phase 4 TV checklist and test counts"
```

- [ ] **Step 6: Hand to the user for the phone check** — the spec's done-when: play a series episode → Back → close the app → relaunch → Detail says Reanudar at the right episode and resumes there; let an episode end → the next one starts; a Saint Seiya chapter advances by seeking. The spec's Phase 4 row is marked done only after they confirm.
