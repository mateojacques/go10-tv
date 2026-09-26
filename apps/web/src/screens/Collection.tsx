import type { Collection as CollectionData } from '../collections/types'
import type { Title } from '../types'
import { CatalogGrid } from './Catalog'
import '../components/Row.css'
import './Catalog.css'
import './Collection.css'

/**
 * One collection's titles, in the order the collection lists them. Rendered
 * inside the catalog's scroller class so the grid's lazy batching (rooted on
 * `.go-catalog`) and the navbar offset work unchanged.
 */
export function Collection({
  collection,
  titles,
  onSelect,
}: {
  collection: CollectionData
  titles: Title[]
  onSelect: (title: Title) => void
}) {
  const { background } = collection.tile

  return (
    <div className="go-catalog go-collection">
      {/* The logo is the page heading, so there's no separate title row. */}
      <h1 className="go-collection_banner">
        {background && <img className="go-collection_bg" src={`/${background}`} alt="" />}
        <img className="go-collection_logo" src={`/${collection.logo}`} alt={collection.name} />
      </h1>

      {/* Keyed so switching collections starts again from the first batch. */}
      <CatalogGrid key={collection.id} titles={titles} onSelect={onSelect} />
    </div>
  )
}
