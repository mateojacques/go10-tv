import { createElement, useSyncExternalStore } from 'react'

/**
 * `?tvdebug=1` (remembered; `?tvdebug=0` clears it): an on-screen log of what
 * each live TV embed reports and what the app sends it, for diagnosing a
 * browser we can't run here (Safari).
 */
const KEY = 'go10:tvdebug'
const MAX = 40

function readFlag(): boolean {
  try {
    const param = new URLSearchParams(window.location.search).get('tvdebug')
    if (param === '1') localStorage.setItem(KEY, '1')
    if (param === '0') localStorage.removeItem(KEY)
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

let enabled = readFlag()
let entries: string[] = []
const listeners = new Set<() => void>()
const started = Date.now()

export function enableTvDebugForTests(on: boolean) {
  enabled = on
  entries = []
}

export function debugEntries(): string[] {
  return entries
}

/** One line: seconds since load, the channel, what happened, and its payload. */
export function tvDebug(channelId: string, what: string, data?: unknown) {
  if (!enabled) return
  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  const payload = data === undefined ? '' : ` ${typeof data === 'string' ? data : JSON.stringify(data)}`
  entries = [...entries.slice(-(MAX - 1)), `${seconds}s ${channelId} ${what}${payload}`]
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function TvDebugPanel() {
  const lines = useSyncExternalStore(subscribe, debugEntries)
  if (!enabled) return null
  return createElement('pre', { className: 'go-tvdebug', role: 'log' }, lines.join('\n'))
}
