import { describe, it, expect } from 'vitest'
import { fromModules } from './collections'

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

  it('handles an empty collections folder', () => {
    expect(fromModules({})).toEqual({ files: [], collections: [] })
  })
})
