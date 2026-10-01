import { pickChannel } from '@go10/core/tv/lineup'
import type { Channel, Lineup } from '@go10/core/tv/types'

export type TvTarget = { kind: 'home' } | { kind: 'redirect'; channelId: string } | { kind: 'show'; channel: Channel }

/** Where a TV route lands: the requested channel, else (for /tv or an unknown id) the last one watched or the default. */
export function tvTarget(lineup: Lineup | null, requested: string | null): TvTarget {
  if (!lineup) return { kind: 'home' }
  const channel = requested ? pickChannel(lineup, requested) : null
  if (channel) return { kind: 'show', channel }
  const fallback = pickChannel(lineup, null)
  return fallback ? { kind: 'redirect', channelId: fallback.id } : { kind: 'home' }
}
