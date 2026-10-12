import type { Collection } from '@go10/core/collections/types'
import { CollectionTile } from './CollectionTile'
import './Row.css'
import './CollectionTile.css'

/** The row of brand tiles under the Home hero. One focus row, no heading. */
export function CollectionStrip({
  collections,
  rowIndex,
  label = 'Colecciones',
  onSelect,
}: {
  collections: Collection[]
  rowIndex: number
  label?: string
  onSelect: (collection: Collection) => void
}) {
  return (
    <nav className="go-strip" aria-label={label}>
      <div className="go-row_track">
        {collections.map((collection, col) => (
          <CollectionTile
            key={collection.id}
            collection={collection}
            row={rowIndex}
            col={col}
            onSelect={onSelect}
          />
        ))}
      </div>
    </nav>
  )
}
