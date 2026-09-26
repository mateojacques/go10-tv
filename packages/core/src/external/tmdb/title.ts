import type { Title } from '../../types'
import { TmdbError, tmdbGet } from './client'
import { parseTmdbKey } from './keys'
import { mapMovie, mapShow, type TmdbMovie, type TmdbSeason, type TmdbShow } from './map'

/** TMDB caps `append_to_response` at 20 sub-requests. */
const SEASONS_PER_CALL = 20

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

async function fetchSeasons(id: number, numbers: number[], signal?: AbortSignal): Promise<TmdbSeason[]> {
  const batches: number[][] = []
  for (let i = 0; i < numbers.length; i += SEASONS_PER_CALL) batches.push(numbers.slice(i, i + SEASONS_PER_CALL))

  const responses = await Promise.all(
    batches.map((batch) =>
      tmdbGet<Record<string, TmdbSeason | undefined>>(
        `/tv/${id}`,
        { append_to_response: batch.map((n) => `season/${n}`).join(',') },
        signal,
      ).then((response) => batch.map((n) => response[`season/${n}`])),
    ),
  )
  return responses.flat().filter((season): season is TmdbSeason => Boolean(season))
}

/** The full title behind a `tmdb-*` key; null when TMDB doesn't know it. */
export async function fetchTmdbTitle(key: string, signal?: AbortSignal): Promise<Title | null> {
  const parsed = parseTmdbKey(key)
  if (!parsed) return null
  try {
    if (parsed.media === 'movie') return mapMovie(await tmdbGet<TmdbMovie>(`/movie/${parsed.id}`, {}, signal))

    const show = await tmdbGet<TmdbShow>(`/tv/${parsed.id}`, {}, signal)
    const numbers = (show.seasons ?? []).map((s) => s.season_number).filter((n) => n > 0)
    return mapShow(show, await fetchSeasons(parsed.id, numbers, signal), today())
  } catch (error) {
    if (error instanceof TmdbError && error.status === 404) return null
    throw error
  }
}
