import type { Title } from '../types'
import type { CatalogMode } from '../catalog/selectTitles'
import { scoreTitle } from '../search/search'

export interface TmdbSearchState {
  status: 'off' | 'pending' | 'done' | 'failed'
  titles: Title[]
}

/** `searching`: nothing in the catalog matched and TMDB hasn't answered yet. */
export type SearchMode = CatalogMode | 'searching'

/**
 * Catalog matches and TMDB hits in one ranking by how well each title matches
 * the query, so an exact TMDB hit isn't buried under loose catalog matches.
 * Ties keep the catalog first, then each side's own order.
 */
function rank(query: string, catalog: Title[], tmdb: Title[]): Title[] {
  return [...catalog, ...tmdb]
    .map((title, index) => ({ title, index, score: scoreTitle(query, title.title) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((r) => r.title)
}

/**
 * The grid for a search: catalog matches alone until TMDB answers, then both
 * re-ranked together. Catalog "suggestions" (fuzzy near-misses) only show
 * once TMDB has nothing.
 */
export function mergeSearch(
  selection: { titles: Title[]; mode: CatalogMode },
  tmdb: TmdbSearchState,
  query: string,
): { titles: Title[]; mode: SearchMode; external: boolean } {
  const none = { ...selection, external: false }
  if (selection.mode === 'browse' || tmdb.status === 'off') return none

  if (selection.mode === 'results') {
    if (tmdb.status !== 'done' || tmdb.titles.length === 0) return none
    return { titles: rank(query, selection.titles, tmdb.titles), mode: 'results', external: true }
  }

  if (tmdb.status === 'pending') return { titles: [], mode: 'searching', external: false }
  if (tmdb.status === 'done' && tmdb.titles.length > 0) return { titles: tmdb.titles, mode: 'results', external: true }
  return none
}
