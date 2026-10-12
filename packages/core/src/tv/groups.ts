import type { CollectionGroup } from '../collections/types'
import type { Channel } from './types'

export interface ChannelGroup {
  group: CollectionGroup
  label: 'Canales' | '24/7'
  channels: Channel[]
}

/** The lineup as the TV strip and "En vivo ahora" show it: networks, then franchises; empty groups left out. */
export function channelGroups(channels: Channel[]): ChannelGroup[] {
  const groups: ChannelGroup[] = [
    { group: 'network', label: 'Canales', channels: channels.filter((c) => c.group === 'network') },
    { group: 'franchise', label: '24/7', channels: channels.filter((c) => c.group === 'franchise') },
  ]
  return groups.filter((g) => g.channels.length > 0)
}
