import type { RemoteKey } from '../player/playerKeys'

/**
 * TV: which way a D-pad press moves the hero carousel. The actions row traps
 * focus sideways, so ← on Reproducir and → on Más información go nowhere
 * natively and change the slide instead; presses between the buttons are
 * plain focus moves. `focused` is read at key-down, before the native focus
 * move is reported to JS.
 */
export function edgeStep(key: RemoteKey, focused: 'play' | 'info' | null): -1 | 0 | 1 {
  if (key === 'left' && focused === 'play') return -1
  if (key === 'right' && focused === 'info') return 1
  return 0
}
