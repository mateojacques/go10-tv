import type { CatalogRow, Title } from '../../types'
import { tmdbEpisodeVideoId, tmdbTitleKey, type TmdbMedia } from './keys'

/**
 * TMDB JSON → the catalog's own `Title`/`CatalogRow` shapes, so every screen
 * renders a TMDB title exactly like a catalog one. Only the fields we read
 * are typed.
 */

const IMAGE_BASE = 'https://image.tmdb.org/t/p'
const VIDLOVE_EMBED = 'https://player.vidlove.cc/embed'

export interface TmdbGenre { id: number; name: string }
interface TmdbCompany { name: string }

export interface TmdbMovie {
  id: number
  title: string
  release_date?: string | null
  genres?: TmdbGenre[]
  production_companies?: TmdbCompany[]
  original_language?: string
  runtime?: number | null
  backdrop_path?: string | null
  poster_path?: string | null
}

export interface TmdbEpisode {
  season_number: number
  episode_number: number
  name?: string
  air_date?: string | null
  runtime?: number | null
  still_path?: string | null
}

export interface TmdbSeason {
  season_number: number
  episodes?: TmdbEpisode[]
}

export interface TmdbShow {
  id: number
  name: string
  first_air_date?: string | null
  genres?: TmdbGenre[]
  networks?: TmdbCompany[]
  production_companies?: TmdbCompany[]
  original_language?: string
  episode_run_time?: number[]
  backdrop_path?: string | null
  poster_path?: string | null
  seasons?: { season_number: number }[]
}

export interface TmdbSearchResult {
  id: number
  media_type?: string
  title?: string
  name?: string
  release_date?: string | null
  first_air_date?: string | null
  genre_ids?: number[]
  original_language?: string
  backdrop_path?: string | null
  poster_path?: string | null
}

/** 16:9 backdrop like our catalog art, else the poster; '' when neither exists. */
export function imageUrl(backdrop?: string | null, poster?: string | null): string {
  if (backdrop) return `${IMAGE_BASE}/w780${backdrop}`
  if (poster) return `${IMAGE_BASE}/w500${poster}`
  return ''
}

const languageNames = new Intl.DisplayNames(['es'], { type: 'language' })

/** ISO 639-1 → Spanish language name, capitalised as the catalog writes it ("Inglés"). */
export function languageName(code?: string): string {
  if (!code) return ''
  let name: string | undefined
  try {
    name = languageNames.of(code)
  } catch {
    name = undefined
  }
  if (!name || name.toLowerCase() === code.toLowerCase()) return code.toUpperCase()
  return name.charAt(0).toUpperCase() + name.slice(1)
}

function yearOf(date?: string | null): number | null {
  const year = date ? Number(date.slice(0, 4)) : NaN
  return Number.isFinite(year) && year > 0 ? year : null
}

function seconds(minutes?: number | null): number {
  return minutes && minutes > 0 ? minutes * 60 : 0
}

function baseTitle(fields: {
  key: string
  kind: Title['kind']
  title: string
  year: number | null
  studio: string
  genres: string[]
  language?: string
  thumbnail: string
}): Title {
  return {
    key: fields.key,
    kind: fields.kind,
    title: fields.title,
    year: fields.year,
    studio: fields.studio,
    source: '',
    genre: fields.genres[0] ?? '',
    genre_secondary: fields.genres[1] ?? '',
    quality: '',
    language: languageName(fields.language),
    subtitled: Boolean(fields.language) && fields.language !== 'es',
    thumbnail: fields.thumbnail,
    views: 0,
    durationSeconds: 0,
    catalogIndex: 0,
    seasons: [],
    external: true,
  }
}

function baseRow(title: Title): CatalogRow {
  return {
    catalog_index: 0,
    video_id: title.key,
    type: 'movie',
    title: title.title,
    title_raw: title.title,
    series_id: '',
    series_title: '',
    season_number: null,
    season_label: '',
    episode_number: null,
    chapter_start_seconds: null,
    chapter_end_seconds: null,
    year: title.year,
    studio: title.studio,
    source: '',
    genre: title.genre,
    genre_secondary: title.genre_secondary,
    quality: '',
    language: title.language,
    subtitled: title.subtitled,
    duration_raw: '',
    duration_seconds: 0,
    views: 0,
    thumbnail: title.thumbnail,
    video_url: '',
    embed_url: '',
    external: true,
  }
}

