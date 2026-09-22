import type { Title } from '../types'
import type { CatalogRowGroup } from '../catalog/buildRows'
import { Card } from './Card'
import './Row.css'

export function Row({
  group,
  rowIndex,
  onSelect,
}: {
  group: CatalogRowGroup
  rowIndex: number
  onSelect: (title: Title) => void
}) {
  return (
    <section className="go-row">
      <h2 className="go-row_label">
        {group.label}
        <span className="go-row_count">{group.titles.length}</span>
      </h2>
      <div className="go-row_track">
        {group.titles.map((title, col) => (
          <Card
            key={`${group.id}:${title.key}`}
            id={`${group.id}:${title.key}`}
            title={title}
            row={rowIndex}
            col={col}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  )
}
