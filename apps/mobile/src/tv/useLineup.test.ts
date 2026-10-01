import { collectionOf, movieTitle, showTitle } from '@go10/core/tv/testing'
import type { CatalogData } from '../data/catalogStore'
import { lineupOf } from './useLineup'

const titles = [showTitle('coraje', 6, 660), movieTitle('mulan', 5300)]
const data = (channels: unknown): CatalogData => ({
  rows: titles.flatMap((t) => t.seasons),
  titles,
  heroArt: {},
  collections: [collectionOf('cn', ['coraje', 'mulan'])],
  channels,
})

describe('lineupOf', () => {
  it('resolves the channels file against the catalog', () => {
    const lineup = lineupOf(data({ epoch: '2026-10-01T00:00:00Z', defaultChannel: 'cn', channels: [{ id: 'cn', number: 1, collection: 'cn' }] }))
    expect(lineup?.channels.map((c) => c.id)).toEqual(['cn'])
  })

  it('is null without a channels file', () => {
    expect(lineupOf(data(null))).toBeNull()
  })
})
