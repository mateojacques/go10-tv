/**
 * Keys for TMDB titles. Namespaced so they can never collide with catalog
 * keys (`series_id` slugs and numeric ok.ru ids), and so a route alone says
 * where a title comes from.
 */
export type TmdbMedia = 'movie' | 'tv'

const PREFIX = 'tmdb-'
const PATTERN = /^tmdb-(movie|tv)-(\d+)(?:-s\d+e\d+)?$/

export function tmdbTitleKey(media: TmdbMedia, id: number): string {
  return `${PREFIX}${media}-${id}`
}

/** A TV episode's row id — and the key its watch progress is stored under. */
export function tmdbEpisodeVideoId(id: number, season: number, episode: number): string {
  return `${PREFIX}tv-${id}-s${season}e${episode}`
}

export function isTmdbKey(key: string): boolean {
  return key.startsWith(PREFIX)
}

/** The TMDB media and id behind a title key or a row's video id. */
export function parseTmdbKey(key: string): { media: TmdbMedia; id: number } | null {
  const match = PATTERN.exec(key)
  return match ? { media: match[1] as TmdbMedia, id: Number(match[2]) } : null
}
