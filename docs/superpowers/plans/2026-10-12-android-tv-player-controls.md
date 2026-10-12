# Android TV player controls — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every player action on Android TV (seek with feedback, play/pause, episodes, quality, subtitles, audio, speed, server, anything else in the embed) is doable with the remote alone.

**Architecture:** A pure key/state reducer in `packages/core` drives a new TV-only overlay in `PlayerView`. A script injected *into the embed frames* (Expo local native module → `WebViewCompat.addDocumentStartJavaScript`) reports each embed's settings and applies choices, through the host page's existing `postMessage` relay. A D-pad pointer that dispatches real touch events to the WebView covers everything else. A diagnostics panel makes a blind TV test reportable.

**Tech Stack:** TypeScript, React Native (react-native-tvos 0.86) on Expo SDK 57, react-native-webview 13.16.1, Expo Modules (Kotlin), androidx.webkit, vitest (core, jsdom), jest + @testing-library/react-native (mobile).

**Spec:** `docs/superpowers/specs/2026-10-12-android-tv-player-controls-design.md`

## Global Constraints

- TV-only UI change: the new overlay renders only when `isTvUi()` is true (`Platform.isTV`, or the dev-only `GO10_FORCE_TV_UI=1` build flag). Phone playback UI and behaviour unchanged.
- No native video playback, no stream extraction, no new providers.
- The embed iframe is never sandboxed (vidlove refuses to play sandboxed).
- Bridge script origins: `https://ok.ru`, `https://player.vidlove.cc` (plus any found in the probe, Task 7), one list: `BRIDGE_ORIGINS` in `packages/core/src/player/bridge/protocol.ts`.
- All user-facing copy in Spanish (matching the app). Tester checklist in Spanish.
- Seek step 10 s (`SEEK_STEP_SECONDS`); scrub steps 10 → 30 → 60 s; overlay auto-hides after 5 s without input (`OVERLAY_IDLE_MS = 5000`); seek coalescing 400 ms on TV (same as the web player's `SEEK_COALESCE_MS`).
- Release APK built for `arm64-v8a` and `armeabi-v7a`.
- Builds need `JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64`. The user installs on devices themselves; give them commands, don't run installs on their TV.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Embed changes / adapter finds nothing** → that setting's button simply doesn't appear; no exception escapes the injected script into the embed page (Task 4 test "a throwing adapter reports nothing and keeps the page alive").
2. **Old system WebView without `DOCUMENT_START_SCRIPT`** → bridge status `unsupported`, video still loads and plays, pointer mode still works (Task 9 test "loads the video even when the bridge is unsupported or never answers").
3. **A setting change the embed ignores** (result `ok:false` or no answer in 3 s) → toast says it failed and suggests Modo puntero; UI not stuck (Task 9 test "a set with no answer resolves false after 3 s").
4. **Scrubbing past the ends / before duration is known** → the marker stays inside the chapter, and with an unknown end it can still move forward (Task 2 tests "clamps the marker to the chapter" and "moves freely forward while the end is unknown").
5. **Back from any depth** → unwinds exactly one level and only leaves the player from `hidden` (Task 2 test "Back unwinds one level at a time").

---

## File map

| File | Responsibility |
|---|---|
| `packages/core/src/player/playbackSession.ts` (modify) | add `seekTo`, `timeline()` |
| `packages/core/src/lib/format.ts` (modify) | add `formatClock` |
| `packages/core/src/player/tvControls.ts` (create) | TV overlay state machine: `(state, input) → {state, effect}` |
| `packages/core/src/player/bridge/protocol.ts` (create) | bridge message types, parsing, `mergeCaps`, `setCommand`, `BRIDGE_ORIGINS` |
| `packages/core/src/player/bridge/frameScript.ts` (create) | the JS string injected into embed frames (runtime + html5 adapter) |
| `packages/core/src/player/bridge/adapters.ts` (create) | provider adapter JS literals (ok.ru, vidlove), from the probe |
| `apps/mobile/src/player/hostPage.ts` (modify) | relay `go10Bridge` messages, broadcast commands to all frames |
| `apps/mobile/modules/embed-bridge/` (create) | Expo local module: `install`, `tap`, `webViewVersion` |
| `apps/mobile/src/player/embedBridge.ts` (create) | JS wrapper over the native module, safe when absent |
| `apps/mobile/src/platform/tvUi.ts` (create) | `isTvUi()` |
| `apps/mobile/config/envFile.js`, `src/config/appConfig.ts` (modify) | `forceTvUi` extra |
| `apps/mobile/src/player/useEmbedBridge.ts` (create) | install-before-load, caps state, `set()` with results, log |
| `apps/mobile/src/player/tv/TvPlayerOverlay.tsx` (create) | scrub bar + button row + seek toast |
| `apps/mobile/src/player/tv/PickerPanel.tsx` (create) | right-side option list |
| `apps/mobile/src/player/tv/PointerLayer.tsx` (create) | cursor + taps |
| `apps/mobile/src/player/tv/DiagnosticsPanel.tsx` (create) | photographable status panel |
| `apps/mobile/src/components/PlayerView.tsx` (modify) | wire it all on TV; phone path untouched |
| `docs/superpowers/spikes/2026-10-12-embed-bridge-probe.md` (create) | probe findings |
| `docs/android-tv-tester-checklist.md` (create) | Spanish checklist for the tester |

Test commands: core `npm test -w @go10/core -- <file>`; mobile `cd apps/mobile && npx jest <file>`; typecheck `npm run typecheck`.

---

### Task 1: Session `seekTo` and `timeline()`

**Files:**
- Modify: `packages/core/src/player/playbackSession.ts`
- Test: `packages/core/src/player/playbackSession.test.ts`

**Interfaces:**
- Produces: `PlaybackSession.seekTo(time: number): number | null`, `PlaybackSession.timeline(): Timeline`, `export interface Timeline { time: number; start: number; end: number | null }` (exported from `playbackSession.ts`).

- [ ] **Step 1: Write the failing tests** (append inside the file, reusing its `setup`, `movie`, `chapter`, `okTime` helpers)

```ts
describe('seekTo and timeline', () => {
  it('reports the position and the seekable range of the file', () => {
    const { session } = setup()
    expect(session.timeline()).toEqual({ time: 0, start: 0, end: null })
    session.load(movie)
    session.handle(okTime(42, 700))
    expect(session.timeline()).toEqual({ time: 42, start: 0, end: 700 })
  })

  it("uses a chapter's own range", () => {
    const { session } = setup()
    session.load(chapter(2, 600, 1200))
    session.handle(okTime(650, 3000))
    expect(session.timeline()).toEqual({ time: 650, start: 600, end: 1200 })
  })

  it('seeks to an absolute time, clamped like seekBy', () => {
    const { session, sent } = setup()
    session.load(chapter(2, 600, 1200))
    session.handle(okTime(650, 3000))
    expect(session.seekTo(900)).toBe(900)
    expect(session.seekTo(5000)).toBe(1199)
    expect(session.seekTo(10)).toBe(600)
    expect(sent.slice(-3)).toEqual([{ action: 'seek', time: 900 }, { action: 'seek', time: 1199 }, { action: 'seek', time: 600 }])
    expect(session.timeline().time).toBe(600)
  })

  it('returns null before a load', () => {
    expect(setup().session.seekTo(5)).toBeNull()
  })
})
```

- [ ] **Step 2: Run, expect FAIL** — `npm test -w @go10/core -- playbackSession` → "session.timeline is not a function".

- [ ] **Step 3: Implement.** In the interface add:

```ts
  /** Seeks to `time`, kept inside the chapter (else the file); returns the target, or null before a load. */
  seekTo(time: number): number | null
  /** The last known position and the range seeks stay in (end null until the embed reports a duration). */
  timeline(): Timeline
```

and above it:

```ts
export interface Timeline { time: number; start: number; end: number | null }
```

Replace the `seekBy` implementation with a shared `seekTo`:

```ts
  function range(current: CatalogRow): { start: number; end: number | null } {
    // A chapter's range, else the whole file (its end once reported).
    const start = current.chapter_start_seconds ?? 0
    const end = current.chapter_end_seconds ?? (lastDuration > 0 ? lastDuration : null)
    return { start, end }
  }

  function seekTo(time: number): number | null {
    if (!row || !provider) return null
    const { start, end } = range(row)
    let target = Math.max(start, time)
    if (end !== null) target = Math.min(target, Math.max(start, end - 1))
    lastTime = target
    if (seekCoalesceMs <= 0) {
      send(provider.seekMessage(target))
    } else if (seekTimer === null) {
      const current = provider
      seekTimer = setTimeout(() => {
        seekTimer = null
        send(current.seekMessage(lastTime))
      }, seekCoalesceMs)
    }
    return target
  }
```

and in the returned object:

```ts
    seekBy: (delta) => seekTo(lastTime + delta),
    seekTo,
    timeline: () => (row ? { time: lastTime, ...range(row) } : { time: 0, start: 0, end: null }),
```

- [ ] **Step 4: Run, expect PASS** (whole file, the existing `seekBy` tests included): `npm test -w @go10/core -- playbackSession`.

- [ ] **Step 5: Commit** — `git commit -am "feat(core): playback session seekTo and timeline"` (with the Co-Authored-By line).

---

### Task 2: TV controls reducer + `formatClock`

**Files:**
- Create: `packages/core/src/player/tvControls.ts`, `packages/core/src/player/tvControls.test.ts`
- Modify: `packages/core/src/lib/format.ts` (+ its test file `format.test.ts`, create if absent)

**Interfaces:**
- Consumes: `RemoteKey`, `playerKeyAction`, `SEEK_STEP_SECONDS` from `./playerKeys`; `Timeline` from `./playbackSession`.
- Produces (exact):

```ts
export type TvMode = 'hidden' | 'open' | 'scrubbing' | 'menu' | 'pointer' | 'diagnostics'
export interface TvControlsState {
  mode: TvMode
  scrub: { target: number; start: number; end: number | null } | null
  run: { key: 'left' | 'right'; count: number; at: number } | null
  ups: number[]
}
export type TvInput =
  | { type: 'key'; key: RemoteKey; now: number }
  | { type: 'back' } | { type: 'idle' }
  | { type: 'scrubFocus'; timeline: Timeline } | { type: 'scrubBlur' }
  /** OK on the timeline (its onPress): enters scrubbing, or commits the marker while scrubbing. */
  | { type: 'scrubPress'; timeline: Timeline }
  | { type: 'openMenu' } | { type: 'closeMenu' } | { type: 'pointer' }
export type TvEffect =
  | { type: 'seekBy'; delta: number } | { type: 'seekTo'; time: number }
  | { type: 'togglePlay' } | { type: 'play' } | { type: 'pause' }
  | { type: 'next' } | { type: 'previous' }
  | { type: 'pointerKey'; key: 'up' | 'down' | 'left' | 'right' | 'select' }
  | { type: 'leave' }
export const initialTvControls: TvControlsState
export const OVERLAY_IDLE_MS = 5000
export function scrubStep(count: number): number
export function tvControls(state: TvControlsState, input: TvInput): { state: TvControlsState; effect: TvEffect | null }
// format.ts
export function formatClock(seconds: number): string // 75 → "1:15", 3725 → "1:02:05"
```

- [ ] **Step 1: Write the failing tests** — `packages/core/src/player/tvControls.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { RemoteKey } from './playerKeys'
import { initialTvControls, scrubStep, tvControls, type TvControlsState, type TvInput } from './tvControls'

function run(inputs: TvInput[], state: TvControlsState = initialTvControls) {
  const effects = []
  for (const input of inputs) {
    const out = tvControls(state, input)
    state = out.state
    effects.push(out.effect)
  }
  return { state, effects }
}
const key = (k: string, now = 0): TvInput => ({ type: 'key', key: k as RemoteKey, now })
const scrubAt = (time: number, start = 0, end: number | null = 1000): TvInput => ({ type: 'scrubFocus', timeline: { time, start, end } })

describe('tvControls — hidden', () => {
  it('seeks ±10 s with Left/Right and opens with Select, Up, Down or Info', () => {
    expect(run([key('right')]).effects).toEqual([{ type: 'seekBy', delta: 10 }])
    expect(run([key('left')]).effects).toEqual([{ type: 'seekBy', delta: -10 }])
    for (const k of ['select', 'up', 'down', 'info']) expect(run([key(k)]).state.mode).toBe('open')
  })

  it('media keys act in every mode except pointer and diagnostics', () => {
    expect(run([key('playPause')]).effects).toEqual([{ type: 'togglePlay' }])
    expect(run([key('select'), key('next')]).effects[1]).toEqual({ type: 'next' })
    expect(run([key('select'), { type: 'openMenu' }, key('pause')]).effects[2]).toEqual({ type: 'pause' })
  })
})

describe('tvControls — open', () => {
  it('leaves the D-pad to native focus', () => {
    const { effects } = run([key('select'), key('left'), key('right'), key('down'), key('select')])
    expect(effects).toEqual([null, null, null, null, null])
  })

  it('opens diagnostics after five quick Up presses, not five slow ones', () => {
    const quick = run([key('select', 0), ...[100, 200, 300, 400, 500].map((t) => key('up', t))])
    expect(quick.state.mode).toBe('diagnostics')
    const slow = run([key('select', 0), ...[0, 1000, 2000, 3000, 4000].map((t) => key('up', t))])
    expect(slow.state.mode).toBe('open')
  })

  it('hides on idle', () => {
    expect(run([key('select'), { type: 'idle' }]).state.mode).toBe('hidden')
  })
})

describe('tvControls — scrubbing', () => {
  it('moves the marker without seeking, then commits one seek on OK (the timeline press)', () => {
    const press: TvInput = { type: 'scrubPress', timeline: { time: 100, start: 0, end: 1000 } }
    // The remote's Select key event is ignored while scrubbing; the timeline's onPress commits.
    const { state, effects } = run([key('select'), scrubAt(100), key('right', 0), key('right', 1000), key('left', 2000), key('select', 2100), press])
    expect(effects.slice(0, 6)).toEqual([null, null, null, null, null, null])
    expect(effects[6]).toEqual({ type: 'seekTo', time: 110 })
    expect(state.mode).toBe('open')
    expect(state.scrub).toBeNull()
  })

  it('OK on the timeline after Back starts scrubbing again (focus never left it)', () => {
    const press: TvInput = { type: 'scrubPress', timeline: { time: 300, start: 0, end: 1000 } }
    const { state } = run([key('select'), scrubAt(100), { type: 'back' }, press])
    expect(state).toMatchObject({ mode: 'scrubbing', scrub: { target: 300 } })
  })

  it('accelerates while a key is held (repeats under 300 ms apart)', () => {
    expect([1, 4, 5, 14, 15, 40].map(scrubStep)).toEqual([10, 10, 30, 30, 60, 60])
    const held = Array.from({ length: 6 }, (_, i) => key('right', i * 50))
    const { state } = run([key('select'), scrubAt(0, 0, null), ...held])
    // presses 1-4 step 10, presses 5-6 step 30
    expect(state.scrub?.target).toBe(4 * 10 + 2 * 30)
  })

  it('FF/RW move the marker too', () => {
    const { state } = run([key('select'), scrubAt(100), key('fastForward', 0), key('rewind', 1000), key('rewind', 2000)])
    expect(state.scrub?.target).toBe(90)
  })

  it('clamps the marker to the chapter', () => {
    const back = run([key('select'), scrubAt(605, 600, 1200), key('left', 0)])
    expect(back.state.scrub?.target).toBe(600)
    const fwd = run([key('select'), scrubAt(1195, 600, 1200), key('right', 0)])
    expect(fwd.state.scrub?.target).toBe(1199)
  })

  it('moves freely forward while the end is unknown', () => {
    expect(run([key('select'), scrubAt(5000, 0, null), key('right', 0)]).state.scrub?.target).toBe(5010)
  })

  it('cancels on blur or Back without seeking', () => {
    expect(run([key('select'), scrubAt(100), key('right'), { type: 'scrubBlur' }]).state).toMatchObject({ mode: 'open', scrub: null })
    const back = run([key('select'), scrubAt(100), key('right'), { type: 'back' }])
    expect(back.state).toMatchObject({ mode: 'open', scrub: null })
    expect(back.effects.every((e) => e === null)).toBe(true)
  })
})

describe('tvControls — pointer, menu, Back', () => {
  it('sends the D-pad and Select to the pointer', () => {
    const { effects } = run([key('select'), { type: 'pointer' }, key('up'), key('select'), key('playPause')])
    expect(effects.slice(2)).toEqual([{ type: 'pointerKey', key: 'up' }, { type: 'pointerKey', key: 'select' }, null])
  })

  it('Back unwinds one level at a time', () => {
    const levels = (inputs: TvInput[]) => run([...inputs, { type: 'back' }]).state.mode
    expect(levels([key('select'), { type: 'openMenu' }])).toBe('open')
    expect(levels([key('select'), scrubAt(1)])).toBe('open')
    expect(levels([key('select'), { type: 'pointer' }])).toBe('open')
    expect(levels([key('select'), ...[1, 2, 3, 4, 5].map((t) => key('up', t))])).toBe('open')
    expect(levels([key('select')])).toBe('hidden')
    expect(run([{ type: 'back' }]).effects).toEqual([{ type: 'leave' }])
  })

  it('closeMenu returns to the open overlay', () => {
    expect(run([key('select'), { type: 'openMenu' }, { type: 'closeMenu' }]).state.mode).toBe('open')
  })
})
```

`packages/core/src/lib/format.test.ts` (add the describe; keep any existing ones):

```ts
import { describe, expect, it } from 'vitest'
import { formatClock } from './format'

describe('formatClock', () => {
  it('shows m:ss, or h:mm:ss from an hour', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(75.9)).toBe('1:15')
    expect(formatClock(3725)).toBe('1:02:05')
    expect(formatClock(-3)).toBe('0:00')
  })
})
```

- [ ] **Step 2: Run, expect FAIL** — `npm test -w @go10/core -- tvControls format`.

- [ ] **Step 3: Implement** `format.ts` addition:

```ts
/** A player clock: 75 -> "1:15", 3725 -> "1:02:05". */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}
```

`tvControls.ts`:

```ts
import type { Timeline } from './playbackSession'
import { playerKeyAction, SEEK_STEP_SECONDS, type RemoteKey } from './playerKeys'

/* types exactly as in Interfaces above */

export const initialTvControls: TvControlsState = { mode: 'hidden', scrub: null, run: null, ups: [] }
export const OVERLAY_IDLE_MS = 5000
const RUN_GAP_MS = 300
const DIAGNOSTICS_TAPS = 5
const DIAGNOSTICS_WINDOW_MS = 2000

/** Scrub step for the n-th press of a held key: 10 s, then 30 s, then 60 s. */
export function scrubStep(count: number): number {
  return count < 5 ? 10 : count < 15 ? 30 : 60
}

const DPAD = new Set(['up', 'down', 'left', 'right', 'select'])

/**
 * The TV player overlay (spec: Android TV player controls → 1). Pure: the
 * view feeds it remote keys and focus changes and carries out the effect.
 * In `open` and `menu` the D-pad belongs to native focus, so it returns null.
 */
export function tvControls(state: TvControlsState, input: TvInput): { state: TvControlsState; effect: TvEffect | null } {
  const to = (patch: Partial<TvControlsState>, effect: TvEffect | null = null) => ({ state: { ...state, ...patch }, effect })
  const stay = { state, effect: null }

  switch (input.type) {
    case 'back':
      if (state.mode === 'hidden') return { state, effect: { type: 'leave' } }
      if (state.mode === 'open') return to({ mode: 'hidden', ups: [] })
      return to({ mode: 'open', scrub: null, run: null, ups: [] })
    case 'idle':
      return state.mode === 'open' || state.mode === 'scrubbing' ? to({ mode: 'hidden', scrub: null, run: null, ups: [] }) : stay
    case 'scrubPress':
      if (state.mode === 'scrubbing' && state.scrub) return to({ mode: 'open', scrub: null, run: null }, { type: 'seekTo', time: state.scrub.target })
    // falls through: OK on the timeline outside scrubbing starts it
    case 'scrubFocus':
      return to({ mode: 'scrubbing', scrub: { target: input.timeline.time, start: input.timeline.start, end: input.timeline.end }, run: null })
    case 'scrubBlur':
      return state.mode === 'scrubbing' ? to({ mode: 'open', scrub: null, run: null }) : stay
    case 'openMenu':
      return to({ mode: 'menu' })
    case 'closeMenu':
      return state.mode === 'menu' ? to({ mode: 'open' }) : stay
    case 'pointer':
      return to({ mode: 'pointer', scrub: null, run: null })
    case 'key':
      return onKey(state, input.key, input.now, to)
  }
}

function onKey(
  state: TvControlsState, key: RemoteKey, now: number,
  to: (patch: Partial<TvControlsState>, effect?: TvEffect | null) => { state: TvControlsState; effect: TvEffect | null },
) {
  const none = { state, effect: null }
  if (state.mode === 'pointer') return DPAD.has(key) ? { state, effect: { type: 'pointerKey', key } as TvEffect } : none
  if (state.mode === 'diagnostics') return none

  if (state.mode === 'scrubbing' && state.scrub) {
    const dir = key === 'right' || key === 'fastForward' ? 'right' : key === 'left' || key === 'rewind' ? 'left' : null
    if (dir) {
      const count = state.run && state.run.key === dir && now - state.run.at < RUN_GAP_MS ? state.run.count + 1 : 1
      const { start, end } = state.scrub
      let target = state.scrub.target + (dir === 'right' ? 1 : -1) * scrubStep(count)
      target = Math.max(start, target)
      if (end !== null) target = Math.min(target, Math.max(start, end - 1))
      return to({ scrub: { ...state.scrub, target }, run: { key: dir, count, at: now } })
    }
    // Select is the timeline's onPress (scrubPress); the key event itself is ignored here.
    if (key === 'select') return none
  }

  // Media keys (barOpen=true makes playerKeyAction ignore the D-pad).
  const media = playerKeyAction(key, true)
  if (media && media.type !== 'openBar') return { state, effect: media as TvEffect }

  if (state.mode === 'hidden') {
    if (key === 'right') return { state, effect: { type: 'seekBy', delta: SEEK_STEP_SECONDS } as TvEffect }
    if (key === 'left') return { state, effect: { type: 'seekBy', delta: -SEEK_STEP_SECONDS } as TvEffect }
    if (key === 'select' || key === 'up' || key === 'down' || key === 'info') return to({ mode: 'open', ups: [] })
    return none
  }

  if (state.mode === 'open' && key === 'up') {
    const ups = [...state.ups.filter((t) => now - t < DIAGNOSTICS_WINDOW_MS), now]
    return ups.length >= DIAGNOSTICS_TAPS ? to({ mode: 'diagnostics', ups: [] }) : to({ ups })
  }
  return none
}
```

Note the media-key effects (`seekBy`, `togglePlay`, `play`, `pause`, `next`, `previous`) are already `PlayerAction` shapes that are also `TvEffect`s.

- [ ] **Step 4: Run, expect PASS** — `npm test -w @go10/core -- tvControls format` and `npm run typecheck -w @go10/core`.

- [ ] **Step 5: Commit** — `feat(core): TV player controls reducer and formatClock`.

---

### Task 3: Bridge protocol

**Files:**
- Create: `packages/core/src/player/bridge/protocol.ts`, `packages/core/src/player/bridge/protocol.test.ts`

**Interfaces:**
- Produces:

```ts
export const BRIDGE_ORIGINS: string[] // ['https://ok.ru', 'https://player.vidlove.cc']
export const BRIDGE_SETTINGS: readonly ['quality', 'subtitles', 'audio', 'speed', 'server']
export type BridgeSetting = (typeof BRIDGE_SETTINGS)[number]
export interface BridgeOption { value: string; label: string }
export interface BridgeChoice { options: BridgeOption[]; current: string | null }
export type BridgeCaps = Partial<Record<BridgeSetting, BridgeChoice>>
export interface CapsReport { source: string; frame: string; caps: BridgeCaps }
export type BridgeMessage =
  | { kind: 'caps'; report: CapsReport }
  | { kind: 'result'; id: number; ok: boolean; error?: string }
export type MergedChoice = BridgeChoice & { source: string; frame: string }
export type MergedCaps = Partial<Record<BridgeSetting, MergedChoice>>
export const HTML5_SOURCE = 'html5'
export function parseBridgeMessage(data: unknown): BridgeMessage | null
export function mergeCaps(reports: Iterable<CapsReport>): MergedCaps
export function setCommand(id: number, choice: MergedChoice, setting: BridgeSetting, value: string): object
export const SETTING_LABELS: Record<BridgeSetting, string> // Calidad, Subtítulos, Audio, Velocidad, Servidor
```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { mergeCaps, parseBridgeMessage, setCommand } from './protocol'

const choice = (current: string, ...values: string[]) => ({ options: values.map((v) => ({ value: v, label: v.toUpperCase() })), current })

describe('parseBridgeMessage', () => {
  it('reads a caps report and keeps only real choices', () => {
    const msg = parseBridgeMessage({
      go10Bridge: 'caps', source: 'okru', frame: 'a1',
      caps: { quality: choice('hd', 'sd', 'hd'), speed: choice('1', '1'), bogus: choice('x', 'x', 'y'), audio: { options: 'nope' } },
    })
    // a single option is not a choice; unknown settings and malformed ones are dropped
    expect(msg).toEqual({ kind: 'caps', report: { source: 'okru', frame: 'a1', caps: { quality: choice('hd', 'sd', 'hd') } } })
  })

  it('drops options without a string value/label and a current that is not an option', () => {
    const msg = parseBridgeMessage({
      go10Bridge: 'caps', source: 's', frame: 'f',
      caps: { subtitles: { options: [{ value: 'off', label: 'Desactivados' }, { value: 1, label: 'x' }, { value: 'es', label: 'Español' }], current: 'fr' } },
    })
    expect(msg).toEqual({
      kind: 'caps',
      report: { source: 's', frame: 'f', caps: { subtitles: { options: [{ value: 'off', label: 'Desactivados' }, { value: 'es', label: 'Español' }], current: null } } },
    })
  })

  it('reads results and ignores everything else', () => {
    expect(parseBridgeMessage({ go10Bridge: 'result', id: 3, ok: false, error: 'no menu' })).toEqual({ kind: 'result', id: 3, ok: false, error: 'no menu' })
    expect(parseBridgeMessage({ go10Bridge: 'result', id: '3', ok: true })).toBeNull()
    expect(parseBridgeMessage({ event: 'timeupdate' })).toBeNull()
    expect(parseBridgeMessage(null)).toBeNull()
    expect(parseBridgeMessage('{"go10Bridge":"caps"}')).toBeNull()
  })
})

describe('mergeCaps', () => {
  it('prefers a provider adapter over html5 for the same setting, and fills gaps from html5', () => {
    const merged = mergeCaps([
      { source: 'html5', frame: 'f1', caps: { speed: choice('1', '1', '2'), subtitles: choice('off', 'off', '0') } },
      { source: 'okru', frame: 'f2', caps: { quality: choice('hd', 'sd', 'hd'), subtitles: choice('off', 'off', 'es') } },
    ])
    expect(merged.quality).toMatchObject({ source: 'okru', frame: 'f2' })
    expect(merged.subtitles).toMatchObject({ source: 'okru', current: 'off' })
    expect(merged.speed).toMatchObject({ source: 'html5', frame: 'f1' })
  })
})

describe('setCommand', () => {
  it('addresses the frame and adapter that reported the choice', () => {
    const merged = mergeCaps([{ source: 'okru', frame: 'f2', caps: { quality: choice('hd', 'sd', 'hd') } }])
    expect(setCommand(7, merged.quality!, 'quality', 'sd')).toEqual({ go10Bridge: 'set', id: 7, source: 'okru', frame: 'f2', setting: 'quality', value: 'sd' })
  })
})
```

- [ ] **Step 2: Run, expect FAIL** — `npm test -w @go10/core -- protocol`.

- [ ] **Step 3: Implement**

```ts
/**
 * Messages between the script injected into the embed frames (frameScript.ts)
 * and the app. Frames post `{go10Bridge: 'caps' | 'result', …}` to the top
 * window; the app sends `{go10Bridge: 'set', …}` to every frame and only the
 * addressed adapter in the addressed frame acts.
 */
export const BRIDGE_ORIGINS = ['https://ok.ru', 'https://player.vidlove.cc']
export const BRIDGE_SETTINGS = ['quality', 'subtitles', 'audio', 'speed', 'server'] as const
export const HTML5_SOURCE = 'html5'
export const SETTING_LABELS: Record<BridgeSetting, string> = {
  quality: 'Calidad', subtitles: 'Subtítulos', audio: 'Audio', speed: 'Velocidad', server: 'Servidor',
}
/* types as in Interfaces */

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function parseChoice(raw: unknown): BridgeChoice | null {
  if (!isRecord(raw) || !Array.isArray(raw.options)) return null
  const options = raw.options.filter(
    (o): o is BridgeOption => isRecord(o) && typeof o.value === 'string' && typeof o.label === 'string',
  ).map(({ value, label }) => ({ value, label }))
  if (options.length < 2) return null
  const current = typeof raw.current === 'string' && options.some((o) => o.value === raw.current) ? raw.current : null
  return { options, current }
}

export function parseBridgeMessage(data: unknown): BridgeMessage | null {
  if (!isRecord(data)) return null
  if (data.go10Bridge === 'caps' && typeof data.source === 'string' && typeof data.frame === 'string' && isRecord(data.caps)) {
    const caps: BridgeCaps = {}
    for (const setting of BRIDGE_SETTINGS) {
      const parsed = parseChoice(data.caps[setting])
      if (parsed) caps[setting] = parsed
    }
    return { kind: 'caps', report: { source: data.source, frame: data.frame, caps } }
  }
  if (data.go10Bridge === 'result' && typeof data.id === 'number' && typeof data.ok === 'boolean') {
    return typeof data.error === 'string' ? { kind: 'result', id: data.id, ok: data.ok, error: data.error } : { kind: 'result', id: data.id, ok: data.ok }
  }
  return null
}

export function mergeCaps(reports: Iterable<CapsReport>): MergedCaps {
  const ordered = [...reports].sort((a, b) => Number(a.source === HTML5_SOURCE) - Number(b.source === HTML5_SOURCE))
  const merged: MergedCaps = {}
  for (const { source, frame, caps } of ordered) {
    for (const setting of BRIDGE_SETTINGS) {
      const choice = caps[setting]
      if (choice && !merged[setting]) merged[setting] = { ...choice, source, frame }
    }
  }
  return merged
}

export function setCommand(id: number, choice: MergedChoice, setting: BridgeSetting, value: string) {
  return { go10Bridge: 'set', id, source: choice.source, frame: choice.frame, setting, value }
}
```

- [ ] **Step 4: Run, expect PASS**; typecheck core.
- [ ] **Step 5: Commit** — `feat(core): embed bridge protocol`.

---

### Task 4: Frame script with the HTML5 adapter

**Files:**
- Create: `packages/core/src/player/bridge/frameScript.ts`, `packages/core/src/player/bridge/frameScript.test.ts`, `packages/core/src/player/bridge/adapters.ts`

**Interfaces:**
- Consumes: `HTML5_SOURCE` (value `'html5'`, hard-coded in the script).
- Produces: `frameScript(providerAdapters?: string[]): string`; `PROVIDER_ADAPTERS: string[]` in `adapters.ts` (empty for now; Task 8 fills it). Adapter contract (JS object literal source):
  `{ name: string, read(): caps object, set(setting: string, value: string): boolean }` — runs inside the embed frame; may throw (the runtime catches).

The script is **a string literal**, not a stringified function: Hermes bytecode has no function source.

- [ ] **Step 1: Write the failing tests** (vitest's environment for core is jsdom)

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { frameScript } from './frameScript'

let posted: any[]
beforeEach(() => {
  vi.useFakeTimers()
  posted = []
  delete (window as any).__go10Bridge
  document.body.innerHTML = ''
  vi.spyOn(window, 'postMessage').mockImplementation((msg: any) => { posted.push(msg) })
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

const start = (adapters?: string[]) => new Function(frameScript(adapters))()
const caps = (source: string) => posted.filter((m) => m.go10Bridge === 'caps' && m.source === source).at(-1)
const send = (data: object) => window.dispatchEvent(new MessageEvent('message', { data, source: window }))

function addVideo(tracks: { kind: string; label: string; language: string; mode: string }[] = []) {
  const video = document.createElement('video')
  Object.defineProperty(video, 'textTracks', { value: tracks })
  document.body.appendChild(video)
  return video
}

describe('frameScript — html5 adapter', () => {
  it('reports nothing until a video exists, then speed and subtitles', () => {
    start()
    vi.advanceTimersByTime(1000)
    expect(caps('html5')?.caps ?? {}).toEqual({})
    addVideo([{ kind: 'subtitles', label: 'Español', language: 'es', mode: 'disabled' }, { kind: 'metadata', label: '', language: '', mode: 'hidden' }])
    vi.advanceTimersByTime(1000)
    const report = caps('html5')
    expect(report.caps.speed.current).toBe('1')
    expect(report.caps.speed.options.map((o: any) => o.value)).toEqual(['0.5', '0.75', '1', '1.25', '1.5', '2'])
    expect(report.caps.subtitles).toEqual({ options: [{ value: 'off', label: 'Desactivados' }, { value: '0', label: 'Español' }], current: 'off' })
    expect(typeof report.frame).toBe('string')
  })

  it('applies a set addressed to it and answers with a result', () => {
    start()
    const tracks = [{ kind: 'subtitles', label: 'Español', language: 'es', mode: 'disabled' }]
    const video = addVideo(tracks)
    vi.advanceTimersByTime(1000)
    const frame = caps('html5').frame
    send({ go10Bridge: 'set', id: 1, source: 'html5', frame, setting: 'speed', value: '1.5' })
    send({ go10Bridge: 'set', id: 2, source: 'html5', frame, setting: 'subtitles', value: '0' })
    expect(video.playbackRate).toBe(1.5)
    expect(tracks[0].mode).toBe('showing')
    expect(posted.filter((m) => m.go10Bridge === 'result')).toEqual([{ go10Bridge: 'result', id: 1, ok: true }, { go10Bridge: 'result', id: 2, ok: true }])
  })

  it('ignores sets for another frame or adapter, and messages not from the top window', () => {
    start()
    const video = addVideo()
    vi.advanceTimersByTime(1000)
    send({ go10Bridge: 'set', id: 1, source: 'html5', frame: 'other', setting: 'speed', value: '2' })
    window.dispatchEvent(new MessageEvent('message', { data: { go10Bridge: 'set', id: 2, source: 'html5', frame: caps('html5').frame, setting: 'speed', value: '2' } }))
    expect(video.playbackRate).toBe(1)
    expect(posted.some((m) => m.go10Bridge === 'result')).toBe(false)
  })

  it('a throwing adapter reports nothing and keeps the page alive', () => {
    start(['{ name: "boom", read: function () { throw new Error("x") }, set: function () { throw new Error("y") } }'])
    addVideo()
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow()
    expect(caps('boom')).toBeUndefined()
    expect(caps('html5')).toBeDefined()
    send({ go10Bridge: 'set', id: 9, source: 'boom', frame: caps('html5').frame, setting: 'quality', value: 'hd' })
    expect(posted.find((m) => m.go10Bridge === 'result')).toEqual({ go10Bridge: 'result', id: 9, ok: false, error: 'Error: y' })
  })

  it('runs once per frame even if injected twice', () => {
    start()
    start()
    addVideo()
    vi.advanceTimersByTime(1000)
    expect(posted.filter((m) => m.go10Bridge === 'caps' && m.source === 'html5')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run, expect FAIL** — `npm test -w @go10/core -- frameScript`.

- [ ] **Step 3: Implement** `adapters.ts`:

```ts
/**
 * Provider adapters for the frame script, as JS object-literal source (they
 * run inside the embed's frame, not in the app). See frameScript.ts for the
 * contract and docs/superpowers/spikes/2026-10-12-embed-bridge-probe.md for
 * where each one's selectors come from.
 */
export const PROVIDER_ADAPTERS: string[] = []
```

`frameScript.ts`:

```ts
import { PROVIDER_ADAPTERS } from './adapters'

/**
 * The script the embed bridge injects at document start into every frame on
 * BRIDGE_ORIGINS (spec: Android TV player controls → 2). Each adapter is
 * `{name, read() → caps, set(setting, value) → boolean}`; every call is
 * guarded, so a broken adapter only loses its own settings. Reports go to the
 * top window (our host page) whenever they change; the host relays them to RN.
 *
 * A string, not a function's source: Hermes keeps no function source.
 */
export function frameScript(providerAdapters: string[] = PROVIDER_ADAPTERS): string {
  return `(function () {
  if (window.__go10Bridge) return;
  window.__go10Bridge = true;
  var frame = Math.random().toString(36).slice(2);
  var SPEEDS = ['0.5', '0.75', '1', '1.25', '1.5', '2'];
  function subs(v) {
    return [].filter.call(v.textTracks || [], function (t) { return t.kind === 'subtitles' || t.kind === 'captions'; });
  }
  var html5 = {
    name: 'html5',
    read: function () {
      var v = document.querySelector('video');
      if (!v) return {};
      var caps = { speed: {
        options: SPEEDS.map(function (s) { return { value: s, label: s === '1' ? 'Normal' : s.replace('.', ',') + '×' }; }),
        current: String(v.playbackRate)
      } };
      var tracks = subs(v);
      if (tracks.length) {
        var current = 'off';
        var options = [{ value: 'off', label: 'Desactivados' }];
        tracks.forEach(function (t, i) {
          options.push({ value: String(i), label: t.label || t.language || ('Pista ' + (i + 1)) });
          if (t.mode === 'showing') current = String(i);
        });
        caps.subtitles = { options: options, current: current };
      }
      var audio = v.audioTracks;
      if (audio && audio.length > 1) {
        var aCurrent = null, aOptions = [];
        for (var i = 0; i < audio.length; i++) {
          aOptions.push({ value: String(i), label: audio[i].label || audio[i].language || ('Pista ' + (i + 1)) });
          if (audio[i].enabled) aCurrent = String(i);
        }
        caps.audio = { options: aOptions, current: aCurrent };
      }
      return caps;
    },
    set: function (setting, value) {
      var v = document.querySelector('video');
      if (!v) return false;
      if (setting === 'speed') { v.playbackRate = Number(value); return true; }
      if (setting === 'subtitles') {
        subs(v).forEach(function (t, i) { t.mode = String(i) === value ? 'showing' : 'disabled'; });
        return true;
      }
      if (setting === 'audio' && v.audioTracks) {
        for (var i = 0; i < v.audioTracks.length; i++) v.audioTracks[i].enabled = String(i) === value;
        return true;
      }
      return false;
    }
  };
  var adapters = [${providerAdapters.join(',\n')}${providerAdapters.length ? ',' : ''} html5];
  var last = {};
  function post(message) { try { window.top.postMessage(message, '*'); } catch (e) {} }
  function report() {
    adapters.forEach(function (a) {
      var caps;
      try { caps = a.read() || {}; } catch (e) { return; }
      var json = JSON.stringify(caps);
      if (json === last[a.name]) return;
      last[a.name] = json;
      post({ go10Bridge: 'caps', source: a.name, frame: frame, caps: caps });
    });
  }
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (e.source !== window.top || !d || d.go10Bridge !== 'set' || d.frame !== frame) return;
    var a = adapters.filter(function (x) { return x.name === d.source; })[0];
    if (!a) return;
    var result = { go10Bridge: 'result', id: d.id, ok: false };
    try { result.ok = a.set(d.setting, d.value) === true; } catch (err) { result.error = String(err); }
    post(result);
    setTimeout(report, 300);
  });
  setInterval(report, 1000);
})();`
}
```

Note: the html5 caps with only `{}` (no video) are posted once as `{}` — the first test expects `caps ?? {}` to be `{}`, which allows either.

- [ ] **Step 4: Run, expect PASS**; typecheck.
- [ ] **Step 5: Commit** — `feat(core): embed bridge frame script with an HTML5 video adapter`.

---

### Task 5: Host page relays the bridge

**Files:**
- Modify: `apps/mobile/src/player/hostPage.ts`
- Test: `apps/mobile/src/player/hostPage.test.ts`

**Interfaces:**
- Produces: `hostHtml(embedSrc, origin, { cropPx?, bridgeOrigins? })`; `bridgeScript(command: unknown): string`; `HostMessage` gains `{ kind: 'bridge'; data: unknown }`.

- [ ] **Step 1: Write the failing tests** (append; keep existing ones)

```ts
describe('bridge relay', () => {
  it('relays go10Bridge messages from bridge origins only, and broadcasts commands to every frame', () => {
    const html = hostHtml('https://ok.ru/videoembed/1', 'https://ok.ru', { bridgeOrigins: ['https://ok.ru', 'https://player.vidlove.cc'] })
    expect(html).toContain('var BRIDGE = ["https://ok.ru","https://player.vidlove.cc"]')
    expect(html).toContain('window.go10Bridge = function')
    expect(bridgeScript({ go10Bridge: 'set', id: 1 })).toBe('window.go10Bridge({"go10Bridge":"set","id":1}); true;')
  })

  it('has no bridge relay unless asked (live TV)', () => {
    expect(hostHtml('https://ok.ru/videoembed/1', 'https://ok.ru')).toContain('var BRIDGE = []')
  })

  it('parses bridge messages', () => {
    expect(parseHostMessage(JSON.stringify({ kind: 'bridge', data: { go10Bridge: 'caps' } }))).toEqual({ kind: 'bridge', data: { go10Bridge: 'caps' } })
  })
})
```

Also add a behavioural test running the generated page in jsdom (jest-expo's default env is node; add `/** @jest-environment jsdom */` at the top of a **new** file `apps/mobile/src/player/hostPage.relay.test.ts` — if `jest-environment-jsdom` isn't installed, skip this extra file and rely on the string tests above plus the on-device check in Task 6).

- [ ] **Step 2: Run, expect FAIL** — `cd apps/mobile && npx jest src/player/hostPage`.

- [ ] **Step 3: Implement.** Change the signature to `{ cropPx = 0, bridgeOrigins = [] }: { cropPx?: number; bridgeOrigins?: string[] } = {}` and the script block to:

```js
  var ORIGIN = ${JSON.stringify(origin)};
  var BRIDGE = ${JSON.stringify(bridgeOrigins)};
  var f = document.getElementById('f');
  function send(o) { window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
  window.addEventListener('message', function (e) {
    var d = e.data;
    // The bridge script runs in nested frames too, so it is trusted by origin, not by source.
    if (d && typeof d === 'object' && typeof d.go10Bridge === 'string') {
      if (BRIDGE.indexOf(e.origin) >= 0) send({ kind: 'bridge', data: d });
      return;
    }
    if (e.origin === ORIGIN && e.source === f.contentWindow) send({ kind: 'embed', data: d });
  });
  window.go10Command = function (cmd) { f.contentWindow.postMessage(cmd, ORIGIN); };
  function broadcast(w, cmd) {
    try { w.postMessage(cmd, '*'); } catch (x) {}
    for (var i = 0; i < w.frames.length; i++) broadcast(w.frames[i], cmd);
  }
  window.go10Bridge = function (cmd) { broadcast(f.contentWindow, cmd); };
  f.addEventListener('load', function () { send({ kind: 'loaded' }); });
```

Add:

```ts
/** Script for `WebView.injectJavaScript` that sends a bridge command to every frame of the embed. */
export function bridgeScript(command: unknown): string {
  return `window.go10Bridge(${JSON.stringify(command)}); true;`
}
```

and in `parseHostMessage`: `if (message?.kind === 'bridge') return { kind: 'bridge', data: message.data }`; widen `HostMessage`.

Update the doc comment of `hostHtml` with one sentence on the bridge relay.

- [ ] **Step 4: Run, expect PASS** — host page tests, plus `npx jest src/tv` (live TV uses `hostHtml` too) and `npx jest src/components/PlayerView`.
- [ ] **Step 5: Commit** — `feat(mobile): host page relays the embed bridge`.

---

### Task 6: Native module `embed-bridge`, JS wrapper, `forceTvUi`

**Files:**
- Create: `apps/mobile/modules/embed-bridge/` (generated, then edited), `apps/mobile/src/player/embedBridge.ts`, `apps/mobile/src/player/embedBridge.test.ts`, `apps/mobile/src/platform/tvUi.ts`
- Modify: `apps/mobile/config/envFile.js`, `apps/mobile/config/envFile.test.ts`, `apps/mobile/src/config/appConfig.ts`

**Interfaces:**
- Produces:

```ts
// embedBridge.ts
export type InstallResult = 'installed' | 'unsupported' | 'noView' | 'noModule' | 'error'
export function installBridge(viewTag: number | null, script: string, origins: string[]): Promise<InstallResult>
export function tapWebView(viewTag: number | null, xDp: number, yDp: number): void
export function webViewVersion(): string
// tvUi.ts
export function isTvUi(): boolean
// AppExtra gains: forceTvUi?: boolean
```

- [ ] **Step 1: Generate the module.** From `apps/mobile`: `npx create-expo-module@latest --local embed-bridge` (name `EmbedBridge`, package `blog.go10.embedbridge`). Delete the generated iOS folder, web files, example view and its TS view component; keep `expo-module.config.json` with `"platforms": ["android"]` and `android.modules: ["blog.go10.embedbridge.EmbedBridgeModule"]`.

- [ ] **Step 2: Gradle deps.** In `modules/embed-bridge/android/build.gradle` add to `dependencies`:

```groovy
  implementation project(':react-native-webview')
  implementation "androidx.webkit:webkit:1.12.1"
```

(`react-native-webview` already uses androidx.webkit; if Gradle reports a version conflict, use the version it resolves.)

- [ ] **Step 3: Kotlin module** — `modules/embed-bridge/android/src/main/java/blog/go10/embedbridge/EmbedBridgeModule.kt`:

```kotlin
package blog.go10.embedbridge

import android.os.SystemClock
import android.view.InputDevice
import android.view.MotionEvent
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.reactnativecommunity.webview.RNCWebViewWrapper
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The player's native helpers (spec: Android TV player controls → 2, 3):
 * run our script inside the embed's cross-origin frames, and tap the WebView
 * where the TV pointer is.
 */
class EmbedBridgeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("EmbedBridge")

    AsyncFunction("install") { viewTag: Int, script: String, origins: List<String> ->
      val wrapper = appContext.findView<RNCWebViewWrapper>(viewTag) ?: return@AsyncFunction "noView"
      if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return@AsyncFunction "unsupported"
      try {
        WebViewCompat.addDocumentStartJavaScript(wrapper.webView, script, origins.toSet())
        "installed"
      } catch (e: Exception) {
        "error"
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("tap") { viewTag: Int, xDp: Double, yDp: Double ->
      val wrapper = appContext.findView<RNCWebViewWrapper>(viewTag) ?: return@AsyncFunction false
      val web = wrapper.webView
      val density = web.resources.displayMetrics.density
      val x = (xDp * density).toFloat()
      val y = (yDp * density).toFloat()
      val downAt = SystemClock.uptimeMillis()
      fun send(action: Int, at: Long) {
        val event = MotionEvent.obtain(downAt, at, action, x, y, 0)
        event.source = InputDevice.SOURCE_TOUCHSCREEN
        web.dispatchTouchEvent(event)
        event.recycle()
      }
      send(MotionEvent.ACTION_DOWN, downAt)
      web.postDelayed({ send(MotionEvent.ACTION_UP, SystemClock.uptimeMillis()) }, 60)
      true
    }.runOnQueue(Queues.MAIN)

    Function("webViewVersion") {
      val context = appContext.reactContext ?: return@Function "?"
      WebViewCompat.getCurrentWebViewPackage(context)?.versionName ?: "?"
    }
  }
}
```

If `appContext.findView` doesn't resolve `RNCWebViewWrapper` in the new architecture, find the view with `appContext.findView<android.view.View>(viewTag)` and walk: `(view as? RNCWebViewWrapper) ?: (view as? ViewGroup)?.children?.filterIsInstance<RNCWebViewWrapper>()?.firstOrNull()`.

- [ ] **Step 4: Write the failing JS tests** — `src/player/embedBridge.test.ts`:

```ts
const mockNative = { install: jest.fn(), tap: jest.fn(), webViewVersion: jest.fn(() => '129.0') }
let mockPresent = true
jest.mock('expo', () => ({ requireOptionalNativeModule: () => (mockPresent ? mockNative : null) }))

import { installBridge, tapWebView, webViewVersion } from './embedBridge'

beforeEach(() => { mockPresent = true; jest.clearAllMocks() })

it('installs through the native module', async () => {
  mockNative.install.mockResolvedValue('installed')
  await expect(installBridge(12, 'js', ['https://ok.ru'])).resolves.toBe('installed')
  expect(mockNative.install).toHaveBeenCalledWith(12, 'js', ['https://ok.ru'])
})

it('reports noView without a tag and error when the native call throws', async () => {
  await expect(installBridge(null, 'js', [])).resolves.toBe('noView')
  mockNative.install.mockRejectedValue(new Error('x'))
  await expect(installBridge(1, 'js', [])).resolves.toBe('error')
})

it('taps and reports the WebView version', () => {
  tapWebView(3, 10, 20)
  expect(mockNative.tap).toHaveBeenCalledWith(3, 10, 20)
  expect(webViewVersion()).toBe('129.0')
})
```

and a second file `embedBridge.absent.test.ts` with `mockPresent = false` set before import (use `jest.isolateModules`) asserting `installBridge(1,'',[])` → `'noModule'`, `tapWebView` doesn't throw, `webViewVersion()` → `'?'`.

- [ ] **Step 5: Run, expect FAIL**, then implement `src/player/embedBridge.ts`:

```ts
import { requireOptionalNativeModule } from 'expo'

interface EmbedBridgeNative {
  install(viewTag: number, script: string, origins: string[]): Promise<string>
  tap(viewTag: number, xDp: number, yDp: number): Promise<boolean>
  webViewVersion(): string
}

/** modules/embed-bridge; absent in tests and in builds made before it existed. */
const native = requireOptionalNativeModule<EmbedBridgeNative>('EmbedBridge')

export type InstallResult = 'installed' | 'unsupported' | 'noView' | 'noModule' | 'error'

/** Runs `script` at document start in every frame of the WebView on `origins`. Must happen before the embed loads. */
export async function installBridge(viewTag: number | null, script: string, origins: string[]): Promise<InstallResult> {
  if (!native) return 'noModule'
  if (viewTag == null) return 'noView'
  try {
    return (await native.install(viewTag, script, origins)) as InstallResult
  } catch {
    return 'error'
  }
}

/** A finger tap on the WebView at (x, y) dp from its top-left. */
export function tapWebView(viewTag: number | null, xDp: number, yDp: number): void {
  if (native && viewTag != null) native.tap(viewTag, xDp, yDp).catch(() => {})
}

export function webViewVersion(): string {
  try {
    return native?.webViewVersion() ?? '?'
  } catch {
    return '?'
  }
}
```

- [ ] **Step 6: `forceTvUi`.** Test first in `config/envFile.test.ts`:

```ts
it('forces the TV player UI on a phone build with GO10_FORCE_TV_UI=1 (testing only)', () => {
  expect(mobileExtra({ GO10_FORCE_TV_UI: '1' }).forceTvUi).toBe(true)
  expect(mobileExtra({}).forceTvUi).toBe(false)
})
```

Update the existing `toEqual` expectations in that file to include `forceTvUi: false`. Implement in `mobileExtra`: `forceTvUi: env.GO10_FORCE_TV_UI === '1',`. In `appConfig.ts`: add `forceTvUi?: boolean` to `AppExtra` and `forceTvUi: extra.forceTvUi === true` to `appExtra()`'s return. Create `src/platform/tvUi.ts`:

```ts
import { Platform } from 'react-native'
import { appExtra } from '../config/appConfig'

/** The TV player UI: on a TV, or on a phone build made with GO10_FORCE_TV_UI=1 to test it over adb. */
export function isTvUi(): boolean {
  return Platform.isTV || appExtra().forceTvUi === true
}
```

- [ ] **Step 7: Run all mobile tests + typecheck** — `cd apps/mobile && npx jest && npx tsc --noEmit`. Expect PASS.

- [ ] **Step 8: Build check.** `cd apps/mobile && npm run prebuild && cd android && JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 ./gradlew app:assembleDebug -PreactNativeArchitectures=arm64-v8a`. Expect BUILD SUCCESSFUL. (Fix Kotlin/Gradle issues here; this is the module's only compile check.)

- [ ] **Step 9: Commit** — `feat(mobile): embed-bridge native module, forceTvUi build flag`.

---

### Task 7: Probe — injection on device and each embed's settings (manual)

**Files:**
- Create: `docs/superpowers/spikes/2026-10-12-embed-bridge-probe.md`

This task produces findings, not product code. Temporary debug code used here is reverted before committing.

- [ ] **Step 1: Injection works in cross-origin frames.** Temporarily, in `PlayerView`, call `installBridge(findNodeHandle(webRef.current), frameScript(), BRIDGE_ORIGINS)` once on mount and `console.log` every `{kind:'bridge'}` host message. Build a debug APK with `GO10_FORCE_TV_UI=1` (Step 8 of Task 6 command, env var prefixed), have the user install it on the phone, play one ok.ru title and one vidlove title, read logs with `adb logcat -s ReactNativeJS`. Record: did `html5` caps arrive from ok.ru? from vidlove? Which `e.origin` values posted them (nested frames may be on other origins — list them; any needed get added to `BRIDGE_ORIGINS`).
  - If no caps arrive from either: try `installBridge` **before** setting the WebView source (Task 9's flow) — record whether ordering matters. If still nothing, stop and report to the user: the fallback is pointer mode only (spec → Risks).

- [ ] **Step 2: ok.ru settings.** In desktop Chrome open an ok.ru `/videoembed/<id>` URL (one from `data/` with several qualities, e.g. `https://ok.ru/videoembed/15848425392878`), DevTools on the iframe. Known: `data-options` → `flashvars.metadata.videos[].name` lists `mobile, lowest, low, sd, hd, full, quad, ultra`. Find:
  1. How the player shows/stores the current quality (DOM of the settings menu; any global player object, e.g. search `window` for objects with `setQuality`/`quality` methods; the `OK/OKVideo` require module).
  2. How to switch quality without user-visible menu clicking; else the exact menu selectors and click sequence.
  3. Subtitles: does the player have a CC menu, and are tracks `<track>`/`textTracks` (html5 adapter already covers) or custom?
  4. Speed: player menu vs `video.playbackRate` (does the player reset it?).
- [ ] **Step 3: vidlove settings.** Same for `https://player.vidlove.cc/embed/movie/155?autoplay=true`: server list, quality (hls.js levels? `window.hls`?), subtitles (custom renderer or textTracks), audio tracks. Note if the `<video>` is in a nested frame and on which origin.
- [ ] **Step 4: Write the findings note** with, per provider: available settings; for each, read method, set method, a minimal DOM/JS snippet proven in the DevTools console; and the menu list per provider. Save HTML fixtures for the adapter tests: copy the relevant player DOM subtree (`$0.outerHTML` of the player root) to `packages/core/src/player/bridge/fixtures/okru-player.html` and `vidlove-player.html`, trimmed to the parts the adapter reads.
- [ ] **Step 5: Commit** the note and fixtures — `docs(spike): embed bridge probe findings`. Report a 5-line summary to the user before continuing.

---

### Task 8: Provider adapters

**Files:**
- Modify: `packages/core/src/player/bridge/adapters.ts`, `packages/core/src/player/bridge/protocol.ts` (only if Task 7 added origins)
- Create: `packages/core/src/player/bridge/adapters.test.ts`

**Interfaces:**
- Consumes: the adapter contract from Task 4; fixtures and findings from Task 7.
- Produces: `PROVIDER_ADAPTERS` containing `okru` and/or `vidlove` adapters, named `'okru'` / `'vidlove'`.

This is the only task whose bodies come from the probe. Each adapter must:
- `read()`: return only settings it found, using the methods recorded in the findings note; values are stable strings (ok.ru quality: its `videos[].name`, label `144p … 2160p` via `{mobile:'144p', lowest:'240p', low:'360p', sd:'480p', hd:'720p', full:'1080p', quad:'1440p', ultra:'2160p'}`).
- `set()`: return `true` only after issuing the change; `false` when the target option isn't present.
- Guard its own document: `name: 'okru'` adapter's first line is `if (location.hostname.slice(-5) !== 'ok.ru') return {};` (vidlove: `'player.vidlove.cc'`), in both `read` and `set` (return false).

- [ ] **Step 1: Write the failing tests**, one describe per provider, loading the fixture into jsdom:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PROVIDER_ADAPTERS } from './adapters'

const adapter = (name: string) => {
  const source = PROVIDER_ADAPTERS.find((a) => a.includes(`name: '${name}'`))!
  return new Function(`return (${source})`)() as { read(): any; set(s: string, v: string): boolean }
}
const fixture = (file: string) => readFileSync(join(__dirname, 'fixtures', file), 'utf8')

describe('okru adapter', () => {
  beforeEach(() => {
    document.body.innerHTML = fixture('okru-player.html')
    vi.stubGlobal('location', { hostname: 'ok.ru' })
  })
  it('reads the qualities the fixture offers, labelled by resolution, with the current one', () => {
    // expected values: from the fixture (write them out literally)
  })
  it('switches quality and reports true; an absent quality reports false', () => {})
  it('reports nothing on another host', () => {
    vi.stubGlobal('location', { hostname: 'example.com' })
    expect(adapter('okru').read()).toEqual({})
  })
})
```

Fill the first two `it`s with literal expected values from the fixture (no placeholders left in the committed test). Same shape for vidlove.

- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement** the adapters as object-literal strings in `adapters.ts` (ES5 syntax only — `var`, `function`, no arrow functions: older TV WebViews), following the findings note. **Step 4: Run `npm test -w @go10/core -- bridge`, expect PASS** (Task 4's tests still pass with the adapters included).
- [ ] **Step 5: Device check.** Rebuild the phone debug APK (Task 7 Step 1 logging still reverted — use `adb logcat` on the Task 9 diagnostics instead if Task 9 is done; otherwise temporary logging again, reverted after). Confirm caps from `okru`/`vidlove` arrive. Note results in the findings note.
- [ ] **Step 6: Commit** — `feat(core): ok.ru and vidlove bridge adapters`.

---

### Task 9: `useEmbedBridge` hook

**Files:**
- Create: `apps/mobile/src/player/useEmbedBridge.ts`, `apps/mobile/src/player/useEmbedBridge.test.tsx`

**Interfaces:**
- Consumes: `installBridge`, `InstallResult` (Task 6); `frameScript` (Task 4); `BRIDGE_ORIGINS`, `parseBridgeMessage`, `mergeCaps`, `setCommand`, `MergedCaps`, `BridgeSetting`, `CapsReport` (Task 3); `bridgeScript` (Task 5).
- Produces:

```ts
export type BridgeStatus = 'off' | 'pending' | 'timeout' | InstallResult
export interface BridgeLogEntry { at: number; text: string }
export interface EmbedBridge {
  /** The host page may load (the script is in place, or we gave up waiting). */
  ready: boolean
  status: BridgeStatus
  caps: MergedCaps
  log: BridgeLogEntry[]
  /** A `{kind:'bridge'}` host message's data. */
  handle(data: unknown): void
  /** Resolves true when the embed confirms, false on failure or after 3 s. */
  set(setting: BridgeSetting, value: string): Promise<boolean>
}
export const INSTALL_TIMEOUT_MS = 2000
export const SET_TIMEOUT_MS = 3000
export function useEmbedBridge(opts: {
  enabled: boolean
  webRef: React.RefObject<{ injectJavaScript(script: string): void } | null>
  viewTag: () => number | null
  /** Changes on every WebView (re)mount: a new WebView needs the script again. */
  reloadToken: number
}): EmbedBridge
```

- [ ] **Step 1: Write the failing tests** (jest fake timers; `jest.mock('./embedBridge')`):

```tsx
import { act, renderHook } from '@testing-library/react-native'
import { installBridge } from './embedBridge'
import { useEmbedBridge, INSTALL_TIMEOUT_MS, SET_TIMEOUT_MS } from './useEmbedBridge'

jest.mock('./embedBridge', () => ({ installBridge: jest.fn() }))
const install = installBridge as jest.Mock
const inject = jest.fn()
const webRef = { current: { injectJavaScript: inject } }

beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks() })
afterEach(() => jest.useRealTimers())

