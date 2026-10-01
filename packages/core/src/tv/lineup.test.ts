import { afterEach, describe, expect, it, vi } from 'vitest'
import { channelByNumber, pickChannel, readLastChannel, resolveLineup, stepChannel, writeLastChannel } from './lineup'
import { keyValueStore } from '../ports/keyValueStore'
import { collectionOf, movieTitle } from './testing'

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
