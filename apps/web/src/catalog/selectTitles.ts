import type { Title } from '../types'
import { normalize, search } from '../search/search'

export type Section = 'all' | 'movie' | 'show'
export type CatalogMode = 'browse' | 'results' | 'suggestions'

/** The cards the catalog screen shows for a section and a (possibly empty) query. */
export function selectTitles(
  titles: Title[],
  section: Section,
  query: string,
): { titles: Title[]; mode: CatalogMode } {
  const inSection = section === 'all' ? titles : titles.filter((t) => t.kind === section)

  if (normalize(query) === '') return { titles: inSection, mode: 'browse' }

  const { matches, fallback } = search(query, inSection)
  return { titles: matches, mode: fallback ? 'suggestions' : 'results' }
}