export function mapMovie(movie: TmdbMovie): Title {
  const title = baseTitle({
    key: tmdbTitleKey('movie', movie.id),
    kind: 'movie',
    title: movie.title,
    year: yearOf(movie.release_date),
    studio: movie.production_companies?.[0]?.name ?? '',
    genres: (movie.genres ?? []).map((g) => g.name),
    language: movie.original_language,
    thumbnail: imageUrl(movie.backdrop_path, movie.poster_path),
  })
  const embed = `${VIDLOVE_EMBED}/movie/${movie.id}`
  const duration = seconds(movie.runtime)
  return {
    ...title,
    durationSeconds: duration,
    seasons: [{ ...baseRow(title), duration_seconds: duration, embed_url: embed, video_url: embed }],
  }
}

/**
 * A show's aired episodes as one row each, ordered season → episode like the
 * catalog's `seasons`. Specials (season 0) and episodes without an air date,
 * or airing after `today`, are left out. Null when nothing is left.
 */
export function mapShow(show: TmdbShow, seasons: TmdbSeason[], today: string): Title | null {
  const title = baseTitle({
    key: tmdbTitleKey('tv', show.id),
    kind: 'show',
    title: show.name,
    year: yearOf(show.first_air_date),
    studio: show.networks?.[0]?.name ?? show.production_companies?.[0]?.name ?? '',
    genres: (show.genres ?? []).map((g) => g.name),
    language: show.original_language,
    thumbnail: imageUrl(show.backdrop_path, show.poster_path),
  })
  const fallbackRuntime = show.episode_run_time?.[0]

  const rows = seasons
    .flatMap((season) => season.episodes ?? [])
    .filter((ep) => ep.season_number > 0 && Boolean(ep.air_date) && (ep.air_date as string) <= today)
    .sort((a, b) => a.season_number - b.season_number || a.episode_number - b.episode_number)
    .map((ep): CatalogRow => {
      const embed = `${VIDLOVE_EMBED}/tv/${show.id}/${ep.season_number}/${ep.episode_number}`
      return {
        ...baseRow(title),
        video_id: tmdbEpisodeVideoId(show.id, ep.season_number, ep.episode_number),
        type: 'episode',
        title: ep.name || `Episodio ${ep.episode_number}`,
        title_raw: ep.name ?? '',
        series_id: title.key,
        series_title: title.title,
        season_number: ep.season_number,
        season_label: `Temporada ${ep.season_number}`,
        episode_number: ep.episode_number,
        year: yearOf(ep.air_date) ?? title.year,
        duration_seconds: seconds(ep.runtime ?? fallbackRuntime),
        thumbnail: ep.still_path ? `${IMAGE_BASE}/w780${ep.still_path}` : title.thumbnail,
        embed_url: embed,
        video_url: embed,
      }
    })

  if (rows.length === 0) return null
  return { ...title, durationSeconds: rows[0].duration_seconds, seasons: rows }
}

/**
 * A search hit as a card-only title: `seasons` stays empty until Detail
 * fetches the full record. `media` is the endpoint's type for
 * `search/movie`/`search/tv`, whose results carry no `media_type`.
 */
export function mapSearchResult(
  result: TmdbSearchResult,
  genres: Map<number, string>,
  media?: TmdbMedia,
): Title | null {
  const type = media ?? result.media_type
  if (type !== 'movie' && type !== 'tv') return null
  const name = type === 'movie' ? result.title : result.name
  const thumbnail = imageUrl(result.backdrop_path, result.poster_path)
  if (!name || !thumbnail) return null

  return baseTitle({
    key: tmdbTitleKey(type, result.id),
    kind: type === 'tv' ? 'show' : 'movie',
    title: name,
    year: yearOf(type === 'movie' ? result.release_date : result.first_air_date),
    studio: '',
    genres: (result.genre_ids ?? []).map((id) => genres.get(id)).filter((g): g is string => Boolean(g)),
    language: result.original_language,
    thumbnail,
  })
}
