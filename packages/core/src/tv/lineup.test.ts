import { afterEach, describe, expect, it, vi } from 'vitest'
import { channelByNumber, pickChannel, readLastChannel, resolveLineup, stepChannel, writeLastChannel } from './lineup'
import { keyValueStore } from '../ports/keyValueStore'
import { collectionOf, movieTitle, showTitle } from './testing'

const collections = [collectionOf('cn', ['m1']), collectionOf('jx', ['m2']), collectionOf('empty', ['m0'])]
const titles = [movieTitle('m1', 600), movieTitle('m2', 600), movieTitle('m0', 0)]
const raw = {
  epoch: '2026-10-01T00:00:00Z',
  defaultChannel: 'jx',
  channels: [
    { id: 'jx', number: 2, collection: 'jx', name: 'Jetix TV' },
    { id: 'cn', number: 1, collection: 'cn' },
    { id: 'dead', number: 3, collection: 'empty' },
    { id: 'cn', number: 4, collection: 'cn' },
    { id: 'broken', number: 'x', collection: 'cn' },
  ],
}

afterEach(() => {
  for (const key of keyValueStore().keys()) keyValueStore().removeItem(key)
  vi.restoreAllMocks()
})

describe('resolveLineup', () => {
  it('keeps valid, airable, first-seen channels sorted by number, and warns about the rest', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const lineup = resolveLineup(raw, collections, titles)!
    expect(lineup.epochMs).toBe(Date.UTC(2026, 9, 1))
    expect(lineup.channels.map((c) => [c.number, c.id, c.name])).toEqual([[1, 'cn', 'CN'], [2, 'jx', 'Jetix TV']])
    expect(lineup.defaultChannel).toBe('jx')
    expect(warn).toHaveBeenCalledTimes(3) // dead, duplicate cn, broken
  })

  it('falls back to the first channel when the default did not survive', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolveLineup({ ...raw, defaultChannel: 'dead' }, collections, titles)!.defaultChannel).toBe('cn')
  })

  it('is null when the file is unusable or nothing airs', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolveLineup({ ...raw, epoch: 'soon' }, collections, titles)).toBeNull()
    expect(resolveLineup({ ...raw, channels: [{ id: 'dead', number: 3, collection: 'empty' }], defaultChannel: 'dead' }, collections, titles)).toBeNull()
  })
})

describe('channel picking', () => {
  const lineup = () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    return resolveLineup(raw, collections, titles)!
  }

  it('honours a requested channel, and refuses an unknown one', () => {
    expect(pickChannel(lineup(), 'cn')!.id).toBe('cn')
    expect(pickChannel(lineup(), 'nope')).toBeNull()
  })

  it('opens the last channel watched, else the default', () => {
    expect(pickChannel(lineup(), null)!.id).toBe('jx')
    writeLastChannel('cn')
    expect(readLastChannel()).toBe('cn')
    expect(pickChannel(lineup(), null)!.id).toBe('cn')
  })

  it('ignores a remembered channel that no longer exists', () => {
    writeLastChannel('removed-channel')
    expect(pickChannel(lineup(), null)!.id).toBe('jx')
  })

  it('steps through channels by number, wrapping', () => {
    expect(stepChannel(lineup(), 'cn', 1).id).toBe('jx')
    expect(stepChannel(lineup(), 'jx', 1).id).toBe('cn')
    expect(stepChannel(lineup(), 'cn', -1).id).toBe('jx')
  })

  it('finds a channel by number', () => {
    expect(channelByNumber(lineup(), 2)!.id).toBe('jx')
    expect(channelByNumber(lineup(), 9)).toBeNull()
  })
})

describe('franchise channels in the lineup', () => {
  const titles = [showTitle('s', 3, 600)]
  const fr = { ...collectionOf('fr', ['s']), group: 'franchise' as const }
  const lineup = resolveLineup(
    {
      epoch: '2026-10-01T00:00:00Z',
      defaultChannel: 'n1',
      channels: [
        { id: 'f2', number: 102, collection: 'fr' },
        { id: 'n1', number: 1, collection: 'net' },
        { id: 'n15', number: 15, collection: 'net' },
        { id: 'f1', number: 101, collection: 'fr' },
      ],
    },
    [collectionOf('net', ['s']), fr],
    titles,
  )!

  it('takes the group from the collection', () => {
    expect(lineup.channels.map((c) => [c.id, c.group])).toEqual([['n1', 'network'], ['n15', 'network'], ['f1', 'franchise'], ['f2', 'franchise']])
  })

  it('zaps across the seam and wraps', () => {
    expect(stepChannel(lineup, 'n15', 1).id).toBe('f1')
    expect(stepChannel(lineup, 'f1', -1).id).toBe('n15')
    expect(stepChannel(lineup, 'f2', 1).id).toBe('n1')
  })

  it('falls back to the default when the last channel no longer exists (marvel → spider-man)', () => {
    writeLastChannel('marvel')
    expect(pickChannel(lineup, null)?.id).toBe('n1')
  })
})

describe('resolveLineup with a YouTube live', () => {
  it('resolves it as a live channel, sorted among the others', () => {
    const lineup = resolveLineup({
      epoch: '2026-10-01T00:00:00Z',
      defaultChannel: 'cn',
      channels: [
        { id: 'aj', number: 301, name: 'Al Jazeera', youtube: 'https://youtu.be/gCNeDWCI0vo' },
        { id: 'dw', number: 302, name: 'DW', youtube: 'https://www.youtube.com/channel/UCNye-wNBqNL5ZzHSJj3l8Bg', logo: 'assets/live/dw.png' },
        { id: 'cn', number: 1, collection: 'cn' },
      ],
    }, collections, titles)!
    expect(lineup.channels.map((c) => [c.number, c.kind])).toEqual([[1, 'schedule'], [301, 'live'], [302, 'live']])
    expect(lineup.channels[1]).toEqual({
      kind: 'live', id: 'aj', number: 301, name: 'Al Jazeera', group: 'live',
      source: { videoId: 'gCNeDWCI0vo' }, logo: null, thumbnail: 'https://i.ytimg.com/vi/gCNeDWCI0vo/hqdefault_live.jpg',
    })
    expect(lineup.channels[2]).toMatchObject({ source: { channelId: 'UCNye-wNBqNL5ZzHSJj3l8Bg' }, logo: 'assets/live/dw.png', thumbnail: null })
  })
})