const mount = (enabled = true, reloadToken = 0) =>
  renderHook((p: { token: number }) => useEmbedBridge({ enabled, webRef, viewTag: () => 5, reloadToken: p.token }), { initialProps: { token: reloadToken } })

it('is ready at once and off when disabled (phone)', async () => {
  const { result } = await mount(false)
  expect(result.current).toMatchObject({ ready: true, status: 'off' })
  expect(install).not.toHaveBeenCalled()
})

it('waits for the install before the page may load', async () => {
  let resolve!: (r: string) => void
  install.mockReturnValue(new Promise((r) => { resolve = r }))
  const { result } = await mount()
  expect(result.current).toMatchObject({ ready: false, status: 'pending' })
  await act(async () => resolve('installed'))
  expect(result.current).toMatchObject({ ready: true, status: 'installed' })
  expect(install).toHaveBeenCalledWith(5, expect.stringContaining('__go10Bridge'), expect.arrayContaining(['https://ok.ru']))
})

it('loads the video even when the bridge is unsupported or never answers', async () => {
  install.mockResolvedValueOnce('unsupported')
  const a = await mount()
  await act(async () => {})
  expect(a.result.current).toMatchObject({ ready: true, status: 'unsupported' })

  install.mockReturnValueOnce(new Promise(() => {}))
  const b = await mount()
  await act(async () => { jest.advanceTimersByTime(INSTALL_TIMEOUT_MS) })
  expect(b.result.current).toMatchObject({ ready: true, status: 'timeout' })
})

