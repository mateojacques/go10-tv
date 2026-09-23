import type { Route, Section } from './route'
import type { CatalogRow, Title } from '../types'
import { rowKey } from '../catalog/rowKey'

export type ResolvedView =
  | { name: 'home' }
  | { name: 'detail'; title: Title }
  | { name: 'player'; title: Title; row: CatalogRow }
  | { name: 'catalog'; section: Section; query: string }
  | { name: 'not-found' }

export function resolveRoute(route: Route, titles: Title[]): ResolvedView {
  if (route.name === 'home') return { name: 'home' }

  if (route.name === 'catalog') {
    // There's no "browse everything" page; the whole catalog unfiltered is Home.
    if (route.section === 'all' && route.query.trim() === '') return { name: 'home' }
    return { name: 'catalog', section: route.section, query: route.query }
  }

  const title = titles.find((t) => t.key === route.key)
  if (!title) return { name: 'not-found' }

  if (route.name === 'title') return { name: 'detail', title }

  const row = title.seasons.find((r) => rowKey(r) === route.videoId)
  if (!row) return { name: 'not-found' }

  return { name: 'player', title, row }
}
