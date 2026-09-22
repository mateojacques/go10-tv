import type { Route } from './route'
import type { CatalogRow, Title } from '../types'

export type ResolvedView =
  | { name: 'home' }
  | { name: 'detail'; title: Title }
  | { name: 'player'; title: Title; row: CatalogRow }
  | { name: 'not-found' }

export function resolveRoute(route: Route, titles: Title[]): ResolvedView {
  if (route.name === 'home') return { name: 'home' }

  const title = titles.find((t) => t.key === route.key)
  if (!title) return { name: 'not-found' }

  if (route.name === 'title') return { name: 'detail', title }

  const row = title.seasons.find((r) => r.video_id === route.videoId)
  if (!row) return { name: 'not-found' }

  return { name: 'player', title, row }
}
