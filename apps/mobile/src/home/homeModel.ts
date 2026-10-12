import { buildRows, type CatalogRowGroup } from '@go10/core/catalog/buildRows'
import { visibleCollections } from '@go10/core/collections/resolveCollection'
import { collectionGroup, splitByGroup } from '@go10/core/collections/groups'
import type { Collection } from '@go10/core/collections/types'
import { pickHeroOnce, type HeroSlide } from '@go10/core/hero/pickHero'
import type { Title } from '@go10/core/types'
import type { CatalogData } from '../data/catalogStore'

export interface HomeModel {
  /** The hero carousel: picked once per launch (pickHeroOnce), so a background refresh never reshuffles it. */
  slides: HeroSlide[]
  /** Network collections with at least one title in the catalog, in tile order. */
  strip: Collection[]
  /** Franchise collections with at least one title, in tile order: the second strip, also headless. */
  franchiseStrip: Collection[]
  rows: CatalogRowGroup[]
  /** Every title, for Seguir viendo. */
  titles: Title[]
}

/** The web Home's layout decisions (apps/web/src/screens/Home.tsx); Seguir viendo is built by HomeView from live progress. */
export function buildHome(data: CatalogData): HomeModel | null {
  if (data.titles.length === 0) return null
  const slides = pickHeroOnce(data.titles, data.heroArt)
  const strips = splitByGroup(visibleCollections(data.collections, data.titles).map((resolved) => resolved.collection), collectionGroup)
  return {
    slides,
    strip: strips.network,
    franchiseStrip: strips.franchise,
    rows: buildRows(data.titles, { heroArt: data.heroArt, featured: slides.map((slide) => slide.title.key) }),
    titles: data.titles,
  }
}
