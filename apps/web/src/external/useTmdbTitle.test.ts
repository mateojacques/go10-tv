import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { resetTmdbTitleCacheForTests, useTmdbTitle } from './useTmdbTitle'
import { resetTmdbClientForTests } from './tmdb/client'
import { saveSnapshot } from './snapshots'
import { mapMovie, type TmdbMovie } from './tmdb/map'
import { enableExternalTitles, tmdbFetch } from './testing'

const MOVIE: TmdbMovie = { id: 155, title: 'Batman: El caballero de la noche', release_date: '2008-07-16', backdrop_path: '/b.jpg' }

beforeEach(() => {
  enableExternalTitles()
  resetTmdbClientForTests()
  resetTmdbTitleCacheForTests()
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('useTmdbTitle', () => {
  it('is idle without a key', () => {
    const { result } = renderHook(() => useTmdbTitle(null))
    expect(result.current).toEqual({ status: 'idle' })
  })

  it('loads a movie', async () => {
    vi.stubGlobal('fetch', tmdbFetch({ '/movie/155': MOVIE }))
    const { result } = renderHook(() => useTmdbTitle('tmdb-movie-155'))
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.status === 'ready' && result.current.title.title).toBe('Batman: El caballero de la noche')
  })

  it('loads a show with its seasons in batches of 20', async () => {
    const numbers = Array.from({ length: 21 }, (_, i) => i + 1)
    const fetch = tmdbFetch({
      '/tv/7': (url: URL) => {
        const append = url.searchParams.get('append_to_response')
        if (!append) return { id: 7, name: 'Larga', seasons: [{ season_number: 0 }, ...numbers.map((n) => ({ season_number: n }))] }
        const parts = append.split(',')
        expect(parts.length).toBeLessThanOrEqual(20)
        return Object.fromEntries(parts.map((part) => {
          const n = Number(part.split('/')[1])
          return [part, { season_number: n, episodes: [{ season_number: n, episode_number: 1, name: `E${n}`, air_date: '2000-01-01' }] }]
        }))
      },
    })
    vi.stubGlobal('fetch', fetch)

    const { result } = renderHook(() => useTmdbTitle('tmdb-tv-7'))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.status === 'ready' && result.current.title.seasons).toHaveLength(21)
    expect(fetch).toHaveBeenCalledTimes(3) // details + two season batches
  })

  it('is not-found on 404', async () => {
    vi.stubGlobal('fetch', tmdbFetch({}))
    const { result } = renderHook(() => useTmdbTitle('tmdb-movie-404'))
    await waitFor(() => expect(result.current.status).toBe('not-found'))
  })

  it('is not-found, without fetching, for a key it cannot parse', async () => {
    const fetch = tmdbFetch({})
    vi.stubGlobal('fetch', fetch)
    const { result } = renderHook(() => useTmdbTitle('tmdb-person-3'))
    await waitFor(() => expect(result.current.status).toBe('not-found'))
    expect(fetch).not.toHaveBeenCalled()
  })

  it('is error on a network failure', async () => {
    vi.stubGlobal('fetch', tmdbFetch({ '/movie/155': () => { throw new TypeError('offline') } }))
    const { result } = renderHook(() => useTmdbTitle('tmdb-movie-155'))
    await waitFor(() => expect(result.current.status).toBe('error'))
  })

  it('serves a snapshot at once, and keeps it while TMDB is unreachable', async () => {
    saveSnapshot(mapMovie(MOVIE))
    const fetch = tmdbFetch({ '/movie/155': () => { throw new TypeError('offline') } })
    vi.stubGlobal('fetch', fetch)

    const { result } = renderHook(() => useTmdbTitle('tmdb-movie-155'))
    expect(result.current.status).toBe('ready')
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(result.current.status).toBe('ready')
  })

  it('does not refetch a title already loaded this session', async () => {
    const fetch = tmdbFetch({ '/movie/155': MOVIE })
    vi.stubGlobal('fetch', fetch)

    const first = renderHook(() => useTmdbTitle('tmdb-movie-155'))
    await waitFor(() => expect(first.result.current.status).toBe('ready'))
    first.unmount()

    const second = renderHook(() => useTmdbTitle('tmdb-movie-155'))
    expect(second.result.current.status).toBe('ready')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
