import { formatDuration, formatViews } from '../lib/format'
import { groupSeasons } from '../player/groupSeasons'
import type { CatalogRow, Title } from '../types'

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

/** Detail's eyebrow: "Serie · 3 temporadas · Toei", or "Película". */
export function detailEyebrow(title: Title): string {
  const count = groupSeasons(title.seasons).length
  const kind = title.kind === 'show' ? `Serie · ${count} ${count === 1 ? 'temporada' : 'temporadas'}` : 'Película'
  return title.studio ? `${kind} · ${title.studio}` : kind
}

/** Detail's metadata line, for the row Play would start. */
export function detailMeta(title: Title, row: CatalogRow): string[] {
  return [
    row.year ?? title.year,
    title.quality,
    title.subtitled ? `${title.language} (sub)` : title.language,
    formatDuration(row.duration_seconds),
    // TMDB has no view counts; "0 vistas" would read as unpopular.
    title.external ? null : formatViews(title.views),
  ]
    .filter(Boolean)
    .map(String)
}
