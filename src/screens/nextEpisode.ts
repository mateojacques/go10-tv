import type { CatalogRow } from '../types'

/**
 * Episode nav (next/previous) only ever applies to per-episode series
 * (type === 'episode'); movies and single-video seasons have no
 * neighbor by definition.
 */
function sortedEpisodeIndex(rows: CatalogRow[], current: CatalogRow): { episodes: CatalogRow[]; index: number } | null {
  if (current.type !== 'episode') return null

  const episodes = rows
    .filter((r) => r.type === 'episode')
    .sort((a, b) => (a.season_number ?? 0) - (b.season_number ?? 0) || (a.episode_number ?? 0) - (b.episode_number ?? 0))

  const index = episodes.findIndex((r) => r.video_id === current.video_id)
  if (index === -1) return null

  return { episodes, index }
}

export function findNextEpisode(rows: CatalogRow[], current: CatalogRow): CatalogRow | null {
  const found = sortedEpisodeIndex(rows, current)
  if (!found || found.index === found.episodes.length - 1) return null
  return found.episodes[found.index + 1]
}

export function findPreviousEpisode(rows: CatalogRow[], current: CatalogRow): CatalogRow | null {
  const found = sortedEpisodeIndex(rows, current)
  if (!found || found.index === 0) return null
  return found.episodes[found.index - 1]
}
