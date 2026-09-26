import { useEffect, useState } from 'react'
import type { Title } from '@go10/core/types'
import { fetchTmdbTitle } from '@go10/core/external/tmdb/title'
import { readSnapshot } from '@go10/core/external/snapshots'

export type TmdbTitleState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; title: Title }
  | { status: 'not-found' }
  | { status: 'error' }

const SESSION_PREFIX = 'go10:tmdb-cache:'

// Loaded this session: served without asking TMDB again.
const memory = new Map<string, Title>()

function fresh(key: string): Title | null {
  const cached = memory.get(key)
  if (cached) return cached
  try {
    const raw = sessionStorage.getItem(SESSION_PREFIX + key)
    if (!raw) return null
    const title = JSON.parse(raw) as Title
    memory.set(key, title)
    return title
  } catch {
    return null
  }
}

function remember(title: Title): void {
  memory.set(title.key, title)
  try {
    sessionStorage.setItem(SESSION_PREFIX + title.key, JSON.stringify(title))
  } catch {
    // ignore
  }
}

function initial(key: string | null): TmdbTitleState {
  if (!key) return { status: 'idle' }
  const title = fresh(key) ?? readSnapshot(key)
  return title ? { status: 'ready', title } : { status: 'loading' }
}

/**
 * The TMDB title behind a `tmdb-*` key. Served at once from this session's
 * cache or a snapshot of a played title; a snapshot is then refreshed in the
 * background, and stays on screen if TMDB can't be reached.
 */
export function useTmdbTitle(key: string | null): TmdbTitleState {
  const [entry, setEntry] = useState(() => ({ key, state: initial(key) }))

  useEffect(() => {
    if (!key) return
    const cached = fresh(key)
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
          remember(title)
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
