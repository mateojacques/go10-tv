import type { Collection } from '@go10/core/collections/types'
import { useFocusable } from '../focus/useFocusable'
import './CollectionTile.css'

/** A brand card: the collection's logo on its colour, no text. */
export function CollectionTile({
  collection,
  row,
  col,
  onSelect,
}: {
  collection: Collection
  row: number
  col: number
  onSelect: (collection: Collection) => void
}) {
  const { ref, focused, activate, tabIndex } = useFocusable(`collection:${collection.id}`, row, col, () =>
    onSelect(collection),
  )
  const { color, background } = collection.tile

  return (
    <div
      ref={ref}
      tabIndex={tabIndex}
      role="button"
      aria-label={collection.name}
      className={`go-tile${focused ? ' is-focused' : ''}`}
      data-focused={focused}
      style={{ backgroundColor: color }}
      onClick={activate}
    >
      {background && <img className="go-tile_bg" src={`/${background}`} alt="" loading="lazy" />}
      <img className="go-tile_logo" src={`/${collection.logo}`} alt="" />
    </div>
  )
}
