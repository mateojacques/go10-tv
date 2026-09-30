import { useMemo } from 'react'
import type { CatalogRow, Title } from '@go10/core/types'
import { buildRows, ROW_LIMIT, type CatalogRowGroup } from '@go10/core/catalog/buildRows'
import { Row } from '../components/Row'
import { listProgress } from '@go10/core/progress/progressStore'
import { continueWatching } from '@go10/core/progress/titleProgress'
import { continueCardProgress } from '@go10/core/progress/describe'
import type { Collection } from '@go10/core/collections/types'
import { visibleCollections } from '@go10/core/collections/resolveCollection'
import { CollectionStrip } from '../components/CollectionStrip'
import { externalTitlesEnabled } from '@go10/core/external/config'
import { listSnapshots } from '@go10/core/external/snapshots'
import type { HeroArtIndex } from '@go10/core/hero/art'
import { pickHeroOnce } from '@go10/core/hero/pickHero'
import { HeroCarousel } from './HeroCarousel'
import './Home.css'

export function Home({
  titles,
  onSelect,
  onResume,
  collections,
  onOpenCollection,
  heroArt,
}: {
  titles: Title[]
  onSelect: (title: Title) => void
  /** "Seguir viendo" skips the detail screen and plays the resume target. */
  onResume: (title: Title, row: CatalogRow) => void
  collections: Collection[]
  onOpenCollection: (collection: Collection) => void
  /** The hero art sidecar; null while it loads. */
  heroArt: HeroArtIndex | null
}) {
  // Home remounts each time it's navigated back to, so reading once per
  // mount picks up whatever was just watched. Played TMDB titles aren't in
  // the catalog; their snapshots stand in for them here, and only here.
  const continueItems = useMemo(() => {
    const candidates = externalTitlesEnabled() ? [...titles, ...listSnapshots()] : titles
    return new Map(
      continueWatching(candidates, listProgress()).slice(0, ROW_LIMIT).map((item) => [item.title.key, item]),
    )
  }, [titles])
  const strip = useMemo(
    () => visibleCollections(collections, titles).map((resolved) => resolved.collection),
    [collections, titles],
  )
  const continueGroup: CatalogRowGroup = {
    id: 'seguir-viendo',
    label: 'Seguir viendo',
    titles: [...continueItems.values()].map((item) => item.title),
  }
  // Picked once the sidecar has settled, so the first pick already prefers art; fixed for the page.
  const slides = useMemo(() => (heroArt ? pickHeroOnce(titles, heroArt) : null), [titles, heroArt])
  // Ranked with the art once it lands (titles with a backdrop rank higher), and
  // without the hero's titles, which are already on screen.
  const groups = useMemo(
    () => buildRows(titles, { heroArt: heroArt ?? {}, featured: slides?.map((slide) => slide.title.key) }),
    [titles, heroArt, slides],
  )

  if (titles.length === 0) {
    return (
      <div className="go-state">
        <span className="go-state_mark">GO10 TV</span>
        <p className="go-state_msg">El catálogo está vacío.</p>
      </div>
    )
  }

  // The strip takes focus row 0 when present; every row below shifts down.
  const firstRow = strip.length > 0 ? 1 : 0

  return (
    <div className="go-home">
      {slides === null ? (
        // The sidecar is still loading: hold the hero's space so the rows don't jump when it lands.
        <header className="go-hero go-hero--carousel has-art" aria-hidden="true">
          <div className="go-hero_stage is-active" />
        </header>
      ) : slides.length > 0 ? (
        <HeroCarousel slides={slides} onPlay={onResume} onInfo={onSelect} />
      ) : (
        // Nothing with art to feature: no hero, just clearance for the navbar.
        <div className="go-home_top" aria-hidden="true" />
      )}

      <div className="go-rows">
        {strip.length > 0 && <CollectionStrip collections={strip} rowIndex={0} onSelect={onOpenCollection} />}
        {continueGroup.titles.length > 0 && (
          <Row
            group={continueGroup}
            rowIndex={firstRow}
            onSelect={(title) => {
              const item = continueItems.get(title.key)
              if (item) onResume(title, item.progress.row)
            }}
            progressFor={(title) => {
              const item = continueItems.get(title.key)
              return item && continueCardProgress(item)
            }}
          />
        )}
        {groups.map((group, index) => (
          <Row
            key={group.id}
            group={group}
            rowIndex={index + firstRow + (continueGroup.titles.length > 0 ? 1 : 0)}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  )
}
