export type RemoteKey =
  | 'up' | 'down' | 'left' | 'right' | 'select'
  | 'playPause' | 'play' | 'pause' | 'fastForward' | 'rewind' | 'next' | 'previous'

export type PlayerAction =
  | { type: 'seekBy'; delta: number }
  | { type: 'togglePlay' }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'openBar' }
  | { type: 'next' }
  | { type: 'previous' }

export const SEEK_STEP_SECONDS = 10

const KEYS = new Set<string>(['up', 'down', 'left', 'right', 'select', 'playPause', 'play', 'pause', 'fastForward', 'rewind', 'next', 'previous'])

/**
 * The player's TV key map (spec: Player → TV remote). While the bar is open
 * the D-pad and Select belong to the bar's buttons; media keys work either
 * way. Shared by apps/web and apps/mobile, so both remotes act alike.
 */
export function playerKeyAction(key: RemoteKey, barOpen: boolean): PlayerAction | null {
  switch (key) {
    case 'playPause':
      return { type: 'togglePlay' }
    case 'play':
      return { type: 'play' }
    case 'pause':
      return { type: 'pause' }
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
