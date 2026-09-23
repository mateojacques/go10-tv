import { useMemo } from 'react'
import type { CatalogRow, Title } from '../types'
import { buildRows, ROW_LIMIT, type CatalogRowGroup } from '../catalog/buildRows'
import { Row } from '../components/Row'
import { Backdrop } from '../components/Backdrop'
import { useFocusable } from '../focus/useFocusable'
import { formatDuration } from '../lib/format'
import { listProgress } from '../progress/progressStore'
import { continueWatching, playedFraction, type ContinueItem } from '../progress/titleProgress'
import { remainingLabel, rowLabel } from '../progress/describe'
import type { CardProgress } from '../components/Card'
import './Home.css'

/** The hero is a fixed promo slot, not derived from the catalog. */
const FEATURED_SERIES_ID = 'spidey-y-sus-sorprendentes-amigos'

function HeroCta({ onSelect }: { onSelect: () => void }) {
  const { ref, focused, activate, tabIndex } = useFocusable('hero:select', -1, 0, onSelect)
  return (
    <div
      ref={ref}
      tabIndex={tabIndex}
      role="button"
      className={`go-hero_cta${focused ? ' is-focused' : ''}`}
      data-focused={focused}
      onClick={activate}
    >
      Más información
    </div>
  )
}

export function Home({
  titles,
  onSelect,
  onResume,
}: {
  titles: Title[]
  onSelect: (title: Title) => void
  /** "Seguir viendo" skips the detail screen and plays the resume target. */
  onResume: (title: Title, row: CatalogRow) => void
}) {
  const groups = useMemo(() => buildRows(titles), [titles])
  // Home remounts each time it's navigated back to, so reading once per
  // mount picks up whatever was just watched.
  const continueItems = useMemo(
    () => new Map(continueWatching(titles, listProgress()).slice(0, ROW_LIMIT).map((item) => [item.title.key, item])),
    [titles],
  )
  const continueGroup: CatalogRowGroup = {
    id: 'seguir-viendo',
    label: 'Seguir viendo',
    titles: [...continueItems.values()].map((item) => item.title),
  }
  const featured = titles.find((t) => t.key === FEATURED_SERIES_ID) ?? titles[0]

  if (!featured) {
    return (
      <div className="go-state">
        <span className="go-state_mark">GO10 TV</span>
        <p className="go-state_msg">El catálogo está vacío.</p>
      </div>
    )
  }

  const meta = [
    featured.year,
    featured.quality,
    featured.subtitled ? `${featured.language} (sub)` : featured.language,
    formatDuration(featured.durationSeconds),
  ].filter(Boolean)

  return (
    <div className="go-home">
      <header className="go-hero">
        <Backdrop thumbnail={featured.thumbnail} />

        <div className="go-hero_body">
          <p className="go-hero_eyebrow">Destacado</p>
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

          <HeroCta onSelect={() => onSelect(featured)} />
        </div>

        {/* The art shown crisp, at close to its native 368x210, rather than
            upscaled into the blurred field behind it. */}
        <figure className="go-hero_art">
          <img src={`/${featured.thumbnail}`} alt="" />
        </figure>
      </header>

      <div className="go-rows">
        {continueGroup.titles.length > 0 && (
          <Row
            group={continueGroup}
            rowIndex={0}
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
            rowIndex={index + (continueGroup.titles.length > 0 ? 1 : 0)}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  )
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
