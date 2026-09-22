import type { CatalogRow } from '../types'

/**
 * Unique identifier for a row, and the key its watch progress is stored
 * under. `video_id` alone identifies a row everywhere except a chaptered
 * episode, where multiple chapters share one `video_id` and only
 * `episode_number` distinguishes them.
 */
export function rowKey(row: CatalogRow): string {
  return row.chapter_start_seconds != null ? `${row.video_id}:${row.episode_number}` : row.video_id
}
