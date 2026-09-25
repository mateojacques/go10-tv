import { useSyncExternalStore } from 'react'

/**
 * How the user is steering right now, which decides whether the focus grid
 * shows itself.
 *
 * - `keys`: a TV remote or a keyboard. One item is always lit and holds real
 *   DOM focus, the 10-foot model the whole grid was built for.
 * - `pointer`: a mouse or a finger. Nothing stays lit; hover and taps speak
 *   for themselves, as on any website.
 *
 * A TV is always `keys`. Elsewhere the app starts in `pointer` and follows the
 * last input: an arrow or Enter switches to `keys`, a press switches back.
 */
export type InputMode = 'keys' | 'pointer'

/** Smart-TV and streaming-stick browsers, by the tokens their user agents carry. */
const TV_USER_AGENT =
  /Tizen|Web0S|webOS|SMART-TV|SmartTV|NetCast|BRAVIA|HbbTV|VIDAA|Android TV|GoogleTV|CrKey|Roku|\bAFT\w+/i

/** `?tv=1` forces TV mode on any browser (and `?tv=0` clears it), for testing. */
const TV_OVERRIDE_KEY = 'go10:tv'

export function isTvUserAgent(userAgent: string): boolean {
  return TV_USER_AGENT.test(userAgent)
}

function readTvOverride(): boolean | null {
  try {
    const param = new URLSearchParams(window.location.search).get('tv')
    if (param === '1') localStorage.setItem(TV_OVERRIDE_KEY, '1')
    if (param === '0') localStorage.removeItem(TV_OVERRIDE_KEY)
    return localStorage.getItem(TV_OVERRIDE_KEY) === '1' ? true : null
  } catch {
    return null
  }
}

const isTv = readTvOverride() ?? isTvUserAgent(navigator.userAgent)

let mode: InputMode = isTv ? 'keys' : 'pointer'
const listeners = new Set<() => void>()

export function getInputMode(): InputMode {
  return mode
}

export function setInputMode(next: InputMode) {
  // A TV's pointer (LG's Magic Remote) still means couch and remote.
  if (isTv && next === 'pointer') return
  if (next === mode) return
  mode = next
  listeners.forEach((listener) => listener())
}

const onPointerDown = () => setInputMode('pointer')

function subscribe(listener: () => void) {
  if (listeners.size === 0) window.addEventListener('pointerdown', onPointerDown, true)
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) window.removeEventListener('pointerdown', onPointerDown, true)
  }
}

export function useInputMode(): InputMode {
  return useSyncExternalStore(subscribe, getInputMode)
}
