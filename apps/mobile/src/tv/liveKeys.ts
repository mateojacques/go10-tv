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
