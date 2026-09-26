import { isTmdbKey } from '@go10/core/external/tmdb/keys'
import type { Title } from '@go10/core/types'
import type { CatalogState } from '../data/catalogStore'
import type { TmdbTitleState } from '../external/useTmdbTitle'

export type TitleSource = { status: 'loading' } | { status: 'error' } | { status: 'missing' } | { status: 'ready'; titles: Title[] }

/**
 * What a title or play route can resolve against (apps/web/src/App.tsx):
 * the catalog, plus the TMDB title when the key is one and external titles
 * are on. `missing` sends the route Home.
 */
export function titleSource(catalog: CatalogState, key: string, tmdb: TmdbTitleState, external: boolean): TitleSource {
  if (catalog.status === 'loading') return { status: 'loading' }
  if (catalog.status === 'error') return { status: 'missing' }
  const titles = catalog.data.titles
  if (!external || !isTmdbKey(key)) return { status: 'ready', titles }
  if (tmdb.status === 'ready') return { status: 'ready', titles: [...titles, tmdb.title] }
  if (tmdb.status === 'error') return { status: 'error' }
  if (tmdb.status === 'not-found') return { status: 'missing' }
  return { status: 'loading' }
}
