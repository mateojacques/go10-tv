import type { Collection, CollectionGroup } from './types'

export function collectionGroup(collection: Collection): CollectionGroup {
  return collection.group ?? 'network'
}

/** Catalog rows on Home between the franchises strip and the decades strip. */
export const DECADES_AFTER = 2

/** Networks, franchises and decades, each in the order given. */
export function splitByGroup<T>(items: T[], groupOf: (item: T) => CollectionGroup): Record<CollectionGroup, T[]> {
  return {
    network: items.filter((item) => groupOf(item) === 'network'),
    franchise: items.filter((item) => groupOf(item) === 'franchise'),
    decade: items.filter((item) => groupOf(item) === 'decade'),
  }
}
