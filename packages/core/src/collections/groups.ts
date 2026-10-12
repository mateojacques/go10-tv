import type { Collection, CollectionGroup } from './types'

export function collectionGroup(collection: Collection): CollectionGroup {
  return collection.group ?? 'network'
}

/** Networks and franchises, each in the order given. */
export function splitByGroup<T>(items: T[], groupOf: (item: T) => CollectionGroup): { network: T[]; franchise: T[] } {
  return {
    network: items.filter((item) => groupOf(item) === 'network'),
    franchise: items.filter((item) => groupOf(item) === 'franchise'),
  }
}
