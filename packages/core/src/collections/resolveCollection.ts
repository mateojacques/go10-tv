import type { Title } from '../types'
import type { Collection } from './types'

export interface ResolvedCollection {
  collection: Collection
  titles: Title[]
}

/**
 * The collection's titles in the order it lists them. Unknown keys are
 * skipped rather than thrown: the data test is what catches them, so a typo
 * fails CI instead of the TV screen.
 */
export function resolveCollection(collection: Collection, titles: Title[]): Title[] {
  const byKey = new Map(titles.map((t) => [t.key, t]))
  return collection.titles.flatMap((key) => {
    const found = byKey.get(key)
    return found ? [found] : []
  })
}

/** Collections that resolve to at least one title, in the order given. */
export function visibleCollections(collections: Collection[], titles: Title[]): ResolvedCollection[] {
  return collections
    .map((collection) => ({ collection, titles: resolveCollection(collection, titles) }))
    .filter((resolved) => resolved.titles.length > 0)
}
