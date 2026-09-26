import { buildRows, type CatalogRowGroup } from '@go10/core/catalog/buildRows'
import { visibleCollections } from '@go10/core/collections/resolveCollection'
import type { Collection } from '@go10/core/collections/types'
import { FEATURED_ART, FEATURED_SERIES_ID } from '@go10/core/featured'
import type { Title } from '@go10/core/types'
import type { CatalogData } from '../data/catalogStore'

export interface HomeModel {
  featured: Title
  /** Full-resolution key art, only for the promo title; others get the blurred thumbnail. */
  featuredArt: { small: string; large: string } | null
  /** Collections with at least one title in the catalog, in tile order. */
  strip: Collection[]
  rows: CatalogRowGroup[]
  /** Every title, for Seguir viendo. */
  titles: Title[]
}

/** The web Home's layout decisions (apps/web/src/screens/Home.tsx); Seguir viendo is built by HomeView from live progress. */
export function buildHome(data: CatalogData): HomeModel | null {
  const featured = data.titles.find((t) => t.key === FEATURED_SERIES_ID) ?? data.titles[0]
  if (!featured) return null
  return {
    featured,
    featuredArt: featured.key === FEATURED_SERIES_ID ? FEATURED_ART : null,
    strip: visibleCollections(data.collections, data.titles).map((resolved) => resolved.collection),
    rows: buildRows(data.titles),
    titles: data.titles,
  }
}
