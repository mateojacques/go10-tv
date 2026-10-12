import { describe, expect, it } from 'vitest'
import { resolveLineup } from './lineup'
import { channelGroups } from './groups'
import { collectionOf, showTitle } from './testing'

const titles = [showTitle('s', 3, 600)]
const collections = [collectionOf('net', ['s']), { ...collectionOf('fr', ['s']), group: 'franchise' as const }]
const lineupOf = (channels: unknown[]) =>
  resolveLineup({ epoch: '2026-10-01T00:00:00Z', defaultChannel: 'n', channels }, collections, titles)!

describe('channelGroups', () => {
  it('labels networks "Canales" and franchises "24/7", networks first', () => {
    const lineup = lineupOf([{ id: 'f', number: 101, collection: 'fr' }, { id: 'n', number: 1, collection: 'net' }])
    expect(channelGroups(lineup.channels).map((g) => [g.label, g.channels.map((c) => c.id)])).toEqual([
      ['Canales', ['n']],
      ['24/7', ['f']],
    ])
  })

  it('leaves out a group with no channels', () => {
    const lineup = lineupOf([{ id: 'n', number: 1, collection: 'net' }])
    expect(channelGroups(lineup.channels).map((g) => g.label)).toEqual(['Canales'])
  })
})