it('installs again for a new WebView', async () => {
  install.mockResolvedValue('installed')
  const { rerender } = await mount()
  await act(async () => {})
  await rerender({ token: 1 })
  await act(async () => {})
  expect(install).toHaveBeenCalledTimes(2)
})

it('merges caps reports and sends a set to the reporting frame', async () => {
  install.mockResolvedValue('installed')
  const { result } = await mount()
  await act(async () => {})
  const quality = { options: [{ value: 'sd', label: '480p' }, { value: 'hd', label: '720p' }], current: 'hd' }
  await act(() => result.current.handle({ go10Bridge: 'caps', source: 'okru', frame: 'f1', caps: { quality } }))
  expect(result.current.caps.quality).toMatchObject({ current: 'hd', source: 'okru', frame: 'f1' })

  let done!: Promise<boolean>
  act(() => { done = result.current.set('quality', 'sd') })
  expect(inject).toHaveBeenCalledWith('window.go10Bridge({"go10Bridge":"set","id":1,"source":"okru","frame":"f1","setting":"quality","value":"sd"}); true;')
  await act(() => result.current.handle({ go10Bridge: 'result', id: 1, ok: true }))
  await expect(done).resolves.toBe(true)
})

it('a set with no answer resolves false after 3 s; a set for an absent setting resolves false at once', async () => {
  install.mockResolvedValue('installed')
  const { result } = await mount()
  await act(async () => {})
  await expect(result.current.set('audio', 'x')).resolves.toBe(false)
  await act(() => result.current.handle({ go10Bridge: 'caps', source: 'html5', frame: 'f', caps: { speed: { options: [{ value: '1', label: 'Normal' }, { value: '2', label: '2×' }], current: '1' } } }))
  let done!: Promise<boolean>
  act(() => { done = result.current.set('speed', '2') })
  await act(async () => { jest.advanceTimersByTime(SET_TIMEOUT_MS) })
  await expect(done).resolves.toBe(false)
})

