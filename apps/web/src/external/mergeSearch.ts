import type { Title } from '../types'
import type { CatalogMode } from '../catalog/selectTitles'
import type { TmdbSearchState } from './useTmdbSearch'

/** `searching`: nothing in the catalog matched and TMDB hasn't answered yet. */
export type SearchMode = CatalogMode | 'searching'

/**
 * The grid for a search: catalog matches first, TMDB hits appended after
 * them — appending never moves a card already on screen, or the focus on it.
 * Catalog "suggestions" (fuzzy near-misses) only show once TMDB has nothing.
 */
export function mergeSearch(
  selection: { titles: Title[]; mode: CatalogMode },
  tmdb: TmdbSearchState,
): { titles: Title[]; mode: SearchMode; external: boolean } {
  const none = { ...selection, external: false }
  if (selection.mode === 'browse' || tmdb.status === 'off') return none

  if (selection.mode === 'results') {
    if (tmdb.status !== 'done' || tmdb.titles.length === 0) return none
    return { titles: [...selection.titles, ...tmdb.titles], mode: 'results', external: true }
  }

  if (tmdb.status === 'pending') return { titles: [], mode: 'searching', external: false }
  if (tmdb.status === 'done' && tmdb.titles.length > 0) return { titles: tmdb.titles, mode: 'results', external: true }
  return none
}
