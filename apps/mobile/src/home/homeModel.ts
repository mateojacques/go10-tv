import { buildRows, type CatalogRowGroup } from '@go10/core/catalog/buildRows'
import { visibleCollections } from '@go10/core/collections/resolveCollection'
import type { Collection } from '@go10/core/collections/types'
import { pickHeroOnce, type HeroSlide } from '@go10/core/hero/pickHero'
import type { Title } from '@go10/core/types'
import type { CatalogData } from '../data/catalogStore'

export interface HomeModel {
  /** The hero carousel: picked once per launch (pickHeroOnce), so a background refresh never reshuffles it. */
  slides: HeroSlide[]
  /** Collections with at least one title in the catalog, in tile order. */
  strip: Collection[]
  rows: CatalogRowGroup[]
  /** Every title, for Seguir viendo. */
  titles: Title[]
}

/** The web Home's layout decisions (apps/web/src/screens/Home.tsx); Seguir viendo is built by HomeView from live progress. */
export function buildHome(data: CatalogData): HomeModel | null {
  if (data.titles.length === 0) return null
  return {
    slides: pickHeroOnce(data.titles, data.heroArt),
    strip: visibleCollections(data.collections, data.titles).map((resolved) => resolved.collection),
    rows: buildRows(data.titles),
    titles: data.titles,
  }
}
