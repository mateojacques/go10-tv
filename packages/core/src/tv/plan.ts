import type { Title } from '../types'
import type { Collection } from '../collections/types'
import { resolveCollection } from '../collections/resolveCollection'
import { rowKey } from '../catalog/rowKey'
import { hash01 } from '../lib/hash'
import { DEFAULT_BLOCK_MINUTES, type ChannelConfig, type ChannelPlan, type Unit } from './types'

/** A title's airable rows, in its own (season, episode) order. */
export function unitsOf(title: Title): Unit[] {
  if (title.external) return []
  return title.seasons
    .filter((row) => !row.external && row.duration_seconds > 0)
    .map((row) => ({ row, key: rowKey(row), start: row.chapter_start_seconds ?? 0, length: row.duration_seconds }))
}

/** A stable 32-bit seed per channel id. */
export function channelSeed(channelId: string): number {
  return Math.floor(hash01(0, channelId) * 4294967296)
}

export function buildChannelPlan(config: ChannelConfig, collection: Collection, titles: Title[]): ChannelPlan {
  const excluded = new Set(config.exclude ?? [])
  return {
    channelId: config.id,
    seed: channelSeed(config.id),
    blockSeconds: (config.blockMinutes ?? DEFAULT_BLOCK_MINUTES) * 60,
    titles: resolveCollection(collection, titles)
      .filter((title) => !excluded.has(title.key))
      .map((title) => ({ key: title.key, units: unitsOf(title) }))
      .filter((title) => title.units.length > 0),
  }
}
