import { describe, it, expect } from 'vitest'
import type { Title } from '../types'
import type { Collection } from './types'
import { resolveCollection, visibleCollections } from './resolveCollection'

const title = (key: string) => ({ key, title: key }) as Title

const CATALOG = [title('hora-de-aventura'), title('chowder'), title('111'), title('ben-10')]

const collection = (id: string, order: number, titles: string[]): Collection => ({
  id,
  name: id,
  order,
  logo: `assets/collections/${id}/logo.webp`,
  tile: { color: '#000000' },
  titles,
})

const keys = (titles: Title[]) => titles.map((t) => t.key)

describe('resolveCollection', () => {
  it('returns titles in the order the collection lists them', () => {
    const c = collection('cn', 1, ['chowder', '111', 'hora-de-aventura'])
    expect(keys(resolveCollection(c, CATALOG))).toEqual(['chowder', '111', 'hora-de-aventura'])
  })

  it('skips keys that are not in the catalog', () => {
    const c = collection('cn', 1, ['chowder', 'gone', 'ben-10'])
    expect(keys(resolveCollection(c, CATALOG))).toEqual(['chowder', 'ben-10'])
  })
})

describe('visibleCollections', () => {
  it('keeps the input order and pairs each collection with its titles', () => {
    const a = collection('a', 1, ['chowder'])
    const b = collection('b', 2, ['111', 'ben-10'])
    const result = visibleCollections([a, b], CATALOG)
    expect(result.map((r) => r.collection.id)).toEqual(['a', 'b'])
    expect(keys(result[1].titles)).toEqual(['111', 'ben-10'])
  })

  it('hides a collection whose keys have all gone stale', () => {
    const stale = collection('stale', 1, ['gone', 'also-gone'])
    const live = collection('live', 2, ['chowder'])
    expect(visibleCollections([stale, live], CATALOG).map((r) => r.collection.id)).toEqual(['live'])
  })

  it('returns nothing when there are no collections', () => {
    expect(visibleCollections([], CATALOG)).toEqual([])
  })
})
