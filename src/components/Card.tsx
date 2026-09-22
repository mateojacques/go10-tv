import type { Title } from '../types'
import { useFocusable } from '../focus/useFocusable'
import './Card.css'

export function Card({
  id,
  title,
  row,
  col,
  onSelect,
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
}) {
  const { ref, focused, activate } = useFocusable(id, row, col, () => onSelect(title))
  const seasons = title.seasons.length

  return (
    <div
      ref={ref}
      className={`go-card${focused ? ' is-focused' : ''}`}
      data-focused={focused}
      role="button"
      aria-label={title.title}
      onClick={activate}
    >
      <div className="go-card_frame">
        <img className="go-card_img" src={`/${title.thumbnail}`} alt="" loading="lazy" />
        <div className="go-card_tags">
          {title.quality === '4K' && <span className="go-card_tag is-accent">4K</span>}
          {title.kind === 'show' && (
            <span className="go-card_tag">
              {seasons} {seasons === 1 ? 'temp.' : 'temps.'}
            </span>
          )}
        </div>
      </div>
      <div className="go-card_name">{title.title}</div>
      <div className="go-card_meta">
        {[title.year, title.genre].filter(Boolean).join(' · ')}
      </div>
    </div>
  )
}
