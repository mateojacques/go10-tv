import { externalTitlesEnabled } from '@go10/core/external/config'
import { isTmdbKey } from '@go10/core/external/tmdb/keys'
import { useCatalog } from '../data/CatalogProvider'
import { useTmdbTitle } from '../external/useTmdbTitle'
import { titleSource, type TitleSource } from './titleSource'

/** The titles a route keyed by `key` resolves against; TMDB keys are fetched. */
export function useTitleSource(key: string): TitleSource {
  const { state } = useCatalog()
  const external = externalTitlesEnabled()
  const tmdb = useTmdbTitle(external && isTmdbKey(key) ? key : null)
  return titleSource(state, key, tmdb, external)
}