it('logs install status, caps and results for diagnostics (last 20)', async () => {
  install.mockResolvedValue('installed')
  const { result } = await mount()
  await act(async () => {})
  expect(result.current.log.at(-1)?.text).toBe('instalación: installed')
})
```

- [ ] **Step 2: Run, expect FAIL** — `npx jest src/player/useEmbedBridge`.

- [ ] **Step 3: Implement**

```ts
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { BRIDGE_ORIGINS, mergeCaps, parseBridgeMessage, setCommand, type BridgeSetting, type CapsReport } from '@go10/core/player/bridge/protocol'
import { frameScript } from '@go10/core/player/bridge/frameScript'
import { installBridge, type InstallResult } from './embedBridge'
import { bridgeScript } from './hostPage'

/* exported types/constants as in Interfaces */
const LOG_SIZE = 20

/**
 * The embed bridge for one player (spec: Android TV player controls → 2):
 * installs the frame script before each WebView loads its page, keeps the
 * merged settings the frames report, and sends choices back.
 */
export function useEmbedBridge({ enabled, webRef, viewTag, reloadToken }: {
  enabled: boolean
  webRef: RefObject<{ injectJavaScript(script: string): void } | null>
  viewTag: () => number | null
  reloadToken: number
}): EmbedBridge {
  const [status, setStatus] = useState<BridgeStatus>(enabled ? 'pending' : 'off')
  const [reports, setReports] = useState<Map<string, CapsReport>>(() => new Map())
  const [log, setLog] = useState<BridgeLogEntry[]>([])
  const pending = useRef(new Map<number, (ok: boolean) => void>())
  const nextId = useRef(1)
  const script = useMemo(() => frameScript(), [])

  const note = useCallback((text: string) => {
    setLog((entries) => [...entries, { at: Date.now(), text }].slice(-LOG_SIZE))
  }, [])

  useEffect(() => {
    if (!enabled) return
    let live = true
    setStatus('pending')
    setReports(new Map())
    const timer = setTimeout(() => {
      if (!live) return
      live = false
      setStatus('timeout')
      note('instalación: timeout')
    }, INSTALL_TIMEOUT_MS)
    void installBridge(viewTag(), script, BRIDGE_ORIGINS).then((result) => {
      if (!live) return
      live = false
      clearTimeout(timer)
      setStatus(result)
      note(`instalación: ${result}`)
    })
    return () => {
      live = false
      clearTimeout(timer)
    }
    // viewTag is read at install time only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, reloadToken, script, note])

  const caps = useMemo(() => mergeCaps(reports.values()), [reports])

  const handle = useCallback((data: unknown) => {
    const message = parseBridgeMessage(data)
    if (!message) return
    if (message.kind === 'caps') {
      const { report } = message
      setReports((current) => new Map(current).set(`${report.source}@${report.frame}`, report))
      note(`caps ${report.source}: ${Object.keys(report.caps).join(', ') || '—'}`)
    } else {
      pending.current.get(message.id)?.(message.ok)
      pending.current.delete(message.id)
      note(`resultado #${message.id}: ${message.ok ? 'ok' : `falló${message.error ? ` (${message.error})` : ''}`}`)
    }
  }, [note])

  const set = useCallback((setting: BridgeSetting, value: string) => {
    const choice = caps[setting]
    if (!choice) return Promise.resolve(false)
    const id = nextId.current++
    webRef.current?.injectJavaScript(bridgeScript(setCommand(id, choice, setting, value)))
    note(`set #${id} ${setting}=${value}`)
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        pending.current.delete(id)
        resolve(false)
      }, SET_TIMEOUT_MS)
      pending.current.set(id, (ok) => {
        clearTimeout(timer)
        resolve(ok)
      })
    })
  }, [caps, webRef, note])

  const ready = status !== 'pending'
  return { ready, status: enabled ? status : 'off', caps, log, handle, set }
}
```

(The `logs …` test expects the last entry; since a status note is the only entry at that point, it holds.)

- [ ] **Step 4: Run, expect PASS**; `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `feat(mobile): useEmbedBridge — install, caps, set`.

