import type { CatalogRow } from '../types'
import type { Collection } from '../collections/types'

export const DEFAULT_BLOCK_MINUTES = 30

/** One entry of `data/channels.json` as written. */
export interface ChannelConfig {
  /** Kebab-case, unique; the `/tv/<id>` slug. */
  id: string
  /** Positive integer, unique; the number shown and typed. */
  number: number
  /** A collection id: the channel airs that collection's titles. */
  collection: string
  /** Defaults to the collection's name. */
  name?: string
  /** Target block length per turn, in minutes. Default `DEFAULT_BLOCK_MINUTES`. */
  blockMinutes?: number
  /** Title keys of the collection to leave off the air. */
  exclude?: string[]
}

export interface ChannelsFile {
  /** ISO-8601 UTC instant every channel's timeline starts from. */
  epoch: string
  defaultChannel: string
  channels: ChannelConfig[]
}

/** One airable thing: an episode, a chapter of a season pack, a whole-season video, or a movie. */
export interface Unit {
  row: CatalogRow
  /** `rowKey(row)`. */
  key: string
  /** Where it starts inside its ok.ru file, in seconds. */
  start: number
  /** Seconds. */
  length: number
}

export interface PlanTitle {
  key: string
  /** In airing order (season, then episode). Never empty. */
  units: Unit[]
}

export interface ChannelPlan {
  channelId: string
  seed: number
  blockSeconds: number
  titles: PlanTitle[]
}

/** A channel ready to air. */
export interface Channel {
  id: string
  number: number
  name: string
  collection: Collection
  plan: ChannelPlan
}

export interface Lineup {
  epochMs: number
  defaultChannel: string
  /** Ascending by number. */
  channels: Channel[]
}

export interface Airing {
  unit: Unit
  titleKey: string
  /** Epoch milliseconds. */
  startsAt: number
  endsAt: number
}

export interface Schedule {
  current: Airing
  /** Seconds into `current.unit` (relative to `unit.start`). */
  offset: number
  next: Airing[]
}
