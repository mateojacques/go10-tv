import type { CatalogRow } from '../types'

/**
 * Autoplay only ever applies to per-episode series (type === 'episode');
 * movies and single-video seasons have no "next" by definition.
 */
export function findNextEpisode(rows: CatalogRow[], current: CatalogRow): CatalogRow | null {
  if (current.type !== 'episode') return null

  const episodes = rows
    .filter((r) => r.type === 'episode')
    .sort((a, b) => (a.season_number ?? 0) - (b.season_number ?? 0) || (a.episode_number ?? 0) - (b.episode_number ?? 0))

  const index = episodes.findIndex((r) => r.video_id === current.video_id)
  if (index === -1 || index === episodes.length - 1) return null

  return episodes[index + 1]
}