---

### Task 10: TV overlay (scrub bar, buttons, seek toast) and PlayerView wiring

**Files:**
- Create: `apps/mobile/src/player/tv/TvPlayerOverlay.tsx`, `apps/mobile/src/player/tv/TvPlayerOverlay.test.tsx`
- Modify: `apps/mobile/src/components/PlayerView.tsx`, `apps/mobile/src/components/PlayerView.test.tsx`

**Interfaces:**
- Consumes: `tvControls`, `initialTvControls`, `OVERLAY_IDLE_MS`, `TvControlsState`, `TvInput`, `TvEffect` (Task 2); `PlaybackSession.seekTo/timeline`, `Timeline` (Task 1); `formatClock` (Task 2); `useEmbedBridge` (Task 9); `isTvUi` (Task 6); `MergedCaps`, `BridgeSetting`, `SETTING_LABELS`, `BRIDGE_SETTINGS` (Task 3).
- Produces:

```ts
export function TvPlayerOverlay(props: {
  title: string
  position: string            // rowLabel(row)
  controls: TvControlsState
  timeline: Timeline
  playing: boolean
  canToggle: boolean
  hasPrev: boolean
  hasNext: boolean
  caps: MergedCaps
  /** Last immediate seek (hidden mode), for the toast; null hides it. */
  toast: { target: number; at: number } | null
  dispatch: (input: TvInput) => void
  onTogglePlay(): void
  onPrev(): void
  onNext(): void
  onSetting(setting: BridgeSetting): void
}): JSX.Element | null
```

