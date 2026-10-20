import type { CatalogRow } from '../../types'
import type { EmbedProvider } from './types'
import { okru } from './okru'
import { vidlove } from './vidlove'
import { youtube } from './youtube'
import { isYoutubeUrl } from '../youtubeUrl'

export type { EmbedProvider, PlayerEvent } from './types'

/** Rows with a YouTube embed_url play on YouTube; other catalog rows on ok.ru; TMDB rows on vidlove. */
export function providerFor(row: CatalogRow): EmbedProvider {
  if (isYoutubeUrl(row.embed_url)) return youtube
  return row.external ? vidlove : okru
}
