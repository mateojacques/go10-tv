import type { Timeline } from './playbackSession'
import { playerKeyAction, SEEK_STEP_SECONDS, type RemoteKey } from './playerKeys'

export type TvMode = 'hidden' | 'open' | 'scrubbing' | 'menu' | 'pointer' | 'diagnostics'

export interface TvControlsState {
  mode: TvMode
  /** While scrubbing: the marker, and the range it moves in. */
  scrub: { target: number; start: number; end: number | null } | null
  /** The current run of one arrow key, for scrub acceleration. */
  run: { key: 'left' | 'right'; count: number; at: number } | null
  /** Recent Up presses while open (five quick ones open diagnostics). */
  ups: number[]
}

export type TvInput =
  | { type: 'key'; key: RemoteKey; now: number }
  | { type: 'back' }
  | { type: 'idle' }
  | { type: 'scrubFocus'; timeline: Timeline }
  | { type: 'scrubBlur' }
  /** OK on the timeline (its onPress): enters scrubbing, or commits the marker while scrubbing. */
  | { type: 'scrubPress'; timeline: Timeline }
  | { type: 'openMenu' }
  | { type: 'closeMenu' }
  | { type: 'pointer' }

export type TvEffect =
  | { type: 'seekBy'; delta: number }
  | { type: 'seekTo'; time: number }
  | { type: 'togglePlay' }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'pointerKey'; key: 'up' | 'down' | 'left' | 'right' | 'select' }
  | { type: 'leave' }

type Step = { state: TvControlsState; effect: TvEffect | null }

export const initialTvControls: TvControlsState = { mode: 'hidden', scrub: null, run: null, ups: [] }
export const OVERLAY_IDLE_MS = 5000
const RUN_GAP_MS = 300
const DIAGNOSTICS_TAPS = 5
const DIAGNOSTICS_WINDOW_MS = 2000

/** Scrub step for the n-th press of a held key: 10 s, then 30 s, then 60 s. */
export function scrubStep(count: number): number {
  return count < 5 ? 10 : count < 15 ? 30 : 60
}

function isDpad(key: RemoteKey): key is 'up' | 'down' | 'left' | 'right' | 'select' {
  return key === 'up' || key === 'down' || key === 'left' || key === 'right' || key === 'select'
}

/**
 * The TV player overlay (spec: Android TV player controls → 1). Pure: the
 * view feeds it remote keys and focus changes and carries out the effect.
 * In `open` and `menu` the D-pad belongs to native focus, so keys return null.
 */
export function tvControls(state: TvControlsState, input: TvInput): Step {
  const to = (patch: Partial<TvControlsState>, effect: TvEffect | null = null): Step => ({ state: { ...state, ...patch }, effect })
  const stay: Step = { state, effect: null }

  switch (input.type) {
    case 'back':
      if (state.mode === 'hidden') return { state, effect: { type: 'leave' } }
      if (state.mode === 'open') return to({ mode: 'hidden', ups: [] })
      return to({ mode: 'open', scrub: null, run: null, ups: [] })
    case 'idle':
      return state.mode === 'open' || state.mode === 'scrubbing' ? to({ mode: 'hidden', scrub: null, run: null, ups: [] }) : stay
    case 'scrubPress':
      if (state.mode === 'scrubbing' && state.scrub) {
        return to({ mode: 'open', scrub: null, run: null }, { type: 'seekTo', time: state.scrub.target })
      }
      return startScrub(input.timeline, to)
    case 'scrubFocus':
      return startScrub(input.timeline, to)
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

function startScrub({ time, start, end }: Timeline, to: (patch: Partial<TvControlsState>) => Step): Step {
  return to({ mode: 'scrubbing', scrub: { target: time, start, end }, run: null })
}

function onKey(
  state: TvControlsState,
  key: RemoteKey,
  now: number,
  to: (patch: Partial<TvControlsState>, effect?: TvEffect | null) => Step,
): Step {
  const none: Step = { state, effect: null }
  if (state.mode === 'pointer') return isDpad(key) ? { state, effect: { type: 'pointerKey', key } } : none
  if (state.mode === 'diagnostics') return none

  if (state.mode === 'scrubbing' && state.scrub) {
    const dir = key === 'right' || key === 'fastForward' ? 'right' : key === 'left' || key === 'rewind' ? 'left' : null
    if (dir) {
      const count = state.run && state.run.key === dir && now - state.run.at < RUN_GAP_MS ? state.run.count + 1 : 1
      const { start, end } = state.scrub
      let target = Math.max(start, state.scrub.target + (dir === 'right' ? 1 : -1) * scrubStep(count))
      if (end !== null) target = Math.min(target, Math.max(start, end - 1))
      return to({ scrub: { ...state.scrub, target }, run: { key: dir, count, at: now } })
    }
    // Select is the timeline's onPress (scrubPress); the key event itself is ignored here.
    if (key === 'select') return none
  }

  // Media keys (barOpen=true makes playerKeyAction leave the D-pad alone).
  const media = playerKeyAction(key, true)
  if (media && media.type !== 'openBar') return { state, effect: media }

  if (state.mode === 'hidden') {
    if (key === 'right') return { state, effect: { type: 'seekBy', delta: SEEK_STEP_SECONDS } }
    if (key === 'left') return { state, effect: { type: 'seekBy', delta: -SEEK_STEP_SECONDS } }
    if (key === 'select' || key === 'up' || key === 'down' || key === 'info') return to({ mode: 'open', ups: [] })
    return none
  }

  // Scrubbing too: the first Up from the buttons moves focus onto the timeline.
  if ((state.mode === 'open' || state.mode === 'scrubbing') && key === 'up') {
    const ups = [...state.ups.filter((t) => now - t < DIAGNOSTICS_WINDOW_MS), now]
    return ups.length >= DIAGNOSTICS_TAPS ? to({ mode: 'diagnostics', scrub: null, run: null, ups: [] }) : to({ ups })
  }
  return none
}
