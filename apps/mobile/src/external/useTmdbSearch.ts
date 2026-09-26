import { useEffect, useState } from 'react'
import type { Section } from '@go10/core/catalog/selectTitles'
import type { TmdbSearchState } from '@go10/core/external/mergeSearch'
import { tmdbAvailable } from '@go10/core/external/tmdb/client'
import { resetGenresForTests, searchTmdb } from '@go10/core/external/tmdb/search'
import { normalize } from '@go10/core/search/search'
import type { Title } from '@go10/core/types'

/** The web's own values (apps/web/src/external/useTmdbSearch.ts). */
export const TMDB_DEBOUNCE_MS = 400
export const SEARCH_MIN_CHARS = 2

const OFF: TmdbSearchState = { status: 'off', titles: [] }
const PENDING: TmdbSearchState = { status: 'pending', titles: [] }
const FAILED: TmdbSearchState = { status: 'failed', titles: [] }

// Per query and section, for the app's life: re-typing a query costs nothing.
const cache = new Map<string, Title[]>()

/**
 * TMDB hits for a search, once typing settles (the web hook, ported).
 * `enabled` is the caller's say ("Doblaje latino" turns it off); the switch
 * and a rejected token turn it off regardless.
 */
export function useTmdbSearch(query: string, section: Section, enabled: boolean): TmdbSearchState {
  const trimmed = query.trim()
  const active = enabled && tmdbAvailable() && trimmed.length >= SEARCH_MIN_CHARS
  const cacheKey = `${section}|${normalize(trimmed)}`
  const [result, setResult] = useState<{ key: string; state: TmdbSearchState } | null>(null)

  useEffect(() => {
    if (!active || cache.has(cacheKey)) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      searchTmdb(trimmed, section, controller.signal)
        .then((titles) => {
          if (controller.signal.aborted) return
          cache.set(cacheKey, titles)
          setResult({ key: cacheKey, state: { status: 'done', titles } })
        })
        .catch(() => {
          if (!controller.signal.aborted) setResult({ key: cacheKey, state: FAILED })
        })
    }, TMDB_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
    // `trimmed` and `section` are folded into `cacheKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, cacheKey])

  if (!active) return OFF
  const cached = cache.get(cacheKey)
  if (cached) return { status: 'done', titles: cached }
  if (result?.key === cacheKey) return result.state
  return PENDING
}

export function resetTmdbSearchForTests(): void {
  cache.clear()
  resetGenresForTests()
}
