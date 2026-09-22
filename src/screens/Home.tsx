import { useMemo } from 'react'
import type { Title } from '../types'
import { buildRows } from '../catalog/buildRows'
import { Row } from '../components/Row'
import { Backdrop } from '../components/Backdrop'
import { useFocusable } from '../focus/useFocusable'
import { formatDuration } from '../lib/format'
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
}: {
  titles: Title[]
  onSelect: (title: Title) => void
}) {
  const groups = useMemo(() => buildRows(titles), [titles])
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
          <div className="go-wordmark">
            <span className="go-wordmark_dot" aria-hidden="true" />
            GO10 TV
          </div>

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
        {groups.map((group, index) => (
          <Row key={group.id} group={group} rowIndex={index} onSelect={onSelect} />
        ))}
      </div>
    </div>
  )
}
