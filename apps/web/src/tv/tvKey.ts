/** What a key does on the live TV screen, beyond the focus grid's arrows, OK and Back. */
export type TvKey =
  | { type: 'zap'; step: 1 | -1 }
  | { type: 'digit'; digit: string }
  | { type: 'previous' }
  | { type: 'list' }
  | { type: 'sound' }
  | { type: 'fullscreen' }

/**
 * Tizen delivers these keys (once registered, see platformTizen.ts) as
 * keyCodes, with no useful `key`.
 */
const BY_KEY_CODE: Record<number, TvKey> = {
  427: { type: 'zap', step: 1 }, // ChannelUp
  428: { type: 'zap', step: -1 }, // ChannelDown
  10190: { type: 'previous' }, // PreviousChannel (PRE-CH)
  10073: { type: 'list' }, // ChannelList
}

const BY_KEY: Record<string, TvKey> = {
  ChannelUp: { type: 'zap', step: 1 },
  ChannelDown: { type: 'zap', step: -1 },
  PageUp: { type: 'zap', step: -1 },
  PageDown: { type: 'zap', step: 1 },
  m: { type: 'sound' },
  M: { type: 'sound' },
  f: { type: 'fullscreen' },
  F: { type: 'fullscreen' },
}

/** The TV screen's key for a DOM keydown, or null. Modified presses belong to the browser. */
export function tvKeyFromEvent(event: Pick<KeyboardEvent, 'key' | 'keyCode' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>): TvKey | null {
  if (event.altKey || event.ctrlKey || event.metaKey) return null
  if (/^[0-9]$/.test(event.key)) return { type: 'digit', digit: event.key }
  if (event.keyCode >= 48 && event.keyCode <= 57) return { type: 'digit', digit: String(event.keyCode - 48) }
  return BY_KEY_CODE[event.keyCode] ?? BY_KEY[event.key] ?? null
}
