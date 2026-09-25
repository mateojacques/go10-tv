import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetTmdbClientForTests, TmdbError, tmdbAvailable, tmdbGet } from './client'

function respond(status: number, body: unknown = {}) {
  return vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) })
}

beforeEach(() => {
  vi.stubEnv('VITE_EXTERNAL_TITLES', 'on')
  vi.stubEnv('VITE_TMDB_TOKEN', 'tok')
  resetTmdbClientForTests()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('tmdbGet', () => {
  it('sends the bearer token and es-MX, and encodes params intact', async () => {
    const fetch = respond(200, { ok: 1 })
    vi.stubGlobal('fetch', fetch)

    await expect(tmdbGet('/search/multi', { query: 'amélie & co' })).resolves.toEqual({ ok: 1 })

    const [input, init] = fetch.mock.calls[0]
    const url = new URL(String(input))
    expect(url.origin + url.pathname).toBe('https://api.themoviedb.org/3/search/multi')
    expect(url.searchParams.get('query')).toBe('amélie & co')
    expect(url.searchParams.get('language')).toBe('es-MX')
    expect(init.headers.Authorization).toBe('Bearer tok')
  })

  it('throws a TmdbError carrying the status', async () => {
    vi.stubGlobal('fetch', respond(404))
    await expect(tmdbGet('/movie/1')).rejects.toMatchObject({ status: 404 })
  })

  it('switches itself off for the session on 401', async () => {
    const fetch = respond(401)
    vi.stubGlobal('fetch', fetch)
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(tmdbGet('/movie/1')).rejects.toBeInstanceOf(TmdbError)
    expect(tmdbAvailable()).toBe(false)
    expect(error).toHaveBeenCalledOnce()

    await expect(tmdbGet('/movie/2')).rejects.toMatchObject({ status: 0 })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('never fetches while the switch is off', async () => {
    vi.stubEnv('VITE_EXTERNAL_TITLES', 'off')
    const fetch = respond(200)
    vi.stubGlobal('fetch', fetch)

    await expect(tmdbGet('/movie/1')).rejects.toMatchObject({ status: 0 })
    expect(fetch).not.toHaveBeenCalled()
  })
})
