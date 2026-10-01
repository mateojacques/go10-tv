import type { Title } from '../types'
import type { Collection } from '../collections/types'
import { keyValueStore } from '../ports/keyValueStore'
import { buildChannelPlan } from './plan'
import { validateChannelEntry, validateChannelsTop } from './validateChannels'
import type { Channel, ChannelConfig, ChannelsFile, Lineup } from './types'

const LAST_CHANNEL_KEY = 'go10:tvLastChannel'

/**
 * The channels that can air, sorted by number. A bad entry is skipped with a
 * warning so one hand edit can't take the TV screen down; the data test is
 * what fails CI. Null when the file itself is unusable or nothing can air.
 */
export function resolveLineup(raw: unknown, collections: Collection[], titles: Title[]): Lineup | null {
  const top = validateChannelsTop(raw)
  if (top.length > 0) {
    console.warn(`Live TV off: ${top.join('; ')}`)
    return null
  }
  const file = raw as ChannelsFile
  const ids = new Set<string>()
  const numbers = new Set<number>()
  const channels: Channel[] = []
  file.channels.forEach((entry: unknown, index) => {
    const errors = validateChannelEntry(entry, index, { collections, titles })
    const config = entry as ChannelConfig
    if (errors.length === 0 && (ids.has(config.id) || numbers.has(config.number))) {
      errors.push(`channels.json: channels[${index}] (${config.id}): duplicate id or number`)
    }
    if (errors.length > 0) {
      console.warn(`Skipping channel: ${errors.join('; ')}`)
      return
    }
    const collection = collections.find((c) => c.id === config.collection) as Collection
    ids.add(config.id)
    numbers.add(config.number)
    channels.push({
      id: config.id,
      number: config.number,
      name: config.name ?? collection.name,
      collection,
      plan: buildChannelPlan(config, collection, titles),
    })
  })
  if (channels.length === 0) return null
  channels.sort((a, b) => a.number - b.number)
  return {
    epochMs: Date.parse(file.epoch),
    defaultChannel: ids.has(file.defaultChannel) ? file.defaultChannel : channels[0].id,
    channels,
  }
}

export function readLastChannel(): string | null {
  try {
    return keyValueStore().getItem(LAST_CHANNEL_KEY)
  } catch {
    return null
  }
}

export function writeLastChannel(id: string): void {
  try {
    keyValueStore().setItem(LAST_CHANNEL_KEY, id)
  } catch {
    // ignore — private mode, quota exceeded, or storage disabled
  }
}

/**
 * The channel a TV route shows: the requested one (null if unknown, so the
 * caller can redirect), else the last one watched, else the default.
 */
export function pickChannel(lineup: Lineup, requested: string | null): Channel | null {
  const byId = (id: string | null) => (id ? (lineup.channels.find((c) => c.id === id) ?? null) : null)
  if (requested) return byId(requested)
  return byId(readLastChannel()) ?? byId(lineup.defaultChannel) ?? lineup.channels[0] ?? null
}

/** The neighbouring channel by number, wrapping around. */
export function stepChannel(lineup: Lineup, id: string, step: 1 | -1): Channel {
  const index = lineup.channels.findIndex((c) => c.id === id)
  const count = lineup.channels.length
  return lineup.channels[(index + step + count) % count]
}

export function channelByNumber(lineup: Lineup, number: number): Channel | null {
  return lineup.channels.find((c) => c.number === number) ?? null
}
