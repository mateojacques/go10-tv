import type { CatalogRow } from '../types'
import type { Collection, CollectionGroup } from '../collections/types'
import type { YoutubeSource } from '../player/youtubeUrl'

export const DEFAULT_BLOCK_MINUTES = 30

/** `blocks`: rotating turns of consecutive episodes (networks). `runs`: 2–3 episodes from a random point (franchises, decades). */
export type ScheduleMode = 'blocks' | 'runs'

/** One entry of `data/channels.json` as written: a collection's schedule, or a YouTube live. */
export type ChannelConfig = ScheduleChannelConfig | LiveChannelConfig

export interface ScheduleChannelConfig {
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

/** A YouTube live, added by hand: always joined at the live edge. */
export interface LiveChannelConfig {
  id: string
  /** 301–399. */
  number: number
  name: string
  /** A video/live URL or id, or a channel URL with its UC… id (follows the channel's live across restarts). */
  youtube: string
  /** An asset path or URL; else the stream's YouTube thumbnail. */
  logo?: string
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
  mode: ScheduleMode
  titles: PlanTitle[]
}

/** The channel groups: the collection groups, plus YouTube lives. */
export type ChannelGroupId = CollectionGroup | 'live'

/** A channel ready to air: a collection on its schedule, or a YouTube live. */
export type Channel = ScheduleChannel | LiveChannel

export interface ScheduleChannel {
  kind: 'schedule'
  id: string
  number: number
  name: string
  group: CollectionGroup
  collection: Collection
  plan: ChannelPlan
}

export interface LiveChannel {
  kind: 'live'
  id: string
  number: number
  name: string
  group: 'live'
  source: YoutubeSource
  logo: string | null
  /** The live's own thumbnail; null for a channel source (its video id isn't known ahead). */
  thumbnail: string | null
}

export function isLive(channel: Channel): channel is LiveChannel {
  return channel.kind === 'live'
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
