export interface PointerState { x: number; y: number; run: { key: string; count: number; at: number } | null }
type Size = { width: number; height: number }

const RUN_GAP_MS = 300

/** Pointer step for the n-th press of a held key: 12 dp, then 24, then 48. */
export function pointerStep(count: number): number {
  return count < 4 ? 12 : count < 10 ? 24 : 48
}

export function centerPointer({ width, height }: Size): PointerState {
  return { x: Math.round(width / 2), y: Math.round(height / 2), run: null }
}

/** The TV pointer after one arrow press, kept on screen (spec: Android TV player controls → 3). */
export function movePointer(state: PointerState, key: 'up' | 'down' | 'left' | 'right', now: number, { width, height }: Size): PointerState {
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
