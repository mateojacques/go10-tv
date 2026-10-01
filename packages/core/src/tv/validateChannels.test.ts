import { describe, expect, it } from 'vitest'
import { validateChannels } from './validateChannels'
import { collectionOf, movieTitle } from './testing'

const collections = [collectionOf('cn', ['m1', 'm2']), collectionOf('empty', ['m0'])]
const titles = [movieTitle('m1', 600), movieTitle('m2', 600), movieTitle('m0', 0)]
const valid = () => ({
  epoch: '2026-10-01T00:00:00Z',
  defaultChannel: 'cn',
  channels: [{ id: 'cn', number: 1, collection: 'cn' }],
})

describe('validateChannels', () => {
  it('accepts a valid file', () => {
    expect(validateChannels(valid(), { collections, titles })).toEqual([])
  })

  it('rejects a bad top level', () => {
    expect(validateChannels(null, {})).toEqual(['channels.json: must be a JSON object'])
    expect(validateChannels({ ...valid(), epoch: '2026-10-01' }, {})).toEqual([
      'channels.json: epoch must be an ISO-8601 instant with a time zone, like 2026-10-01T00:00:00Z',
    ])
    expect(validateChannels({ ...valid(), channels: [] }, {})).toContain('channels.json: channels must be a non-empty array')
    expect(validateChannels({ ...valid(), defaultChannel: 'nope' }, {})).toEqual([
      'channels.json: defaultChannel "nope" is not a listed channel',
    ])
  })

  it('rejects malformed entries', () => {
    const raw = { ...valid(), channels: [{ id: 'Bad Id', number: 0, collection: 3, name: '', blockMinutes: 2, exclude: 'x' }] }
    expect(validateChannels(raw, {})).toEqual([
      'channels.json: channels[0]: id must be a kebab-case string',
      'channels.json: channels[0]: number must be a positive integer',
      'channels.json: channels[0]: collection must be a string',
      'channels.json: channels[0]: name must be a non-empty string when present',
      'channels.json: channels[0]: blockMinutes must be an integer from 5 to 240',
      'channels.json: channels[0]: exclude must be an array of title keys',
      'channels.json: defaultChannel "cn" is not a listed channel',
    ])
  })

  it('rejects duplicate ids and numbers', () => {
    const raw = { ...valid(), channels: [{ id: 'cn', number: 1, collection: 'cn' }, { id: 'cn', number: 1, collection: 'cn' }] }
    expect(validateChannels(raw, {})).toEqual([
      'channels.json: id "cn" is used by more than one channel',
      'channels.json: number 1 is used by more than one channel',
    ])
  })

  it('checks collections, excluded keys and airability against the catalog', () => {
    const raw = {
      ...valid(),
      channels: [
        { id: 'cn', number: 1, collection: 'cn', exclude: ['m9'] },
        { id: 'gone', number: 2, collection: 'nope' },
        { id: 'dead', number: 3, collection: 'empty' },
      ],
    }
    expect(validateChannels(raw, { collections, titles })).toEqual([
      'channels.json: channels[0] (cn): exclude key "m9" is not in collection "cn"',
      'channels.json: channels[1] (gone): unknown collection "nope"',
      'channels.json: channels[2] (dead): nothing in collection "empty" can air',
    ])
  })
})
