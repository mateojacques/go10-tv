import type { RemoteKey } from '@go10/core/player/playerKeys'

/**
 * Tizen's media keys arrive as keyCodes (once registered, see
 * platformTizen.ts), with no useful `key`. Desktop keyboards and tests send
 * the standard `key` names instead.
 */
const BY_KEY_CODE: Record<number, RemoteKey> = {
  10252: 'playPause', // MediaPlayPause
  415: 'play', // MediaPlay
  19: 'pause', // MediaPause
  417: 'fastForward', // MediaFastForward
  412: 'rewind', // MediaRewind
  10233: 'next', // MediaTrackNext
  10232: 'previous', // MediaTrackPrevious
}

const BY_KEY: Record<string, RemoteKey> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'select',
  MediaPlayPause: 'playPause',
  MediaPlay: 'play',
  MediaPause: 'pause',
  MediaFastForward: 'fastForward',
  MediaRewind: 'rewind',
  MediaTrackNext: 'next',
  MediaTrackPrevious: 'previous',
}

/** The player's key for a DOM keydown, or null. Modified presses belong to the browser. */
export function remoteKeyFromEvent(event: Pick<KeyboardEvent, 'key' | 'keyCode' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>): RemoteKey | null {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null
  return BY_KEY_CODE[event.keyCode] ?? BY_KEY[event.key] ?? null
}
