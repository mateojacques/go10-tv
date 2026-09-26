import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { CatalogRow, Title } from '@go10/core/types'
import { Backdrop } from '../components/Backdrop'
import { useFocusable } from '../focus/useFocusable'
import { useFocusState } from '../focus/FocusProvider'
import { formatDuration, formatViews } from '@go10/core/lib/format'
import { groupSeasons } from '@go10/core/player/groupSeasons'
import { useGridColumns } from './useGridColumns'
import { rowKey } from '@go10/core/catalog/rowKey'
import { ProgressBar } from '../components/ProgressBar'
import { listProgress, resumeFromTime, type Progress } from '@go10/core/progress/progressStore'
import { playedFraction, titleProgress } from '@go10/core/progress/titleProgress'
import { remainingLabel, rowLabel } from '@go10/core/progress/describe'
import { imageSrc } from '@go10/core/lib/imageSrc'
import './Detail.css'

function FocusButton({
  id,
  row,
  col,
  onEnter,
  className,
  ariaLabel,
  ariaPressed,
  children,
}: {
  id: string
  row: number
  col: number
  onEnter: () => void
  className: string
  ariaLabel?: string
  ariaPressed?: boolean
  children: ReactNode
}) {
  const { ref, focused, activate, tabIndex } = useFocusable(id, row, col, onEnter)
  return (
    <div
      ref={ref}
      tabIndex={tabIndex}
      role="button"
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      className={`${className}${focused ? ' is-focused' : ''}`}
      data-focused={focused}
      onClick={activate}
    >
      {children}
    </div>
  )
}

/** Duration, then "Visto" once finished or how much is left mid-way. */
function rowStatus(row: CatalogRow, progress: Progress | undefined): string {
  const state = progress?.watched
    ? 'Visto'
    : progress && resumeFromTime(progress) !== null
      ? remainingLabel(progress)
      : null
  return [formatDuration(row.duration_seconds), state].filter(Boolean).join(' · ')
}

const SEASON_ROW = 1
/** Episode tiles take every focus row from here down, one per grid line. */
const FIRST_EPISODE_ROW = 2

/**
 * A season's episodes as a dense grid of numbered tiles: fifty episodes fold
 * into ten short lines on a phone instead of fifty stacked cards. The number
 * is all most of these episodes have to tell them apart (they share one
 * thumbnail), so the grid leads with it and the rest goes on one caption line.
 */
