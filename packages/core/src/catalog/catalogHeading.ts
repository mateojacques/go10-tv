import type { SearchMode } from '../external/mergeSearch'
import type { Section } from './selectTitles'

export const SECTION_LABELS: Record<Section, string> = {
  all: 'Catálogo',
  movie: 'Películas',
  show: 'Series',
}

/** The catalog screen's heading: the section when browsing, the query when searching. */
export function catalogHeading(mode: SearchMode, section: Section, query: string): string {
  if (mode === 'results' || mode === 'searching') return `Resultados para "${query.trim()}"`
  if (mode === 'suggestions') return `Sin resultados para "${query.trim()}"`
  return SECTION_LABELS[section]
}
