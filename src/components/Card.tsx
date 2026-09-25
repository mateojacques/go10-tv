import type { Title } from '../types'
import { useFocusable } from '../focus/useFocusable'
import { ProgressBar } from './ProgressBar'
import { imageSrc } from '../lib/imageSrc'
import './Card.css'

/** Shown on "Seguir viendo" cards in place of the usual year/genre line. */
export interface CardProgress {
  fraction: number
  label: string
}

export function Card({
  id,
  title,
  row,
  col,
  onSelect,
  progress,
}: {
  /**
   * Row-scoped focus id. A title can appear in several rows and the focus
   * registry is keyed by id, so `title.key` alone would collide.
   */
  id: string
  title: Title
  row: number
  col: number
  onSelect: (title: Title) => void
  progress?: CardProgress
}) {
  const { ref, focused, activate, tabIndex } = useFocusable(id, row, col, () => onSelect(title))
  const seasons = new Set(title.seasons.map((s) => s.season_number)).size

  return (
    <div
      ref={ref}
      tabIndex={tabIndex}
      className={`go-card${focused ? ' is-focused' : ''}`}
      data-focused={focused}
      role="button"
      aria-label={title.title}
      onClick={activate}
    >
      <div className="go-card_frame">
        <img className="go-card_img" src={imageSrc(title.thumbnail)} alt="" loading="lazy" />
        <div className="go-card_tags">
          {title.quality === '4K' && <span className="go-card_tag is-accent">4K</span>}
          {title.kind === 'show' && (
            <span className="go-card_tag">
              {seasons} {seasons === 1 ? 'Temporada' : 'Temporadas'}
            </span>
          )}
        </div>
        {progress && <ProgressBar fraction={progress.fraction} className="go-card_progress" />}
      </div>
      <div className="go-card_name">{title.title}</div>
      <div className="go-card_meta">
        {progress ? progress.label : [title.year, title.genre].filter(Boolean).join(' · ')}
      </div>
    </div>
  )
}
