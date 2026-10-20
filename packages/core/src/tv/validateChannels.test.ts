import { describe, expect, it } from 'vitest'
import { validateChannels } from './validateChannels'
import { collectionOf, movieTitle, showTitle } from './testing'

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

describe('number ranges', () => {
  const titles = [showTitle('s', 3, 600)]
  const collections = [
    collectionOf('net', ['s']),
    { ...collectionOf('fr', ['s']), group: 'franchise' as const },
    { ...collectionOf('dec', ['s']), group: 'decade' as const },
  ]
  const file = (channels: unknown[]) => ({ epoch: '2026-10-01T00:00:00Z', defaultChannel: 'n', channels })

  it('accepts a network at 1–99, a franchise at 101–199 and a decade at 201–299', () => {
    const channels = [
      { id: 'n', number: 99, collection: 'net' },
      { id: 'f', number: 199, collection: 'fr' },
      { id: 'd', number: 299, collection: 'dec' },
    ]
    expect(validateChannels(file(channels), { collections, titles })).toEqual([])
  })

  it('rejects a franchise above 199 and a decade below 201', () => {
    expect(validateChannels(file([{ id: 'f', number: 200, collection: 'fr' }, { id: 'd', number: 150, collection: 'dec' }]), { collections, titles }).slice(0, 2)).toEqual([
      'channels.json: channels[0] (f): a franchise channel\'s number must be from 101 to 199',
      'channels.json: channels[1] (d): a decade channel\'s number must be from 201 to 299',
    ])
  })

  it('rejects a decade at 300 or more, where live channels start', () => {
    expect(validateChannels(file([{ id: 'n', number: 1, collection: 'net' }, { id: 'd', number: 301, collection: 'dec' }]), { collections, titles })).toEqual([
      'channels.json: channels[1] (d): a decade channel\'s number must be from 201 to 299',
    ])
  })

  it('rejects a network above 99 and a franchise below 101', () => {
    expect(validateChannels(file([{ id: 'n', number: 100, collection: 'net' }, { id: 'f', number: 100, collection: 'fr' }]), { collections, titles })).toEqual([
      'channels.json: channels[0] (n): a network channel\'s number must be 99 or less',
      'channels.json: channels[1] (f): a franchise channel\'s number must be from 101 to 199',
      'channels.json: number 100 is used by more than one channel',
    ])
  })
})

describe('validateChannels: YouTube live channels', () => {
  const collections = [collectionOf('cn', ['m1'])]
  const titles = [movieTitle('m1', 600)]
  const live = (overrides: Record<string, unknown> = {}) => ({
    id: 'al-jazeera', number: 301, name: 'Al Jazeera', youtube: 'https://www.youtube.com/watch?v=gCNeDWCI0vo', ...overrides,
  })
  const file = (entry: unknown) => ({ epoch: '2026-10-01T00:00:00Z', defaultChannel: 'cn', channels: [{ id: 'cn', number: 1, collection: 'cn' }, entry] })
  const check = (entry: unknown) => validateChannels(file(entry), { collections, titles })

  it('accepts a live by video URL or by channel URL, with an optional logo', () => {
    expect(check(live())).toEqual([])
    expect(check(live({ youtube: 'https://www.youtube.com/channel/UCNye-wNBqNL5ZzHSJj3l8Bg', logo: 'assets/live/aj.png' }))).toEqual([])
  })

  it('needs a name', () => {
    expect(check(live({ name: undefined }))).toEqual(['channels.json: channels[1]: name is required for a youtube channel'])
  })

  it('rejects links it cannot play, like @handles', () => {
    expect(check(live({ youtube: 'https://www.youtube.com/@AlJazeeraEnglish' }))).toEqual([
      'channels.json: channels[1]: youtube must be a video URL/id or a channel URL with a UC… id',
    ])
  })

  it('takes either a collection or a youtube link, not both', () => {
    expect(check(live({ collection: 'cn' }))).toEqual(['channels.json: channels[1]: use either collection or youtube, not both'])
  })

  it('rejects schedule-only fields and a bad logo', () => {
    expect(check(live({ blockMinutes: 30, exclude: [], logo: '' }))).toEqual([
      'channels.json: channels[1]: blockMinutes and exclude are for collection channels',
      'channels.json: channels[1]: logo must be a non-empty string when present',
    ])
  })

  it('keeps lives at 301–399', () => {
    expect(check(live({ number: 205 }))).toEqual(['channels.json: channels[1] (al-jazeera): a live channel\'s number must be from 301 to 399'])
    expect(check(live({ number: 400 }))).toEqual(['channels.json: channels[1] (al-jazeera): a live channel\'s number must be from 301 to 399'])
  })
})
