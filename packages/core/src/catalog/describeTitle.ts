import { formatDuration } from '../lib/format'
import { groupSeasons } from '../player/groupSeasons'
import type { Title } from '../types'

/** "3 temporadas", or "26 episodios" for a single season of episodes. */
export function showExtent(title: Title): string {
  const seasons = groupSeasons(title.seasons)
  if (seasons.length > 1) return `${seasons.length} temporadas`
  const rows = seasons[0]?.rows ?? []
  return rows.length > 1 ? `${rows.length} episodios` : formatDuration(title.durationSeconds)
}

/** The hero's metadata line: extent (shows) or runtime (movies), year, quality, language. */
export function heroMeta(title: Title): string[] {
  return [
    title.kind === 'show' ? showExtent(title) : formatDuration(title.durationSeconds),
    title.year,
    title.quality,
    title.subtitled ? `${title.language} (sub)` : title.language,
  ]
    .filter(Boolean)
    .map(String)
}

/** Distinct seasons, for the card's "2 Temporadas" tag. */
export function seasonCount(title: Title): number {
  return new Set(title.seasons.map((s) => s.season_number)).size
}

/** The card's second line: "2001 · Animación". */
export function cardMeta(title: Title): string {
  return [title.year, title.genre].filter(Boolean).join(' · ')
}
