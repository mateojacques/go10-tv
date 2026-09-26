import { useMemo, type ReactNode } from 'react'
import type { CatalogRow, Title } from '@go10/core/types'
import { buildRows, ROW_LIMIT, type CatalogRowGroup } from '@go10/core/catalog/buildRows'
import { Row } from '../components/Row'
import { Backdrop } from '../components/Backdrop'
import { useFocusable } from '../focus/useFocusable'
import { formatDuration } from '@go10/core/lib/format'
import { imageSrc } from '@go10/core/lib/imageSrc'
import { listProgress } from '@go10/core/progress/progressStore'
import { continueWatching, playedFraction, titleProgress, type ContinueItem } from '@go10/core/progress/titleProgress'
import { remainingLabel, rowLabel } from '@go10/core/progress/describe'
import type { CardProgress } from '../components/Card'
import { ProgressBar } from '../components/ProgressBar'
import { groupSeasons } from '@go10/core/player/groupSeasons'
import type { Collection } from '@go10/core/collections/types'
import { visibleCollections } from '@go10/core/collections/resolveCollection'
import { CollectionStrip } from '../components/CollectionStrip'
import { externalTitlesEnabled } from '@go10/core/external/config'
import { listSnapshots } from '@go10/core/external/snapshots'
import { FEATURED_ART, FEATURED_SERIES_ID } from '@go10/core/featured'
import './Home.css'

function HeroButton({
  id,
  col,
  onEnter,
  variant,
  children,
}: {
  id: string
  col: number
  onEnter: () => void
  variant: 'primary' | 'secondary'
  children: ReactNode
}) {
  const { ref, focused, activate, tabIndex } = useFocusable(id, -1, col, onEnter)
  return (
    <div
      ref={ref}
      tabIndex={tabIndex}
      role="button"
      className={`go-hero_cta go-hero_cta--${variant}${focused ? ' is-focused' : ''}`}
      data-focused={focused}
      onClick={activate}
    >
      {children}
    </div>
  )
}

export function Home({
  titles,
  onSelect,
  onResume,
  collections,
  onOpenCollection,
}: {
  titles: Title[]
  onSelect: (title: Title) => void
  /** "Seguir viendo" skips the detail screen and plays the resume target. */
  onResume: (title: Title, row: CatalogRow) => void
  collections: Collection[]
  onOpenCollection: (collection: Collection) => void
}) {
  const groups = useMemo(() => buildRows(titles), [titles])
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
  const featured = titles.find((t) => t.key === FEATURED_SERIES_ID) ?? titles[0]
  const heroProgress = useMemo(() => featured && titleProgress(featured, listProgress()), [featured])

  if (!featured) {
    return (
      <div className="go-state">
        <span className="go-state_mark">GO10 TV</span>
        <p className="go-state_msg">El catálogo está vacío.</p>
      </div>
    )
  }

  const art = featured.key === FEATURED_SERIES_ID ? FEATURED_ART : null
  const isShow = featured.kind === 'show'
  const meta = [
    isShow ? showExtent(featured) : formatDuration(featured.durationSeconds),
    featured.year,
    featured.quality,
    featured.subtitled ? `${featured.language} (sub)` : featured.language,
  ].filter(Boolean)

  const resuming = heroProgress?.mode === 'resume' ? heroProgress.progress : null
  const position = heroProgress && heroProgress.mode !== 'start' ? rowLabel(heroProgress.row) : ''
  // The strip takes focus row 0 when present; every row below shifts down.
  const firstRow = strip.length > 0 ? 1 : 0

  return (
    <div className="go-home">
      <header className={`go-hero${art ? ' has-art' : ''}`}>
        {art ? (
          <div className="go-hero_stage" aria-hidden="true">
            <div className="go-hero_frame">
              <img
                className="go-hero_key"
                src={`/${art.large}`}
                srcSet={`/${art.small} 960w, /${art.large} 1920w`}
                sizes="100vw"
                alt=""
                fetchPriority="high"
              />
            </div>
          </div>
        ) : (
          <Backdrop thumbnail={featured.thumbnail} />
        )}

        <div className="go-hero_body">
          <p className="go-hero_eyebrow">
            <span className="go-hero_badge">Destacado</span>
            {isShow ? 'Serie' : 'Película'}
            {featured.studio && ` · ${featured.studio}`}
          </p>
          <h1 className="go-hero_title">{featured.title}</h1>

          <p className="go-hero_meta">
            {meta.map((item, index) => (
              <span key={index}>
                {index > 0 && <span className="go-hero_sep" aria-hidden="true" />}
                {item}
              </span>
            ))}
          </p>

          <div className="go-hero_genres">
            {[featured.genre, featured.genre_secondary].filter(Boolean).map((genre) => (
              <span key={genre} className="go-chip">
                {genre}
              </span>
            ))}
          </div>

          <div className="go-hero_actions">
            {heroProgress && (
              <HeroButton
                id="hero:play"
                col={0}
                variant="primary"
                onEnter={() => onResume(featured, heroProgress.row)}
              >
                <span className="go-hero_play" aria-hidden="true" />
                {resuming ? 'Reanudar' : 'Reproducir'}
                {position && <span className="go-hero_cta-note">{position}</span>}
              </HeroButton>
            )}
            <HeroButton id="hero:select" col={1} variant="secondary" onEnter={() => onSelect(featured)}>
              <span className="go-hero_info" aria-hidden="true" />
              Más información
            </HeroButton>
          </div>

          {resuming && (
            <div className="go-hero_resume">
              <ProgressBar fraction={playedFraction(resuming)} className="go-hero_progress" />
              <span>{remainingLabel(resuming)}</span>
            </div>
          )}
        </div>

        {/* No key art: the thumbnail shown crisp, at close to its native
            368x210, rather than upscaled into the blurred field behind it. */}
        {!art && (
          <figure className="go-hero_art">
            <img src={imageSrc(featured.thumbnail)} alt="" />
          </figure>
        )}
      </header>

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

/** "3 temporadas", or "26 episodios" for a single season of episodes. */
function showExtent(title: Title): string {
  const seasons = groupSeasons(title.seasons)
  if (seasons.length > 1) return `${seasons.length} temporadas`
  const rows = seasons[0]?.rows ?? []
  return rows.length > 1 ? `${rows.length} episodios` : formatDuration(title.durationSeconds)
}

function continueCardProgress({ progress }: ContinueItem): CardProgress {
  const position = rowLabel(progress.row)
  if (progress.mode === 'next' || !progress.progress) {
    return { fraction: 0, label: `Siguiente${position ? `: ${position}` : ''}` }
  }
  return {
    fraction: playedFraction(progress.progress),
    label: [position, remainingLabel(progress.progress)].filter(Boolean).join(' · '),
  }
}
