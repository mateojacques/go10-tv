import { describe, it, expect } from 'vitest'
import { fromModules } from './fromModules'

const raw = (id: string, order: number) => ({
  id,
  name: id,
  order,
  logo: `assets/collections/${id}/logo.webp`,
  tile: { color: '#000' },
  titles: ['chowder'],
})

describe('fromModules', () => {
  it('names each file by its basename and sorts files by name', () => {
    const { files } = fromModules({
      '../../data/collections/marvel.json': raw('marvel', 1),
      '../../data/collections/cartoon-network.json': raw('cartoon-network', 2),
    })
    expect(files.map((f) => f.fileName)).toEqual(['cartoon-network.json', 'marvel.json'])
  })

  it('sorts collections by order', () => {
    const { collections } = fromModules({
      '../../data/collections/a.json': raw('a', 3),
      '../../data/collections/b.json': raw('b', 1),
      '../../data/collections/c.json': raw('c', 2),
    })
    expect(collections.map((c) => c.id)).toEqual(['b', 'c', 'a'])
  })

  it('keeps malformed files out of the collections but still lists them as files', () => {
    const { files, collections } = fromModules({
      '../../data/collections/good.json': raw('good', 1),
      '../../data/collections/no-titles.json': { ...raw('no-titles', 2), titles: undefined },
      '../../data/collections/no-tile.json': { ...raw('no-tile', 3), tile: undefined },
      '../../data/collections/garbage.json': null,
    })
    expect(collections.map((c) => c.id)).toEqual(['good'])
    expect(files).toHaveLength(4)
  })

  it('keeps a structurally valid collection whose keys are not checked here', () => {
    // Unknown keys and missing assets need the catalog and disk; the data test covers them.
    const { collections } = fromModules({
      '../../data/collections/stale.json': { ...raw('stale', 1), titles: ['no-such-title'] },
    })
    expect(collections.map((c) => c.id)).toEqual(['stale'])
  })

  it('handles an empty collections folder', () => {
    expect(fromModules({})).toEqual({ files: [], collections: [] })
  })
})
