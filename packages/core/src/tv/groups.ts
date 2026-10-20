import type { Channel, ChannelGroupId } from './types'

export interface ChannelGroup {
  group: ChannelGroupId
  label: 'Canales' | '24/7' | 'Décadas' | 'En vivo'
  channels: Channel[]
}

/** The lineup as the TV strip and "En vivo ahora" show it: networks, franchises, decades, then YouTube lives; empty groups left out. */
export function channelGroups(channels: Channel[]): ChannelGroup[] {
  const groups: ChannelGroup[] = [
    { group: 'network', label: 'Canales', channels: channels.filter((c) => c.group === 'network') },
    { group: 'franchise', label: '24/7', channels: channels.filter((c) => c.group === 'franchise') },
    { group: 'decade', label: 'Décadas', channels: channels.filter((c) => c.group === 'decade') },
    { group: 'live', label: 'En vivo', channels: channels.filter((c) => c.group === 'live') },
  ]
  return groups.filter((g) => g.channels.length > 0)
}
