import type { CatalogRow } from '../types'
import type { Progress } from './progressStore'
import { formatDuration } from '../lib/format'

/** Short position within a title, e.g. "T2 · E5" or "Temporada 3"; '' for a movie. */
export function rowLabel(row: CatalogRow): string {
  if (row.type === 'episode') return `T${row.season_number ?? 1} · E${row.episode_number ?? 1}`
  if (row.type === 'season') return row.season_label || `Temporada ${row.season_number}`
  return ''
}

/** e.g. "Quedan 8 min". Never "0 min" — under a minute still reads as one. */
export function remainingLabel(progress: Progress): string {
  return `Quedan ${formatDuration(Math.max(60, progress.duration - progress.time))}`
}
