/** Which Home strip and live TV group a collection belongs to. */
export type CollectionGroup = 'network' | 'franchise'

/** A hand-curated group of titles, one per `data/collections/<id>.json`. */
export interface Collection {
  /** Kebab-case slug, equal to the file name; the collection page URL. */
  id: string
  name: string
  /** Tile position on Home, ascending. Unique across collections. */
  order: number
  /** Network/studio (default) or a single franchise, which gets a 24/7 channel. */
  group?: CollectionGroup
  /** Path relative to `public/`, like `Title.thumbnail`. */
  logo: string
  tile: {
    /** Hex base fill, so the tile works without art. */
    color: string
    /** Optional art behind the logo, relative to `public/`. */
    background?: string
  }
  /** `Title.key`s in display order. */
  titles: string[]
}

/** A collection file as written on disk, before any validation. */
export interface CollectionFile {
  fileName: string
  raw: unknown
}
