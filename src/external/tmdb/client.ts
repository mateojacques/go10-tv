import { externalTitlesEnabled, tmdbToken } from '../config'

/**
 * The only module that talks to TMDB. Everything goes through `tmdbGet`, so
 * swapping the browser-side token for a server proxy later touches this
 * file alone.
 */

const BASE = 'https://api.themoviedb.org/3'

export class TmdbError extends Error {
  /** HTTP status; 0 when no request was made (switch off, or disabled). */
  status: number

  constructor(status: number) {
    super(`TMDB request failed (${status})`)
    this.status = status
  }
}

// A rejected token won't start working mid-session; stop asking.
let unauthorized = false

export function tmdbAvailable(): boolean {
  return externalTitlesEnabled() && !unauthorized
}

export async function tmdbGet<T>(
  path: string,
  params: Record<string, string> = {},
  signal?: AbortSignal,
): Promise<T> {
  if (!tmdbAvailable()) throw new TmdbError(0)

  const url = new URL(BASE + path)
  url.searchParams.set('language', 'es-MX')
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${tmdbToken()}`, Accept: 'application/json' },
    signal,
  })
  if (response.status === 401) {
    unauthorized = true
    console.error('TMDB rejected the token (401); external titles are off for this session.')
  }
  if (!response.ok) throw new TmdbError(response.status)
  return (await response.json()) as T
}

export function resetTmdbClientForTests(): void {
  unauthorized = false
}
