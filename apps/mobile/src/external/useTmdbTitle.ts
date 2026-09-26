import { useEffect, useState } from 'react'
import { readSnapshot } from '@go10/core/external/snapshots'
import { fetchTmdbTitle } from '@go10/core/external/tmdb/title'
import type { Title } from '@go10/core/types'

export type TmdbTitleState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; title: Title }
  | { status: 'not-found' }
  | { status: 'error' }

// Loaded while the app runs: served without asking TMDB again. (The web
// also keeps a sessionStorage copy; here a relaunch falls back on snapshots.)
const memory = new Map<string, Title>()

function initial(key: string | null): TmdbTitleState {
  if (!key) return { status: 'idle' }
  const title = memory.get(key) ?? readSnapshot(key)
  return title ? { status: 'ready', title } : { status: 'loading' }
}

/**
 * The TMDB title behind a `tmdb-*` key (the web hook, ported). Served at
 * once from memory or a played title's snapshot; a snapshot is refreshed in
 * the background and stays on screen if TMDB can't be reached.
 */
export function useTmdbTitle(key: string | null): TmdbTitleState {
  const [entry, setEntry] = useState(() => ({ key, state: initial(key) }))

  useEffect(() => {
    if (!key) return
    const cached = memory.get(key)
    if (cached) {
      setEntry({ key, state: { status: 'ready', title: cached } })
      return
    }
    const snapshot = readSnapshot(key)
    setEntry({ key, state: snapshot ? { status: 'ready', title: snapshot } : { status: 'loading' } })
    const controller = new AbortController()
    fetchTmdbTitle(key, controller.signal)
      .then((title) => {
        if (controller.signal.aborted) return
        if (title) {
          memory.set(title.key, title)
          setEntry({ key, state: { status: 'ready', title } })
        } else if (!snapshot) {
          setEntry({ key, state: { status: 'not-found' } })
        }
      })
      .catch(() => {
        if (!controller.signal.aborted && !snapshot) setEntry({ key, state: { status: 'error' } })
      })
    return () => controller.abort()
  }, [key])

  // Between a key change and its effect, don't report the previous key's state.
  return entry.key === key ? entry.state : initial(key)
}

export function resetTmdbTitleCacheForTests(): void {
  memory.clear()
}