- [ ] **Step 1: Write the failing overlay tests** — `TvPlayerOverlay.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native'
import { initialTvControls } from '@go10/core/player/tvControls'
import { TvPlayerOverlay } from './TvPlayerOverlay'

const props = (over = {}) => ({
  title: 'Saint Seiya', position: 'T1 · E2', controls: { ...initialTvControls, mode: 'open' as const },
  timeline: { time: 650, start: 600, end: 1200 }, playing: true, canToggle: true, hasPrev: true, hasNext: false,
  caps: {}, toast: null, dispatch: jest.fn(), onTogglePlay: jest.fn(), onPrev: jest.fn(), onNext: jest.fn(), onSetting: jest.fn(), ...over,
})
const quality = { options: [{ value: 'sd', label: '480p' }, { value: 'hd', label: '720p' }], current: 'hd', source: 'okru', frame: 'f' }

it('renders nothing while hidden without a toast', async () => {
  await render(<TvPlayerOverlay {...props({ controls: initialTvControls })} />)
  expect(screen.toJSON()).toBeNull()
})

it('shows the seek toast while hidden', async () => {
  await render(<TvPlayerOverlay {...props({ controls: initialTvControls, toast: { target: 660, at: 0 } })} />)
  expect(screen.getByText('1:00 / 10:00')).toBeTruthy() // chapter-relative: 660-600 of 1200-600
})

it('shows title, chapter-relative clock and only the buttons that apply', async () => {
  await render(<TvPlayerOverlay {...props({ caps: { quality } })} />)
  expect(screen.getByText('Saint Seiya')).toBeTruthy()
  expect(screen.getByText('0:50 / 10:00')).toBeTruthy()
  expect(screen.getByLabelText('Pausar')).toBeTruthy()
  expect(screen.getByLabelText('Episodio anterior')).toBeTruthy()
  expect(screen.queryByLabelText('Episodio siguiente')).toBeNull()
  expect(screen.getByLabelText('Calidad: 720p')).toBeTruthy()
  expect(screen.queryByLabelText(/^Subtítulos/)).toBeNull()
  expect(screen.getByLabelText('Modo puntero')).toBeTruthy()
})

it('shows the scrub marker time while scrubbing', async () => {
  await render(<TvPlayerOverlay {...props({ controls: { ...initialTvControls, mode: 'scrubbing', scrub: { target: 900, start: 600, end: 1200 } } })} />)
  expect(screen.getByText('5:00 / 10:00')).toBeTruthy()
})

it('reports scrub focus and blur, and opens settings and pointer', async () => {
  const p = props({ caps: { quality } })
  await render(<TvPlayerOverlay {...p} />)
  fireEvent(screen.getByLabelText('Línea de tiempo'), 'focus')
  expect(p.dispatch).toHaveBeenCalledWith({ type: 'scrubFocus', timeline: p.timeline })
  fireEvent.press(screen.getByLabelText('Línea de tiempo'))
  expect(p.dispatch).toHaveBeenCalledWith({ type: 'scrubPress', timeline: p.timeline })
  fireEvent(screen.getByLabelText('Línea de tiempo'), 'blur')
  expect(p.dispatch).toHaveBeenCalledWith({ type: 'scrubBlur' })
  fireEvent.press(screen.getByLabelText('Calidad: 720p'))
  expect(p.onSetting).toHaveBeenCalledWith('quality')
  fireEvent.press(screen.getByLabelText('Modo puntero'))
  expect(p.dispatch).toHaveBeenCalledWith({ type: 'pointer' })
})

it('shows "—" for the total while the duration is unknown', async () => {
  await render(<TvPlayerOverlay {...props({ timeline: { time: 30, start: 0, end: null } })} />)
  expect(screen.getByText('0:30 / —')).toBeTruthy()
})
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement `TvPlayerOverlay.tsx`**

```tsx
import { Ionicons } from '@expo/vector-icons'
import type { ComponentProps } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { formatClock } from '@go10/core/lib/format'
import { BRIDGE_SETTINGS, SETTING_LABELS, type BridgeSetting, type MergedCaps } from '@go10/core/player/bridge/protocol'
import type { Timeline } from '@go10/core/player/playbackSession'
import type { TvControlsState, TvInput } from '@go10/core/player/tvControls'
import { theme } from '../../theme'

const ICONS: Record<BridgeSetting, ComponentProps<typeof Ionicons>['name']> = {
  quality: 'options', subtitles: 'chatbox-ellipses', audio: 'musical-notes', speed: 'speedometer', server: 'server',
}

function clock(time: number, { start, end }: Timeline): string {
  return `${formatClock(time - start)} / ${end === null ? '—' : formatClock(end - start)}`
}

function Bar({ time, timeline, focused }: { time: number; timeline: Timeline; focused?: boolean }) {
  const span = timeline.end === null ? 0 : timeline.end - timeline.start
  const fraction = span > 0 ? Math.min(1, Math.max(0, (time - timeline.start) / span)) : 0
  return (
    <View style={[styles.track, focused && styles.trackFocused]}>
      <View style={[styles.fill, { width: `${fraction * 100}%` }]} />
      {focused && <View style={[styles.knob, { left: `${fraction * 100}%` }]} />}
    </View>
  )
}

function Button({ label, icon, onPress, preferred }: { label: string; icon: ComponentProps<typeof Ionicons>['name']; onPress: () => void; preferred?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hasTVPreferredFocus={preferred} onPress={onPress}
      style={({ focused }) => [styles.btn, focused && styles.btnFocused]}>
      {({ focused }) => (
        <>
          <Ionicons name={icon} size={16} color={focused ? theme.color.bg : theme.color.text} />
          {focused && <Text style={styles.btnLabel} numberOfLines={1}>{label}</Text>}
        </>
      )}
    </Pressable>
  )
}

/**
 * The TV player's controls (spec: Android TV player controls → 1): a seek
 * toast while hidden, else title, timeline and buttons. Keys are handled by
 * tvControls in PlayerView; this only renders and reports focus and presses.
 */
