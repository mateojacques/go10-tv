import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { CatalogRow, Title } from '../types'
import { Backdrop } from '../components/Backdrop'
import { useFocusable } from '../focus/useFocusable'
import { formatDuration, formatViews } from '../lib/format'
import { groupSeasons } from './groupSeasons'
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
  playingRow,
}: {
  title: Title
  onPlay: (row: CatalogRow) => void
  /**
   * A remote/keyboard user backs out with Escape/Backspace (handled in
   * FocusProvider); a phone has no such key, so touch needs a visible,
   * tappable way back too.
   */
  onBack: () => void
  /**
   * The row actually playing in the Player overlay, if any. Autoplay moves
   * this forward without going through this screen's own click handlers, so
   * it's watched here to keep the active season/episode in sync.
   */
  playingRow?: CatalogRow
}) {
  const [activeRow, setActiveRow] = useState<CatalogRow>(title.seasons[0])
  const isShow = title.kind === 'show'

  const seasonGroups = useMemo(() => groupSeasons(title.seasons), [title.seasons])
  const [selectedSeasonNumber, setSelectedSeasonNumber] = useState<number>(
    activeRow.season_number ?? seasonGroups[0]?.seasonNumber ?? 0,
  )
  const selectedGroup = seasonGroups.find((group) => group.seasonNumber === selectedSeasonNumber)

  useEffect(() => {
    if (!playingRow || playingRow.video_id === activeRow.video_id) return
    setActiveRow(playingRow)
    setSelectedSeasonNumber(playingRow.season_number ?? selectedSeasonNumber)
  }, [playingRow, activeRow.video_id, selectedSeasonNumber])

  const meta = [
    activeRow.year ?? title.year,
    title.quality,
    title.subtitled ? `${title.language} (sub)` : title.language,
    formatDuration(activeRow.duration_seconds),
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
            {isShow ? `Serie · ${seasonGroups.length} temporadas` : 'Película'}
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
            onEnter={() => onPlay(activeRow)}
            className="go-play"
          >
            <span className="go-play_icon" aria-hidden="true" />
            Reproducir
            {isShow && (
              <span className="go-play_season">
                {activeRow.season_label || `Temporada ${activeRow.season_number}`}
                {activeRow.episode_number ? ` · Episodio ${activeRow.episode_number}` : ''}
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
            {seasonGroups.map((group, index) => (
              <FocusButton
                key={group.seasonNumber}
                id={`detail:season:${group.seasonNumber}`}
                row={1}
                col={index}
                onEnter={() => {
                  const first = group.rows[0]
                  setActiveRow(first)
                  setSelectedSeasonNumber(group.seasonNumber)
                  if (group.rows.length === 1) onPlay(first)
                }}
                className={`go-season${
                  group.seasonNumber === selectedSeasonNumber ? ' is-active' : ''
                }`}
              >
                <span className="go-season_n">{group.label}</span>
                <span className="go-season_d">
                  {group.rows.length > 1
                    ? `${group.rows.length} episodios`
                    : [formatDuration(group.rows[0].duration_seconds), group.rows[0].quality]
                        .filter(Boolean)
                        .join(' · ')}
                </span>
              </FocusButton>
            ))}
          </div>

          {selectedGroup && selectedGroup.rows.length > 1 && (
            <div className="go-episodes">
              <h2 className="go-seasons_label">Episodios</h2>
              <div className="go-seasons_list">
                {selectedGroup.rows.map((episode, index) => (
                  <FocusButton
                    key={episode.video_id}
                    id={`detail:episode:${episode.video_id}`}
                    row={2}
                    col={index}
                    onEnter={() => {
                      setActiveRow(episode)
                      onPlay(episode)
                    }}
                    className={`go-season${
                      episode.video_id === activeRow.video_id ? ' is-active' : ''
                    }`}
                  >
                    <span className="go-season_n">Episodio {episode.episode_number}</span>
                    <span className="go-season_d">
                      {[formatDuration(episode.duration_seconds), episode.quality]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </FocusButton>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
