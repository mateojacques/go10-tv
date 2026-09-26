import type { Title } from '../../types'
import type { Section } from '../../catalog/selectTitles'
import { tmdbGet } from './client'
import type { TmdbMedia } from './keys'
import { mapSearchResult, type TmdbGenre, type TmdbSearchResult } from './map'

const ENDPOINTS: Record<Section, string> = { all: '/search/multi', movie: '/search/movie', show: '/search/tv' }
/** `search/movie` and `search/tv` results carry no `media_type`. */
const MEDIA: Record<Section, TmdbMedia | undefined> = { all: undefined, movie: 'movie', show: 'tv' }

let genres: Promise<Map<number, string>> | null = null

/** Genre id → es-MX name, movie and TV lists merged; fetched once per session. */
function genreNames(): Promise<Map<number, string>> {
  // Deliberately not abortable: it's shared by every search.
  genres ??= Promise.all([
    tmdbGet<{ genres: TmdbGenre[] }>('/genre/movie/list'),
    tmdbGet<{ genres: TmdbGenre[] }>('/genre/tv/list'),
  ])
    .then(([movie, tv]) => new Map([...movie.genres, ...tv.genres].map((g) => [g.id, g.name])))
    .catch((error: unknown) => {
      genres = null
      throw error
    })
  return genres
}

/** First page of TMDB hits for a query, as card-only titles. */
export async function searchTmdb(query: string, section: Section, signal?: AbortSignal): Promise<Title[]> {
  const [names, page] = await Promise.all([
    genreNames(),
    tmdbGet<{ results: TmdbSearchResult[] }>(
      ENDPOINTS[section],
      { query, include_adult: 'false', page: '1' },
      signal,
    ),
  ])
  return page.results
    .map((result) => mapSearchResult(result, names, MEDIA[section]))
    .filter((title): title is Title => title !== null)
}

export function resetGenresForTests(): void {
  genres = null
}
