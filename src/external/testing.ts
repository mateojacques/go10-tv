import { vi } from 'vitest'

/** Turns the external-titles switch on for the current test (undo: `vi.unstubAllEnvs()`). */
export function enableExternalTitles(): void {
  vi.stubEnv('VITE_EXTERNAL_TITLES', 'on')
  vi.stubEnv('VITE_TMDB_TOKEN', 'test-token')
}

type Route = unknown | ((url: URL) => unknown)

/**
 * A `fetch` mock that answers TMDB paths (e.g. `/movie/155`, no `/3`) from
 * `routes` — a value, or a function of the request URL (which may throw to
 * simulate a network failure). Unknown TMDB paths get a 404. Any other URL
 * goes to `fallback`, e.g. the catalog CSV.
 */
export function tmdbFetch(routes: Record<string, Route>, fallback?: (input: string) => Promise<unknown>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost')
    if (url.hostname === 'api.themoviedb.org') {
      const route = routes[url.pathname.replace(/^\/3/, '')]
      if (route === undefined) return { ok: false, status: 404, json: async () => ({}) }
      const body = typeof route === 'function' ? (route as (url: URL) => unknown)(url) : route
      return { ok: true, status: 200, json: async () => body }
    }
    if (fallback) return fallback(String(input))
    throw new Error(`unexpected fetch: ${String(input)}`)
  })
}
