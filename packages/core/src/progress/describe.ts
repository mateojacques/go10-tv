import type { CatalogRow, Title } from '../types'
import { resumeFromTime, type Progress } from './progressStore'
import { formatDuration } from '../lib/format'
import { playedFraction, type ContinueItem } from './titleProgress'

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

/** Duration, then "Visto" once finished or how much is left mid-way. */
export function rowStatus(row: CatalogRow, progress: Progress | null | undefined): string {
  const state = progress?.watched
    ? 'Visto'
    : progress && resumeFromTime(progress) !== null
      ? remainingLabel(progress)
      : null
  return [formatDuration(row.duration_seconds), state].filter(Boolean).join(' · ')
}

/** Context under Play: which episode it starts and how much of it is left. */
export function playMeta(title: Title, row: CatalogRow, progress: Progress | null): string {
  const resuming = progress !== null && resumeFromTime(progress) !== null
  return [title.kind === 'show' ? rowLabel(row) : null, resuming ? remainingLabel(progress) : null]
    .filter(Boolean)
    .join(' · ')
}

/** Shown on "Seguir viendo" cards in place of the usual year/genre line. */
export interface CardProgress {
  fraction: number
  label: string
}

/** A Seguir viendo card: the share played and what is left, or the episode that comes next. */
export function continueCardProgress({ progress }: ContinueItem): CardProgress {
  const position = rowLabel(progress.row)
  if (progress.mode === 'next' || !progress.progress) {
    return { fraction: 0, label: `Siguiente${position ? `: ${position}` : ''}` }
  }
  return {
    fraction: playedFraction(progress.progress),
    label: [position, remainingLabel(progress.progress)].filter(Boolean).join(' · '),
  }
}
