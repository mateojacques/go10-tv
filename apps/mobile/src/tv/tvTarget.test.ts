import { memoryStore, setKeyValueStore } from '@go10/core/ports/keyValueStore'
import { resolveLineup, writeLastChannel } from '@go10/core/tv/lineup'
import { collectionOf, showTitle } from '@go10/core/tv/testing'
import { tvTarget } from './tvTarget'

const lineup = resolveLineup(
  {
    epoch: '2026-10-01T00:00:00Z',
    defaultChannel: 'b',
    channels: [
      { id: 'a', number: 1, collection: 'a' },
      { id: 'b', number: 2, collection: 'b' },
    ],
  },
  [collectionOf('a', ['s1']), collectionOf('b', ['s2'])],
  [showTitle('s1', 3, 600), showTitle('s2', 3, 600)],
)!

beforeEach(() => setKeyValueStore(memoryStore()))

describe('tvTarget', () => {
  it('no lineup (the site has no channels file): home', () => {
    expect(tvTarget(null, 'a')).toEqual({ kind: 'home' })
    expect(tvTarget(null, null)).toEqual({ kind: 'home' })
  })

  it('/tv: the last channel, else the default', () => {
    expect(tvTarget(lineup, null)).toEqual({ kind: 'redirect', channelId: 'b' })
    writeLastChannel('a')
    expect(tvTarget(lineup, null)).toEqual({ kind: 'redirect', channelId: 'a' })
  })

  it('/tv/<known>: that channel', () => {
    expect(tvTarget(lineup, 'a')).toMatchObject({ kind: 'show', channel: { id: 'a' } })
  })

  it('/tv/<unknown>: picks a channel as /tv does', () => {
    expect(tvTarget(lineup, 'zzz')).toEqual({ kind: 'redirect', channelId: 'b' })
  })
})