function EpisodeGrid({
  rows,
  activeRow,
  progress,
  onPick,
}: {
  rows: CatalogRow[]
  activeRow: CatalogRow
  progress: Record<string, Progress>
  onPick: (row: CatalogRow) => void
}) {
  const gridRef = useRef<HTMLOListElement>(null)
  const columns = useGridColumns(gridRef)
  const { focusedId } = useFocusState()
  // The caption follows the remote across the grid, and otherwise describes
  // the episode Play would start.
  const described =
    rows.find((episode) => focusedId === `detail:episode:${rowKey(episode)}`) ??
    rows.find((episode) => rowKey(episode) === rowKey(activeRow))

  return (
    <>
      <p className="go-episodes_caption">
        {described && (
          <>
            <span className="go-episodes_caption-n">Episodio {described.episode_number}</span>
            {rowStatus(described, progress[rowKey(described)]) &&
              ` · ${rowStatus(described, progress[rowKey(described)])}`}
          </>
        )}
      </p>
      <ol ref={gridRef} className="go-epgrid">
        {rows.map((episode, index) => {
          const key = rowKey(episode)
          const episodeProgress = progress[key]
          const watched = episodeProgress?.watched === true
          return (
            <li key={key}>
              <FocusButton
                id={`detail:episode:${key}`}
                row={FIRST_EPISODE_ROW + Math.floor(index / columns)}
                col={index % columns}
                onEnter={() => onPick(episode)}
                ariaLabel={[`Episodio ${episode.episode_number}`, rowStatus(episode, episodeProgress)]
                  .filter(Boolean)
                  .join(', ')}
                className={`go-ep${key === rowKey(activeRow) ? ' is-active' : ''}${watched ? ' is-watched' : ''}`}
              >
                <span className="go-ep_n" aria-hidden="true">
                  {episode.episode_number}
                </span>
                {!watched && <ProgressBar fraction={playedFraction(episodeProgress)} className="go-ep_progress" />}
              </FocusButton>
            </li>
          )
        })}
      </ol>
    </>
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
  // Re-read on every render: this screen stays mounted under the player, and
  // re-renders when playback closes, so bars reflect what was just watched.
  const progress = listProgress()
  const [activeRow, setActiveRow] = useState<CatalogRow>(() => titleProgress(title, progress).row)
  const isShow = title.kind === 'show'
  const activeProgress = progress[rowKey(activeRow)] ?? null
  const resuming = resumeFromTime(activeProgress) !== null

  const seasonGroups = useMemo(() => groupSeasons(title.seasons), [title.seasons])
  const [selectedSeasonNumber, setSelectedSeasonNumber] = useState<number>(
    activeRow.season_number ?? seasonGroups[0]?.seasonNumber ?? 0,
  )
  const selectedGroup = seasonGroups.find((group) => group.seasonNumber === selectedSeasonNumber)

  useEffect(() => {
    if (!playingRow || rowKey(playingRow) === rowKey(activeRow)) return
    setActiveRow(playingRow)
    setSelectedSeasonNumber(playingRow.season_number ?? selectedSeasonNumber)
  }, [playingRow, activeRow, selectedSeasonNumber])

  const meta = [
    activeRow.year ?? title.year,
    title.quality,
    title.subtitled ? `${title.language} (sub)` : title.language,
    formatDuration(activeRow.duration_seconds),
    // TMDB has no view counts; "0 vistas" would read as unpopular.
    title.external ? null : formatViews(title.views),
  ].filter(Boolean)

  // Which episode Play starts and how much of it is left: context under the
  // button, not part of its label.
  const playMeta = [
    isShow ? rowLabel(activeRow) : null,
    resuming && activeProgress ? remainingLabel(activeProgress) : null,
  ].filter(Boolean)

  const pickEpisode = (episode: CatalogRow) => {
    setActiveRow(episode)
    onPlay(episode)
  }

  return (
    <div className="go-detail">
      <Backdrop thumbnail={title.thumbnail} />

      <button type="button" className="go-back" onClick={onBack} aria-label="Volver">
        <span className="go-back_chevron" aria-hidden="true" />
      </button>

      <div className="go-detail_body">
        <div className="go-detail_main">
          <p className="go-detail_eyebrow">
            {isShow
              ? `Serie · ${seasonGroups.length} ${seasonGroups.length === 1 ? 'temporada' : 'temporadas'}`
              : 'Película'}
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
            {resuming ? 'Reanudar' : 'Reproducir'}
          </FocusButton>
          {playMeta.length > 0 && (
            <p className="go-play_meta">
              {resuming && <ProgressBar fraction={playedFraction(activeProgress)} className="go-play_progress" />}
              {playMeta.join(' · ')}
            </p>
          )}
        </div>

        <figure className="go-detail_art">
          <img src={imageSrc(title.thumbnail)} alt="" />
        </figure>
      </div>

      {isShow && (
        <section className="go-seasons" aria-label="Temporadas y episodios">
          {seasonGroups.length > 1 && (
            <div className="go-seasontabs">
              {seasonGroups.map((group, index) => {
                // A season that is one whole file plays straight from its tab.
                const single = group.rows.length === 1 ? group.rows[0] : null
                const singleProgress = single ? progress[rowKey(single)] : undefined
                const selected = group.seasonNumber === selectedSeasonNumber
                return (
                  <FocusButton
                    key={group.seasonNumber}
                    id={`detail:season:${group.seasonNumber}`}
                    row={SEASON_ROW}
                    col={index}
                    ariaPressed={selected}
                    ariaLabel={
                      single
                        ? [group.label, rowStatus(single, singleProgress)].filter(Boolean).join(', ')
                        : `${group.label}, ${group.rows.length} episodios`
                    }
                    onEnter={() => {
                      const first = group.rows[0]
                      setActiveRow(first)
                      setSelectedSeasonNumber(group.seasonNumber)
                      if (single) onPlay(first)
                    }}
                    className={`go-seasontab${selected ? ' is-active' : ''}${
                      singleProgress?.watched ? ' is-watched' : ''
                    }`}
                  >
                    {group.label}
                    {single && !singleProgress?.watched && (
                      <ProgressBar fraction={playedFraction(singleProgress)} className="go-seasontab_progress" />
                    )}
                  </FocusButton>
                )
              })}
            </div>
          )}

          {selectedGroup && selectedGroup.rows.length > 1 && (
            <div className="go-episodes">
              <h2 className="go-seasons_label">
                Episodios
                <span className="go-seasons_count">{selectedGroup.rows.length}</span>
              </h2>
              <EpisodeGrid
                rows={selectedGroup.rows}
                activeRow={activeRow}
                progress={progress}
                onPick={pickEpisode}
              />
            </div>
          )}
        </section>
      )}
    </div>
  )
}