export function TvPlayerOverlay(p: {/* props as in Interfaces */}) {
  const { mode, scrub } = p.controls
  if (mode === 'hidden') {
    if (!p.toast) return null
    return (
      <View style={styles.toast} pointerEvents="none">
        <Bar time={p.toast.target} timeline={p.timeline} />
        <Text style={styles.clock}>{clock(p.toast.target, p.timeline)}</Text>
      </View>
    )
  }
  if (mode === 'pointer' || mode === 'diagnostics') return null

  const scrubbing = mode === 'scrubbing' && scrub !== null
  const shown = scrubbing ? scrub.target : p.timeline.time
  return (
    <View style={styles.panel}>
      <View style={styles.heading}>
        <Text style={styles.title} numberOfLines={1}>{p.title}</Text>
        {p.position !== '' && <Text style={styles.meta}>{p.position}</Text>}
      </View>
      <Pressable accessibilityLabel="Línea de tiempo" focusable
        onFocus={() => p.dispatch({ type: 'scrubFocus', timeline: p.timeline })}
        onBlur={() => p.dispatch({ type: 'scrubBlur' })}
        onPress={() => p.dispatch({ type: 'scrubPress', timeline: p.timeline })}
        style={styles.timeline}>
        <Bar time={shown} timeline={p.timeline} focused={scrubbing} />
      </Pressable>
      <View style={styles.row}>
        <Text style={styles.clock}>{clock(shown, p.timeline)}</Text>
        <View style={styles.buttons}>
          {p.canToggle && <Button label={p.playing ? 'Pausar' : 'Reproducir'} icon={p.playing ? 'pause' : 'play'} onPress={p.onTogglePlay} preferred />}
          {p.hasPrev && <Button label="Episodio anterior" icon="play-skip-back" onPress={p.onPrev} preferred={!p.canToggle} />}
          {p.hasNext && <Button label="Episodio siguiente" icon="play-skip-forward" onPress={p.onNext} preferred={!p.canToggle && !p.hasPrev} />}
          {BRIDGE_SETTINGS.map((setting) => {
            const choice = p.caps[setting]
            if (!choice) return null
            const current = choice.options.find((o) => o.value === choice.current)?.label
            const label = current ? `${SETTING_LABELS[setting]}: ${current}` : SETTING_LABELS[setting]
            return <Button key={setting} label={label} icon={ICONS[setting]} onPress={() => p.onSetting(setting)} />
          })}
          <Button label="Modo puntero" icon="locate" onPress={() => p.dispatch({ type: 'pointer' })}
            preferred={!p.canToggle && !p.hasPrev && !p.hasNext} />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: theme.space.safeX, paddingTop: 14, paddingBottom: theme.space.safeY,
    gap: 8, backgroundColor: 'rgba(8, 9, 12, 0.88)',
  },
  heading: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  title: { flexShrink: 1, color: theme.color.text, fontFamily: theme.font.displayBold, fontSize: theme.size.section },
  meta: { color: theme.color.textMuted, fontFamily: theme.font.mono, fontSize: theme.size.meta },
  timeline: { paddingVertical: 6 },
  track: { height: 4, borderRadius: 2, backgroundColor: 'rgba(242,244,240,0.18)' },
  trackFocused: { height: 6, borderRadius: 3 },
  fill: { height: '100%', borderRadius: 3, backgroundColor: theme.color.accent },
  knob: { position: 'absolute', top: -5, marginLeft: -8, width: 16, height: 16, borderRadius: 8, backgroundColor: theme.color.accent, borderWidth: 2, borderColor: theme.color.bg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  clock: { color: theme.color.textMeta, fontFamily: theme.font.mono, fontSize: theme.size.meta },
  buttons: { flexDirection: 'row', gap: 6 },
  btn: { height: 32, minWidth: 32, paddingHorizontal: 8, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  btnFocused: { backgroundColor: theme.color.accent },
  btnLabel: { color: theme.color.bg, fontFamily: theme.font.displaySemi, fontSize: theme.size.meta },
  toast: { position: 'absolute', left: theme.space.safeX, right: theme.space.safeX, bottom: theme.space.safeY, gap: 6 },
})
```

Write the real props type inline (copy the Interfaces block).

- [ ] **Step 4: Run the overlay tests, expect PASS.**

- [ ] **Step 5: PlayerView tests first.** In `PlayerView.test.tsx` add `jest.mock('../platform/tvUi', () => ({ isTvUi: () => mockTv.value }))` with `const mockTv = { value: false }` (reset to false in `beforeEach`), and `jest.mock('../player/embedBridge', () => ({ installBridge: jest.fn(async () => 'installed'), tapWebView: jest.fn(), webViewVersion: () => '129' }))`. New describe:

```tsx
describe('PlayerView on TV', () => {
  beforeEach(() => { mockTv.value = true })

  it('holds the embed until the bridge is installed, then loads it', async () => {
    await render(<PlayerView row={movie} siteUrl={SITE} onClose={jest.fn()} />)
    await act(async () => {})
    expect(webview().props.source.html).toContain('https://ok.ru/videoembed/1')
    expect(webview().props.focusable).toBe(false)
  })

  it('seeks ±10 s and shows the toast with the overlay hidden; Select opens it', async () => {
    await render(<PlayerView row={movie} siteUrl={SITE} onClose={jest.fn()} />)
    await act(async () => {})
    await embed({ event: 'timeupdate', time: 100, duration: 700 })
    await act(() => mockRemote.key!('right'))
    expect(screen.getByText('1:50 / 11:40')).toBeTruthy()
    await act(() => mockRemote.key!('select'))
    expect(screen.getByLabelText('Línea de tiempo')).toBeTruthy()
  })

  it('scrubs and commits a single seek', async () => {
    await render(<PlayerView row={movie} siteUrl={SITE} onClose={jest.fn()} />)
    await act(async () => {})
    await embed({ event: 'timeupdate', time: 100, duration: 700 })
    await act(() => mockRemote.key!('select'))
    fireEvent(screen.getByLabelText('Línea de tiempo'), 'focus')
    mockInject.mockClear()
    await act(() => mockRemote.key!('right'))
    await act(() => mockRemote.key!('right'))
    expect(injected().some((s) => s.includes('seek'))).toBe(false)
    await act(() => mockRemote.key!('select')) // ignored while scrubbing…
    fireEvent.press(screen.getByLabelText('Línea de tiempo')) // …the timeline's onPress commits
    await act(async () => { jest.advanceTimersByTime?.(500) })
    expect(injected().filter((s) => s.includes('"seek"'))).toHaveLength(1)
  })

  it('Back closes the overlay before leaving', async () => {
    const onClose = jest.fn()
    await render(<PlayerView row={movie} siteUrl={SITE} onClose={onClose} />)
    await act(async () => {})
    await act(() => mockRemote.key!('select'))
    await act(() => { mockRemote.back!() })
    expect(onClose).not.toHaveBeenCalled()
    await act(() => { mockRemote.back!() })
    expect(onClose).toHaveBeenCalled()
  })

  it('shows a quality button once the embed reports qualities', async () => {
    await render(<PlayerView row={movie} siteUrl={SITE} onClose={jest.fn()} />)
    await act(async () => {})
    await post({ kind: 'bridge', data: { go10Bridge: 'caps', source: 'okru', frame: 'f', caps: { quality: { options: [{ value: 'sd', label: '480p' }, { value: 'hd', label: '720p' }], current: 'hd' } } } })
    await act(() => mockRemote.key!('select'))
    expect(screen.getByLabelText('Calidad: 720p')).toBeTruthy()
  })
})
```

The scrub test uses `jest.useFakeTimers()` inside the test (call it at the start, `jest.useRealTimers()` at the end) because TV uses a 400 ms seek coalesce. The existing phone tests keep passing unchanged (`mockTv.value = false`).

- [ ] **Step 6: Run, expect FAIL**, then wire `PlayerView.tsx`:
  1. `const tvUi = useMemo(isTvUi, [])` replaces the module-level `tv` for player behaviour (keep `Platform.isTV` only for style sizes).
  2. Session: `seekCoalesceMs: tvUi ? SEEK_COALESCE_MS : 0` with `const SEEK_COALESCE_MS = 400`.
  3. `const bridge = useEmbedBridge({ enabled: tvUi, webRef, viewTag: () => findNodeHandle(webRef.current), reloadToken: retry.reloadToken })`.
  4. WebView `source`: `bridge.ready ? { html: hostHtml(src, provider.origin, { bridgeOrigins: tvUi ? BRIDGE_ORIGINS : [] }), baseUrl: siteUrl } : { html: '<html><body style="background:#000"></body></html>', baseUrl: siteUrl }`. The load timeout effect must not start while `!bridge.ready`: add `bridge.ready` to its condition (`if (retry.status === 'loading' && bridge.ready)`) and deps.
  5. `focusable={!tvUi}`.
  6. `onMessage`: `else if (message?.kind === 'bridge') bridge.handle(message.data)` before the embed branch.
  7. TV state: `const [controls, setControls] = useState(initialTvControls)`, a `controlsRef` mirror, `const [toast, setToast] = useState<{target:number;at:number}|null>(null)`, `const [timeline, setTimeline] = useState(session.timeline())` refreshed in `onMessage` after `session.handle` (`if (tvUi) setTimeline(session.timeline())`).
  8. `dispatch(input)`: `const { state, effect } = tvControls(controlsRef.current, input); controlsRef.current = state; setControls(state); if (effect) run(effect)`. `run`: `seekBy` → `const t = session.seekBy(delta); if (t !== null) { setToast({ target: t, at: Date.now() }); setTimeline(session.timeline()) }`; `seekTo` → `session.seekTo(time); setTimeline(session.timeline())`; `togglePlay/play/pause` → session; `next/previous` → `onNext?.()/onPrev?.()`; `leave` → `leave()`; `pointerKey` → handled in Task 12 (no-op until then).
  9. Keys: `useRemoteKeys((key) => { if (tvUi) { dispatch({ type: 'key', key, now: Date.now() }); return } …existing phone code… })`. Back: `useBackPress(() => { if (tvUi) dispatch({ type: 'back' }); else …existing…; return true })`.
  10. Toast expiry: `useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 1500); return () => clearTimeout(t) }, [toast])`.
  11. Idle: `useEffect(() => { if (controls.mode !== 'open' && controls.mode !== 'scrubbing') return; const t = setTimeout(() => dispatch({ type: 'idle' }), OVERLAY_IDLE_MS); return () => clearTimeout(t) }, [controls])` — every state change (each key) restarts the timer.
  12. Render: when `tvUi`, render `<TvPlayerOverlay … />` instead of the old bar and handle; `onSetting` → `dispatch({ type: 'openMenu' })` + `setMenu(setting)` (state for Task 11; until then `setMenu` just stores it). Phone: unchanged JSX.

- [ ] **Step 7: Run all mobile tests + typecheck, expect PASS.**
- [ ] **Step 8: Commit** — `feat(mobile): TV player overlay with scrub bar and seek toast`.

---

### Task 11: Picker panel

**Files:**
- Create: `apps/mobile/src/player/tv/PickerPanel.tsx`, `apps/mobile/src/player/tv/PickerPanel.test.tsx`
- Modify: `apps/mobile/src/components/PlayerView.tsx`, `apps/mobile/src/components/PlayerView.test.tsx`

**Interfaces:**
- Consumes: `MergedChoice`, `BridgeSetting`, `SETTING_LABELS`; `bridge.set` (Task 9).
- Produces: `PickerPanel({ setting, choice, onPick(value: string): void })`; PlayerView state `menu: BridgeSetting | null`, `notice: string | null`.

- [ ] **Step 1: Failing tests** — `PickerPanel.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native'
import { PickerPanel } from './PickerPanel'

const choice = { options: [{ value: 'sd', label: '480p' }, { value: 'hd', label: '720p' }], current: 'hd', source: 'okru', frame: 'f' }

it('lists the options with the current one checked and focused first', async () => {
  await render(<PickerPanel setting="quality" choice={choice} onPick={jest.fn()} />)
  expect(screen.getByText('Calidad')).toBeTruthy()
  expect(screen.getByLabelText('720p').props.accessibilityState).toMatchObject({ selected: true })
  expect(screen.getByLabelText('720p').props.hasTVPreferredFocus).toBe(true)
  expect(screen.getByLabelText('480p').props.hasTVPreferredFocus).toBe(false)
})

it('picks an option', async () => {
  const onPick = jest.fn()
  await render(<PickerPanel setting="quality" choice={choice} onPick={onPick} />)
  fireEvent.press(screen.getByLabelText('480p'))
  expect(onPick).toHaveBeenCalledWith('sd')
})
```

PlayerView (TV describe):

```tsx
it('applies a quality from the panel, confirms it, and offers the pointer when it fails', async () => {
  jest.useFakeTimers()
  await render(<PlayerView row={movie} siteUrl={SITE} onClose={jest.fn()} />)
  await act(async () => {})
  await post({ kind: 'bridge', data: { go10Bridge: 'caps', source: 'okru', frame: 'f', caps: { quality: { options: [{ value: 'sd', label: '480p' }, { value: 'hd', label: '720p' }], current: 'hd' } } } })
  await act(() => mockRemote.key!('select'))
  fireEvent.press(screen.getByLabelText('Calidad: 720p'))
  fireEvent.press(screen.getByLabelText('480p'))
  expect(injected().at(-1)).toContain('"setting":"quality","value":"sd"')
  await post({ kind: 'bridge', data: { go10Bridge: 'result', id: 1, ok: true } })
  expect(screen.getByText('Calidad: 480p')).toBeTruthy()

  await act(() => mockRemote.key!('select'))
  fireEvent.press(screen.getByLabelText(/^Calidad/))
  fireEvent.press(screen.getByLabelText('720p'))
  await act(async () => { jest.advanceTimersByTime(3000) })
  expect(screen.getByText('No se pudo cambiar Calidad. Probá con Modo puntero.')).toBeTruthy()
  jest.useRealTimers()
})

it('Back closes the panel and keeps the overlay', async () => {
  await render(<PlayerView row={movie} siteUrl={SITE} onClose={jest.fn()} />)
  await act(async () => {})
  await post({ kind: 'bridge', data: { go10Bridge: 'caps', source: 'okru', frame: 'f', caps: { quality: { options: [{ value: 'sd', label: '480p' }, { value: 'hd', label: '720p' }], current: 'hd' } } } })
  await act(() => mockRemote.key!('select'))
  fireEvent.press(screen.getByLabelText('Calidad: 720p'))
  await act(() => { mockRemote.back!() })
  expect(screen.queryByLabelText('480p')).toBeNull()
  expect(screen.getByLabelText('Línea de tiempo')).toBeTruthy()
})
```

(Note "Probá" — Rioplatense voseo, matching the app's copy; check `grep -rn "Probá\|Prueba" apps/mobile/src` and match whatever form the app already uses.)

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement `PickerPanel.tsx`**

```tsx
import { Ionicons } from '@expo/vector-icons'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SETTING_LABELS, type BridgeSetting, type MergedChoice } from '@go10/core/player/bridge/protocol'
import { theme } from '../../theme'

