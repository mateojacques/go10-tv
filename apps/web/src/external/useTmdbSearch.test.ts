import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { resetTmdbSearchForTests, useTmdbSearch } from './useTmdbSearch'
import { resetTmdbClientForTests } from './tmdb/client'
import { enableExternalTitles, tmdbFetch } from './testing'

const GENRES = {
  '/genre/movie/list': { genres: [{ id: 28, name: 'Acción' }] },
  '/genre/tv/list': { genres: [{ id: 18, name: 'Drama' }] },
}
const BATMAN = { id: 155, media_type: 'movie', title: 'Batman', genre_ids: [28], backdrop_path: '/b.jpg' }
const BB = { id: 1396, name: 'Breaking Bad', genre_ids: [18], poster_path: '/p.jpg' }

const searchCalls = (fetch: ReturnType<typeof tmdbFetch>) =>
  fetch.mock.calls.filter(([input]) => String(input).includes('/search/'))

beforeEach(() => {
  enableExternalTitles()
  resetTmdbClientForTests()
  resetTmdbSearchForTests()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('useTmdbSearch', () => {
  it('searches everything with search/multi and maps the hits', async () => {
    const fetch = tmdbFetch({ ...GENRES, '/search/multi': { results: [BATMAN, { id: 9, media_type: 'person', name: 'X' }] } })
    vi.stubGlobal('fetch', fetch)

    const { result } = renderHook(() => useTmdbSearch('batman', 'all', true))
    expect(result.current.status).toBe('pending')
    await waitFor(() => expect(result.current.status).toBe('done'))
    expect(result.current.titles.map((t) => [t.key, t.genre])).toEqual([['tmdb-movie-155', 'Acción']])

    const url = new URL(String(searchCalls(fetch)[0][0]))
    expect(url.searchParams.get('query')).toBe('batman')
    expect(url.searchParams.get('include_adult')).toBe('false')
  })

  it('uses the section endpoint, typing results by it', async () => {
    vi.stubGlobal('fetch', tmdbFetch({ ...GENRES, '/search/tv': { results: [BB] } }))
    const { result } = renderHook(() => useTmdbSearch('breaking', 'show', true))
    await waitFor(() => expect(result.current.status).toBe('done'))
    expect(result.current.titles[0]).toMatchObject({ key: 'tmdb-tv-1396', kind: 'show', genre: 'Drama' })
  })

  it('is off when disabled, or for fewer than 2 characters, without fetching', async () => {
    const fetch = tmdbFetch(GENRES)
    vi.stubGlobal('fetch', fetch)
    expect(renderHook(() => useTmdbSearch('batman', 'all', false)).result.current.status).toBe('off')
    expect(renderHook(() => useTmdbSearch(' b ', 'all', true)).result.current.status).toBe('off')
    await new Promise((resolve) => setTimeout(resolve, 450))
    expect(fetch).not.toHaveBeenCalled()
  })

  it('is off while the switch is off', () => {
    vi.stubEnv('VITE_EXTERNAL_TITLES', 'off')
    expect(renderHook(() => useTmdbSearch('batman', 'all', true)).result.current.status).toBe('off')
  })

  it('debounces a burst of typing into one request', async () => {
    const fetch = tmdbFetch({ ...GENRES, '/search/multi': { results: [BATMAN] } })
    vi.stubGlobal('fetch', fetch)

    const { result, rerender } = renderHook(({ q }) => useTmdbSearch(q, 'all', true), { initialProps: { q: 'ba' } })
    rerender({ q: 'bat' })
    rerender({ q: 'batm' })
    await waitFor(() => expect(result.current.status).toBe('done'))
    expect(searchCalls(fetch)).toHaveLength(1)
    expect(new URL(String(searchCalls(fetch)[0][0])).searchParams.get('query')).toBe('batm')
  })

  it('reports a failure', async () => {
    vi.stubGlobal('fetch', tmdbFetch(GENRES)) // no /search/multi route -> 404
    const { result } = renderHook(() => useTmdbSearch('batman', 'all', true))
    await waitFor(() => expect(result.current.status).toBe('failed'))
    expect(result.current.titles).toEqual([])
  })

  it('serves a repeated query from cache', async () => {
    const fetch = tmdbFetch({ ...GENRES, '/search/multi': { results: [BATMAN] } })
    vi.stubGlobal('fetch', fetch)
    const first = renderHook(() => useTmdbSearch('batman', 'all', true))
    await waitFor(() => expect(first.result.current.status).toBe('done'))
    first.unmount()

    const second = renderHook(() => useTmdbSearch('Batman ', 'all', true))
    expect(second.result.current.status).toBe('done')
    expect(searchCalls(fetch)).toHaveLength(1)
  })
})
