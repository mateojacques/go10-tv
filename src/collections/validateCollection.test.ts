import { describe, it, expect } from 'vitest'
import { validateCollection, validateCollections, type ValidationContext } from './validateCollection'

const ASSETS = new Set([
  'assets/collections/cartoon-network/logo.webp',
  'assets/collections/cartoon-network/tile.webp',
  'assets/collections/marvel/logo.webp',
])

const ctx: ValidationContext = {
  titleKeys: new Set(['hora-de-aventura', 'chowder', '15692556471022']),
  assetExists: (path) => ASSETS.has(path),
}

const valid = () => ({
  id: 'cartoon-network',
  name: 'Cartoon Network',
  order: 1,
  logo: 'assets/collections/cartoon-network/logo.webp',
  tile: { color: '#000000', background: 'assets/collections/cartoon-network/tile.webp' },
  titles: ['hora-de-aventura', 'chowder', '15692556471022'],
})

const check = (raw: unknown, fileName = 'cartoon-network.json') => validateCollection({ fileName, raw }, ctx)

describe('validateCollection', () => {
  it('accepts a valid collection', () => {
    expect(check(valid())).toEqual([])
  })

  it('accepts a collection without tile background art', () => {
    const c = valid()
    delete (c.tile as { background?: string }).background
    expect(check(c)).toEqual([])
  })

  it('accepts a 3-digit hex color', () => {
    expect(check({ ...valid(), tile: { color: '#FfF' } })).toEqual([])
  })

  it.each([[[]], [null], ['cartoon-network'], [42]])('rejects a non-object top level (%j) with one error', (raw) => {
    expect(check(raw)).toEqual(['cartoon-network.json: must be a JSON object'])
  })

  it('rejects an id that is not kebab-case', () => {
    expect(check({ ...valid(), id: 'Cartoon_Network' }, 'Cartoon_Network.json')).toEqual([
      'Cartoon_Network.json: id must be a kebab-case string',
    ])
  })

  it('rejects an id that does not match the file name', () => {
    expect(check(valid(), 'cn.json')).toEqual(['cn.json: id "cartoon-network" must match the file name "cn"'])
  })

  it('rejects an empty name', () => {
    expect(check({ ...valid(), name: '  ' })).toEqual(['cartoon-network.json: name must be a non-empty string'])
  })

  it.each([[1.5], ['1'], [undefined]])('rejects a non-integer order (%j)', (order) => {
    expect(check({ ...valid(), order })).toEqual(['cartoon-network.json: order must be an integer'])
  })

  it('rejects a missing logo', () => {
    const c: Record<string, unknown> = valid()
    delete c.logo
    expect(check(c)).toEqual(['cartoon-network.json: logo must be a relative path string'])
  })

  it('rejects a logo file that does not exist', () => {
    expect(check({ ...valid(), logo: 'assets/collections/cartoon-network/nope.webp' })).toEqual([
      'cartoon-network.json: logo "assets/collections/cartoon-network/nope.webp" not found under public/',
    ])
  })

  it('rejects a leading-slash asset path even if the file exists', () => {
    expect(check({ ...valid(), logo: '/assets/collections/cartoon-network/logo.webp' })).toEqual([
      'cartoon-network.json: logo must be a relative path string',
    ])
  })

  it('rejects a missing tile', () => {
    const c: Record<string, unknown> = valid()
    delete c.tile
    expect(check(c)).toEqual(['cartoon-network.json: tile must be an object'])
  })

  it.each([['black'], ['#00000'], ['000000'], [0]])('rejects a non-hex tile color (%j)', (color) => {
    expect(check({ ...valid(), tile: { color } })).toEqual([
      'cartoon-network.json: tile.color must be a hex color like #000 or #1a2b3c',
    ])
  })

  it('rejects a tile background that does not exist', () => {
    expect(check({ ...valid(), tile: { color: '#000', background: 'assets/x.webp' } })).toEqual([
      'cartoon-network.json: tile.background "assets/x.webp" not found under public/',
    ])
  })

  it.each([[[]], [undefined], ['hora-de-aventura']])('rejects titles that are not a non-empty array (%j)', (titles) => {
    expect(check({ ...valid(), titles })).toEqual(['cartoon-network.json: titles must be a non-empty array'])
  })

  it('rejects a movie key written as a number', () => {
    expect(check({ ...valid(), titles: ['chowder', 15692556471022] })).toEqual([
      'cartoon-network.json: titles entries must be strings, got 15692556471022',
    ])
  })

  it('rejects an unknown title key', () => {
    expect(check({ ...valid(), titles: ['chowder', 'hora-de-aventur'] })).toEqual([
      'cartoon-network.json: unknown title key "hora-de-aventur"',
    ])
  })

  it('reports a duplicated key once, even when it is also unknown', () => {
    expect(check({ ...valid(), titles: ['chowder', 'chowder'] })).toEqual([
      'cartoon-network.json: duplicate title key "chowder"',
    ])
    expect(check({ ...valid(), titles: ['gone', 'gone', 'gone'] })).toEqual([
      'cartoon-network.json: unknown title key "gone"',
      'cartoon-network.json: duplicate title key "gone"',
    ])
  })

  it('reports every problem in a file, not just the first', () => {
    expect(check({ ...valid(), name: '', order: 'x' })).toEqual([
      'cartoon-network.json: name must be a non-empty string',
      'cartoon-network.json: order must be an integer',
    ])
  })
})

describe('validateCollections', () => {
  const marvel = () => ({
    ...valid(),
    id: 'marvel',
    name: 'Marvel',
    order: 2,
    logo: 'assets/collections/marvel/logo.webp',
    tile: { color: '#ec1d24' },
  })

  it('accepts files with distinct orders', () => {
    expect(
      validateCollections(
        [
          { fileName: 'cartoon-network.json', raw: valid() },
          { fileName: 'marvel.json', raw: marvel() },
        ],
        ctx,
      ),
    ).toEqual([])
  })

  it('rejects two collections sharing an order', () => {
    expect(
      validateCollections(
        [
          { fileName: 'cartoon-network.json', raw: valid() },
          { fileName: 'marvel.json', raw: { ...marvel(), order: 1 } },
        ],
        ctx,
      ),
    ).toEqual(['order 1 is used by more than one collection: cartoon-network.json, marvel.json'])
  })

  it('combines per-file errors from every file', () => {
    expect(
      validateCollections(
        [
          { fileName: 'cartoon-network.json', raw: { ...valid(), name: '' } },
          { fileName: 'marvel.json', raw: null },
        ],
        ctx,
      ),
    ).toEqual(['cartoon-network.json: name must be a non-empty string', 'marvel.json: must be a JSON object'])
  })
})
