import { useEffect, useMemo, useRef, useState } from 'react'
import type { Title } from '../types'
import { selectTitles, type CatalogMode, type Section } from '../catalog/selectTitles'
import { Card } from '../components/Card'
import { useGridColumns } from './useGridColumns'
import './Catalog.css'

/**
 * Cards are mounted a batch at a time: the full movie section is 774 titles,
 * which is a lot of DOM and focus registrations for a TV browser at once.
 */
export const BATCH = 60

const SECTION_LABELS: Record<Section, string> = {
  all: 'Catálogo',
  movie: 'Películas',
  show: 'Series',
}

function heading(mode: CatalogMode, section: Section, query: string) {
  if (mode === 'results') return `Resultados para "${query.trim()}"`
  if (mode === 'suggestions') return `Sin resultados para "${query.trim()}"`
  return SECTION_LABELS[section]
}

/**
 * Every title matching a section and/or a search query, as a focusable grid.
 * The same screen serves "Películas", "Series" and search results.
 */
export function Catalog({
  titles,
  section,
  query,
  onSelect,
}: {
  titles: Title[]
  section: Section
  query: string
  onSelect: (title: Title) => void
}) {
  const selection = useMemo(() => selectTitles(titles, section, query), [titles, section, query])

  return (
    <div className="go-catalog">
      <header className="go-catalog_head">
        <h1 className="go-catalog_title">
          {heading(selection.mode, section, query)}
          {selection.mode !== 'suggestions' && (
            <span className="go-row_count">{selection.titles.length}</span>
          )}
        </h1>
        {selection.mode === 'suggestions' && <p className="go-catalog_sub">Quizás te interese</p>}
      </header>

      {selection.titles.length === 0 ? (
        <p className="go-catalog_empty">No hay títulos.</p>
      ) : (
        // Keyed so a new filter starts again from the first batch.
        <CatalogGrid key={`${section}|${query.trim()}`} titles={selection.titles} onSelect={onSelect} />
      )}
    </div>
  )
}

export function CatalogGrid({ titles, onSelect }: { titles: Title[]; onSelect: (title: Title) => void }) {
  const gridRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const columns = useGridColumns(gridRef)
  const [limit, setLimit] = useState(() =>
    typeof IntersectionObserver === 'undefined' ? Infinity : BATCH,
  )
  const hasMore = limit < titles.length

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasMore) return
    // A viewport of margin loads the next batch well before the remote reaches
    // the last row, so moving down never hits a temporary dead end. Re-observed
    // per batch, so a sentinel still in range right after loading fires again.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setLimit((l) => l + BATCH)
      },
      // Rooted on the screen's own scroller: against the viewport, the
      // margin would be clipped away by it and only fire at the very bottom.
      { root: sentinel.closest('.go-catalog'), rootMargin: '100% 0px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [limit, hasMore])

  return (
    <>
      <div ref={gridRef} className="go-catalog_grid">
        {titles.slice(0, limit).map((title, index) => (
          <Card
            key={title.key}
            id={`grid:${title.key}`}
            title={title}
            row={Math.floor(index / columns)}
            col={index % columns}
            onSelect={onSelect}
          />
        ))}
      </div>
      {hasMore && <div ref={sentinelRef} className="go-catalog_sentinel" aria-hidden="true" />}
    </>
  )
}
