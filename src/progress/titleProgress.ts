import type { CatalogRow, Title } from '../types'
import type { Progress } from './progressStore'
import { rowKey } from '../catalog/rowKey'

export interface TitleProgress {
  /** The movie/season/episode "play" should open. */
  row: CatalogRow
  /**
   * `resume` — pick up `row` mid-way; `next` — the last thing watched was
   * finished, `row` is what follows it; `start` — nothing in progress.
   */
  mode: 'resume' | 'next' | 'start'
  /** `row`'s own stored progress, if any. */
  progress: Progress | null
  /** Most recent activity anywhere in the title; 0 if never played. */
  updatedAt: number
}

/** `title.seasons` is ordered season → episode, so "next" is the next element. */
export function titleProgress(title: Title, entries: Record<string, Progress>): TitleProgress {
  let latestIndex = -1
  for (let i = 0; i < title.seasons.length; i++) {
    const entry = entries[rowKey(title.seasons[i])]
    const latest = latestIndex === -1 ? undefined : entries[rowKey(title.seasons[latestIndex])]
    if (entry && (!latest || entry.updatedAt > latest.updatedAt)) latestIndex = i
  }

  const first = title.seasons[0]
  if (latestIndex === -1) return { row: first, mode: 'start', progress: null, updatedAt: 0 }

  const latestRow = title.seasons[latestIndex]
  const latest = entries[rowKey(latestRow)]
  const { updatedAt } = latest

  if (!latest.watched) return { row: latestRow, mode: 'resume', progress: latest, updatedAt }

  const next = title.seasons[latestIndex + 1]
  if (!next) return { row: first, mode: 'start', progress: entries[rowKey(first)] ?? null, updatedAt }

  const nextProgress = entries[rowKey(next)] ?? null
  if (nextProgress && !nextProgress.watched) {
    return { row: next, mode: 'resume', progress: nextProgress, updatedAt }
  }
  return { row: next, mode: 'next', progress: null, updatedAt }
}

export interface ContinueItem {
  title: Title
  progress: TitleProgress
}

/** Titles with something to continue, most recently watched first. */
export function continueWatching(titles: Title[], entries: Record<string, Progress>): ContinueItem[] {
  if (Object.keys(entries).length === 0) return []
  return titles
    .map((title) => ({ title, progress: titleProgress(title, entries) }))
    .filter((item) => item.progress.mode !== 'start')
    .sort((a, b) => b.progress.updatedAt - a.progress.updatedAt)
}

/** 0..1 share of `progress` played, for progress bars. */
export function playedFraction(progress: Progress | null | undefined): number {
  if (!progress || !progress.duration) return 0
  if (progress.watched) return 1
  return Math.min(1, Math.max(0, progress.time / progress.duration))
}
