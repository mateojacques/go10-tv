import type { CatalogRow } from '../../types'
import type { EmbedProvider } from './types'
import { okru } from './okru'
import { vidlove } from './vidlove'

export type { EmbedProvider, PlayerEvent } from './types'

/** Catalog rows play on ok.ru; TMDB rows on vidlove. */
export function providerFor(row: CatalogRow): EmbedProvider {
  return row.external ? vidlove : okru
}
