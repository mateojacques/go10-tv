import { useState, type ReactNode } from 'react'
import type { CatalogRow, Title } from '../types'
import { Backdrop } from '../components/Backdrop'
import { useFocusable } from '../focus/useFocusable'
import { formatDuration, formatViews } from '../lib/format'
import './Detail.css'

function FocusButton({
  id,
  row,
  col,
  onEnter,
  className,
  children,
}: {
  id: string
  row: number
  col: number
  onEnter: () => void
  className: string
  children: ReactNode
}) {
  const { ref, focused, activate, tabIndex } = useFocusable(id, row, col, onEnter)
  return (
    <div
      ref={ref}
      tabIndex={tabIndex}
      role="button"
      className={`${className}${focused ? ' is-focused' : ''}`}
      data-focused={focused}
      onClick={activate}
    >
      {children}
    </div>
  )
}

export function Detail({
  title,
  onPlay,
  onBack,
}: {
  title: Title
  onPlay: (row: CatalogRow) => void
  /**
   * A remote/keyboard user backs out with Escape/Backspace (handled in
   * FocusProvider); a phone has no such key, so touch needs a visible,
   * tappable way back too.
   */
  onBack: () => void
}) {
  const [activeSeason, setActiveSeason] = useState<CatalogRow>(title.seasons[0])
  const isShow = title.kind === 'show'

  const meta = [
    activeSeason.year ?? title.year,
    title.quality,
    title.subtitled ? `${title.language} (sub)` : title.language,
    formatDuration(activeSeason.duration_seconds),
    formatViews(title.views),
  ].filter(Boolean)

  return (
    <div className="go-detail">
      <Backdrop thumbnail={title.thumbnail} />

      <button type="button" className="go-back" onClick={onBack} aria-label="Volver">
        <span className="go-back_chevron" aria-hidden="true" />
      </button>

      <div className="go-detail_body">
        <div className="go-detail_main">
          <p className="go-detail_eyebrow">
            {isShow ? `Serie · ${title.seasons.length} temporadas` : 'Película'}
            {title.studio && ` · ${title.studio}`}
          </p>

          <h1 className="go-detail_title">{title.title}</h1>

          <p className="go-detail_meta">
            {meta.map((item, index) => (
              <span key={index}>
                {index > 0 && <span className="go-detail_sep" aria-hidden="true" />}
                {item}
              </span>
            ))}
          </p>

          <div className="go-detail_genres">
            {[title.genre, title.genre_secondary].filter(Boolean).map((genre) => (
              <span key={genre} className="go-chip">
                {genre}
              </span>
            ))}
          </div>

          <FocusButton
            id="detail:play"
            row={0}
            col={0}
            onEnter={() => onPlay(activeSeason)}
            className="go-play"
          >
            <span className="go-play_icon" aria-hidden="true" />
            Reproducir
            {isShow && (
              <span className="go-play_season">
                {activeSeason.season_label || `Temporada ${activeSeason.season_number}`}
              </span>
            )}
          </FocusButton>

          <p className="go-detail_hint">
            Usa las flechas para navegar · Atrás para volver
          </p>
        </div>

        <figure className="go-detail_art">
          <img src={`/${title.thumbnail}`} alt="" />
        </figure>
      </div>

      {isShow && (
        <section className="go-seasons">
          <h2 className="go-seasons_label">Temporadas</h2>
          <div className="go-seasons_list">
            {title.seasons.map((season, index) => (
              <FocusButton
                key={season.video_id}
                id={`detail:season:${season.video_id}`}
                row={1}
                col={index}
                onEnter={() => {
                  setActiveSeason(season)
                  onPlay(season)
                }}
                className={`go-season${
                  season.video_id === activeSeason.video_id ? ' is-active' : ''
                }`}
              >
                <span className="go-season_n">
                  {season.season_label || `Temporada ${season.season_number}`}
                </span>
                <span className="go-season_d">
                  {[formatDuration(season.duration_seconds), season.quality]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </FocusButton>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
