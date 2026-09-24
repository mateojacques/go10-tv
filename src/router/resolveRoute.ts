import type { Route, Section } from './route'
import type { CatalogRow, Title } from '../types'
import type { Collection } from '../collections/types'
import { rowKey } from '../catalog/rowKey'
import { resolveCollection } from '../collections/resolveCollection'

export type ResolvedView =
  | { name: 'home' }
  | { name: 'detail'; title: Title }
  | { name: 'player'; title: Title; row: CatalogRow }
  | { name: 'catalog'; section: Section; query: string }
  | { name: 'collection'; collection: Collection; titles: Title[] }
  | { name: 'not-found' }

export function resolveRoute(route: Route, titles: Title[], collections: Collection[] = []): ResolvedView {
  if (route.name === 'home') return { name: 'home' }

  if (route.name === 'catalog') {
    // There's no "browse everything" page; the whole catalog unfiltered is Home.
    if (route.section === 'all' && route.query.trim() === '') return { name: 'home' }
    return { name: 'catalog', section: route.section, query: route.query }
  }

  if (route.name === 'collection') {
    const collection = collections.find((c) => c.id === route.id)
    const members = collection ? resolveCollection(collection, titles) : []
    // A collection with nothing left to show is as gone as an unknown one.
    if (!collection || members.length === 0) return { name: 'not-found' }
    return { name: 'collection', collection, titles: members }
  }

  const title = titles.find((t) => t.key === route.key)
  if (!title) return { name: 'not-found' }

  if (route.name === 'title') return { name: 'detail', title }

  const row = title.seasons.find((r) => rowKey(r) === route.videoId)
  if (!row) return { name: 'not-found' }

  return { name: 'player', title, row }
}