/** One embed setting's options, on the right edge (spec: Android TV player controls → 1, picker panel). */
export function PickerPanel({ setting, choice, onPick }: { setting: BridgeSetting; choice: MergedChoice; onPick: (value: string) => void }) {
  const preferred = choice.current ?? choice.options[0].value
  return (
    <View style={styles.panel}>
      <Text style={styles.heading}>{SETTING_LABELS[setting]}</Text>
      <ScrollView contentContainerStyle={styles.list}>
        {choice.options.map((option) => {
          const selected = option.value === choice.current
          return (
            <Pressable key={option.value} accessibilityRole="button" accessibilityLabel={option.label}
              accessibilityState={{ selected }} hasTVPreferredFocus={option.value === preferred}
              onPress={() => onPick(option.value)} style={({ focused }) => [styles.item, focused && styles.itemFocused]}>
              {({ focused }) => (
                <>
                  <Text style={[styles.label, focused && styles.labelFocused]}>{option.label}</Text>
                  {selected && <Ionicons name="checkmark" size={14} color={focused ? theme.color.bg : theme.color.accent} />}
                </>
              )}
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  panel: { position: 'absolute', top: 0, right: 0, bottom: 0, width: 220, paddingTop: theme.space.safeY, paddingHorizontal: 14, backgroundColor: theme.color.scrim, borderLeftWidth: 1, borderLeftColor: theme.color.hairline },
  heading: { color: theme.color.textMuted, fontFamily: theme.font.monoMedium, fontSize: theme.size.eyebrow, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 },
  list: { gap: 4, paddingBottom: theme.space.safeY },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, borderRadius: theme.radius },
  itemFocused: { backgroundColor: theme.color.accent },
  label: { color: theme.color.text, fontFamily: theme.font.displaySemi, fontSize: theme.size.body },
  labelFocused: { color: theme.color.bg },
})
```

PlayerView: `const [menu, setMenu] = useState<BridgeSetting | null>(null)`, `const [notice, setNotice] = useState<string | null>(null)` (auto-clears after 2.5 s like the toast). When `controls.mode === 'menu' && menu && bridge.caps[menu]`, render `<PickerPanel setting={menu} choice={bridge.caps[menu]!} onPick={pick} />` over the overlay. If the mode leaves `menu` (Back), clear `menu`. `pick`:

```ts
const pick = (value: string) => {
  const setting = menu!
  const label = bridge.caps[setting]?.options.find((o) => o.value === value)?.label ?? value
  dispatch({ type: 'closeMenu' })
  void bridge.set(setting, value).then((ok) =>
    setNotice(ok ? `${SETTING_LABELS[setting]}: ${label}` : `No se pudo cambiar ${SETTING_LABELS[setting]}. Probá con Modo puntero.`))
}
```

Render `notice` as a pill at the top-centre (reuse the `reconnecting` style). If the embed later reports a different `current` (the confirmation `Calidad: 480p` test reads the notice, not the button) that's fine.

- [ ] **Step 4: Run all mobile tests, expect PASS; typecheck.**
- [ ] **Step 5: Commit** — `feat(mobile): TV settings picker for the embed's options`.

---

### Task 12: Pointer mode

**Files:**
- Create: `apps/mobile/src/player/tv/PointerLayer.tsx`, `apps/mobile/src/player/tv/pointerMove.ts` (+ tests)
- Modify: `apps/mobile/src/components/PlayerView.tsx`, `PlayerView.test.tsx`

**Interfaces:**
- Consumes: `TvEffect` `pointerKey` (Task 2), `tapWebView` (Task 6).
- Produces:

```ts
// pointerMove.ts — pure
export interface PointerState { x: number; y: number; run: { key: string; count: number; at: number } | null }
export function pointerStep(count: number): number // dp: 12 → 24 → 48
export function movePointer(state: PointerState, key: 'up' | 'down' | 'left' | 'right', now: number, size: { width: number; height: number }): PointerState
export function centerPointer(size: { width: number; height: number }): PointerState
// PointerLayer.tsx
export function PointerLayer(props: { x: number; y: number }): JSX.Element
```

- [ ] **Step 1: Failing tests** — `pointerMove.test.ts` (jest, plain TS):

```ts
import { centerPointer, movePointer, pointerStep } from './pointerMove'

const size = { width: 960, height: 540 }

it('starts centred', () => {
  expect(centerPointer(size)).toEqual({ x: 480, y: 270, run: null })
})

it('moves 12 dp per press and accelerates while held', () => {
  expect([1, 3, 4, 9, 10].map(pointerStep)).toEqual([12, 12, 24, 24, 48])
  let p = centerPointer(size)
  p = movePointer(p, 'right', 0, size)
  expect(p.x).toBe(492)
  for (let i = 1; i <= 4; i++) p = movePointer(p, 'right', i * 50, size)
  expect(p.x).toBe(492 + 12 * 2 + 24 * 2) // presses 2-3 step 12, 4-5 step 24
})

it('stays on screen', () => {
  let p = { x: 5, y: 5, run: null }
  p = movePointer(p, 'left', 0, size)
  p = movePointer(p, 'up', 1000, size)
  expect([p.x, p.y]).toEqual([0, 0])
  p = movePointer({ x: 955, y: 535, run: null }, 'right', 0, size)
  expect(p.x).toBe(959)
})
```

PlayerView TV test:

```tsx
it('pointer mode moves a cursor and taps the WebView where it is', async () => {
  const { tapWebView } = jest.requireMock('../player/embedBridge')
  await render(<PlayerView row={movie} siteUrl={SITE} onClose={jest.fn()} />)
  await act(async () => {})
  fireEvent(screen.getByTestId('player-root'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 960, height: 540 } } })
  await act(() => mockRemote.key!('select'))
  fireEvent.press(screen.getByLabelText('Modo puntero'))
  expect(screen.getByTestId('pointer')).toBeTruthy()
  await act(() => mockRemote.key!('right'))
  await act(() => mockRemote.key!('select'))
  expect(tapWebView).toHaveBeenCalledWith(expect.anything(), 492, 270)
  await act(() => { mockRemote.back!() })
  expect(screen.queryByTestId('pointer')).toBeNull()
})
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement** `pointerMove.ts`:

```ts
export interface PointerState { x: number; y: number; run: { key: string; count: number; at: number } | null }

const RUN_GAP_MS = 300

/** Pointer step for the n-th press of a held key: 12 dp, then 24, then 48. */
export function pointerStep(count: number): number {
  return count < 4 ? 12 : count < 10 ? 24 : 48
}

export function centerPointer({ width, height }: { width: number; height: number }): PointerState {
  return { x: Math.round(width / 2), y: Math.round(height / 2), run: null }
}

export function movePointer(state: PointerState, key: 'up' | 'down' | 'left' | 'right', now: number, { width, height }: { width: number; height: number }): PointerState {
  const count = state.run && state.run.key === key && now - state.run.at < RUN_GAP_MS ? state.run.count + 1 : 1
  const step = pointerStep(count)
  const dx = key === 'left' ? -step : key === 'right' ? step : 0
  const dy = key === 'up' ? -step : key === 'down' ? step : 0
  return {
    x: Math.min(width - 1, Math.max(0, state.x + dx)),
    y: Math.min(height - 1, Math.max(0, state.y + dy)),
    run: { key, count, at: now },
  }
}
```

`PointerLayer.tsx`:

```tsx
import { Ionicons } from '@expo/vector-icons'
import { StyleSheet, Text, View } from 'react-native'
import { theme } from '../../theme'

/** The TV pointer (spec: Android TV player controls → 3): drawn over the embed, never focusable. */
export function PointerLayer({ x, y }: { x: number; y: number }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View testID="pointer" style={[styles.cursor, { left: x - 2, top: y - 2 }]}>
        <Ionicons name="navigate" size={22} color={theme.color.accent} style={styles.icon} />
      </View>
      <Text style={styles.hint}>Flechas para mover · OK para tocar · Atrás para salir</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  cursor: { position: 'absolute' },
  icon: { transform: [{ rotate: '-90deg' }], textShadowColor: '#000', textShadowRadius: 4 },
  hint: {
    position: 'absolute', top: theme.space.safeY, alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999,
    backgroundColor: theme.color.scrim, color: theme.color.textMeta, fontFamily: theme.font.mono, fontSize: theme.size.meta,
  },
})
```

(Check the icon's tip lands at (x, y) on device; adjust the `left/top` offsets in Task 14 if not. The tap uses `(x, y)` exactly.)

PlayerView: `testID="player-root"` + `onLayout` on the root view storing `size`; `const [pointer, setPointer] = useState<PointerState | null>(null)`; when `controls.mode` becomes `'pointer'`, `setPointer(centerPointer(size))`; when it leaves, `setPointer(null)`. In `run(effect)`: `pointerKey` → `select` ⇒ `tapWebView(findNodeHandle(webRef.current), pointer.x, pointer.y)`; arrows ⇒ `setPointer(movePointer(pointer, key, Date.now(), size))` (use a ref mirror for `pointer` to avoid stale closures). Render `{pointer && <PointerLayer x={pointer.x} y={pointer.y} />}`. The WebView fills the root, so root coordinates are WebView coordinates.

- [ ] **Step 4: Run all mobile tests, expect PASS; typecheck.**
- [ ] **Step 5: Commit** — `feat(mobile): TV pointer mode taps the embed`.

---

### Task 13: Diagnostics panel and key log

**Files:**
- Create: `apps/mobile/src/player/tv/DiagnosticsPanel.tsx`, `apps/mobile/src/player/tv/DiagnosticsPanel.test.tsx`
- Modify: `apps/mobile/src/components/PlayerView.tsx`, `PlayerView.test.tsx`

**Interfaces:**
- Consumes: `bridge.status`, `bridge.log`, `bridge.caps` (Task 9); `webViewVersion()` (Task 6); `TvEffect`.
- Produces: `DiagnosticsPanel(props: { appVersion: string; android: string; webView: string; provider: string; status: BridgeStatus; caps: MergedCaps; keys: { key: string; effect: string }[]; log: BridgeLogEntry[] })`.

- [ ] **Step 1: Failing tests**

```tsx
import { render, screen } from '@testing-library/react-native'
import { DiagnosticsPanel } from './DiagnosticsPanel'

it('shows everything a tester needs in one photo', async () => {
  await render(<DiagnosticsPanel appVersion="1.0.0" android="12" webView="129.0.6668" provider="https://ok.ru" status="installed"
    caps={{ quality: { options: [{ value: 'sd', label: '480p' }, { value: 'hd', label: '720p' }], current: 'hd', source: 'okru', frame: 'f' } }}
    keys={[{ key: 'right', effect: 'seekBy' }, { key: 'select', effect: '—' }]}
    log={[{ at: 0, text: 'instalación: installed' }]} />)
  for (const text of ['App 1.0.0 · Android 12 · WebView 129.0.6668', 'Proveedor: https://ok.ru', 'Puente: installed',
    'Calidad (okru): 480p, 720p ← 720p', 'right → seekBy', 'select → —', 'instalación: installed']) {
    expect(screen.getByText(text)).toBeTruthy()
  }
})

it('says when no settings were found', async () => {
  await render(<DiagnosticsPanel appVersion="1" android="12" webView="?" provider="p" status="unsupported" caps={{}} keys={[]} log={[]} />)
  expect(screen.getByText('Ajustes: ninguno encontrado')).toBeTruthy()
})
```

PlayerView TV test: five quick `up`s after `select` show `screen.getByText(/^Puente:/)`; `back` hides it.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement** `DiagnosticsPanel.tsx` — a full-screen `View` with `backgroundColor: theme.color.scrim`, mono font at `theme.size.meta`, the lines exactly as the test expects, sections: header line, provider, bridge status, settings (one line per `BRIDGE_SETTINGS` entry present: `${SETTING_LABELS[s]} (${choice.source}): ${labels.join(', ')} ← ${currentLabel ?? '?'}`, else `Ajustes: ninguno encontrado`), "Teclas" (last 10, `${key} → ${effect}`), "Registro" (bridge log, newest last), and a footer `Atrás para cerrar`.

PlayerView: keep `keysRef`/state of the last 10 `{ key, effect: effect?.type ?? '—' }`, appended in the TV key path. Render the panel when `controls.mode === 'diagnostics'` with `appVersion={Constants.expoConfig?.version ?? '?'}`, `android={String(Platform.Version)}`, `webView={webViewVersion()}`, `provider={provider.origin}`.

- [ ] **Step 4: Run all mobile tests, expect PASS; typecheck.**
- [ ] **Step 5: Commit** — `feat(mobile): player diagnostics panel for TV testing`.

---

### Task 14: Phone verification over adb, tester checklist, release APK

**Files:**
- Create: `docs/android-tv-tester-checklist.md`
- Modify: `apps/mobile/package.json` (release ABIs), `docs/superpowers/spikes/2026-10-12-embed-bridge-probe.md` (results section)

- [ ] **Step 1: Release ABIs.** Change `build:release` to append `-PreactNativeArchitectures=arm64-v8a,armeabi-v7a` to the gradle call. Commit with Step 5.

- [ ] **Step 2: Phone run with the TV UI.** Build a debug APK with `GO10_FORCE_TV_UI=1` (Task 6 Step 8 command with the env var). Ask the user to install it on the phone. With the phone on adb, drive it: `adb shell input keyevent KEYCODE_DPAD_CENTER | KEYCODE_DPAD_RIGHT | KEYCODE_DPAD_LEFT | KEYCODE_DPAD_UP | KEYCODE_DPAD_DOWN | KEYCODE_BACK | KEYCODE_MEDIA_PLAY_PAUSE | KEYCODE_MEDIA_FAST_FORWARD`; held key: `adb shell input keyevent --longpress KEYCODE_DPAD_RIGHT`. Screenshot with `adb exec-out screencap -p > shot.png` (save in the scratchpad) and read it. Check, for one ok.ru title and one vidlove title:
  1. Right/Left with the overlay hidden: toast with the new time; the video jumps.
  2. Select → overlay; Up from the buttons to the timeline → Right ×3 → Select: one jump to the marker. Back, then Select again on the timeline: scrubbing restarts.
  3. Each settings button that appears: change it; the video changes (quality: visibly; subtitles appear; speed); the notice confirms.
  4. Modo puntero: move to the embed's own settings icon, Select opens its menu.
  5. Up ×5 in the overlay: diagnostics panel; Back closes; Back ×2 leaves.
  6. A phone build **without** the flag still plays with the old phone bar (regression check).
  Fix anything that fails (with a test where the failure is logic), and record results in the probe note under "## Phone verification".

- [ ] **Step 3: Tester checklist** — `docs/android-tv-tester-checklist.md`, in Spanish, short, for a non-developer:
  - Instalar: enable "Fuentes desconocidas" for the file manager / Send Files to TV / Downloader; open the APK; the GO10 icon appears in the apps row.
  - Prueba 1 (ok.ru): open any catalog episode; press ▶ / ⏸; ◀ ▶ with nothing on screen (should jump 10 s and show the time); OK opens the bar; go to the timeline, hold ▶, release, OK; try Calidad, Subtítulos (if present), Velocidad; try Modo puntero and open the player's own menu with it.
  - Prueba 2 (vidlove/TMDB title, if external titles are on in the build): same list.
  - Prueba 3: Atrás from each place (menu, timeline, puntero) — should only go back one step.
  - Qué fotografiar: the diagnostics panel (⬆ five times quickly with the bar open) **after** each prueba, plus a photo of anything that looks wrong, with one line of what was pressed.
  - Qué mandar: the photos and the TV model (Ajustes → Acerca de).

- [ ] **Step 4: Release APK.** `cd apps/mobile && npm run build:release`. Expect BUILD SUCCESSFUL and `android/app/build/outputs/apk/release/app-release.apk`. Report its path and size to the user; they send it to the tester.

- [ ] **Step 5: Full checks and commit** — from the repo root `npm test && npm run typecheck`; then commit `chore(mobile): release for 32- and 64-bit TVs; TV tester checklist` with the checklist, package.json and the probe note.

---

## Self-review notes

- Spec §1 overlay → Tasks 2, 10, 11; §2 bridge → Tasks 3–9; §3 pointer → Task 12; §4 diagnostics/checklist/ABIs → Tasks 13, 14; §5 testing → per-task tests + Task 14.
- Deviation from the spec: the spec lists a **Más** button for speed and server; this plan gives each its own button (**Velocidad**, **Servidor**), shown only when present — one level less to navigate on a remote. The diagnostics shortcut is Up ×5 with the overlay open (the spec's "hold Info" alternative is dropped: many remotes have no Info key, and RN delivers no long-press for it).
- Task 8 is the only task whose code is defined by findings (Task 7); its contract, guards, label map and test shape are fixed here.
