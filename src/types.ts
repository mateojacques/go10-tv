export interface CatalogRow {
  catalog_index: number
  video_id: string
  type: 'movie' | 'season'
  title: string
  title_raw: string
  series_id: string
  series_title: string
  season_number: number | null
  season_label: string
  year: number | null
  studio: string
  genre: string
  genre_secondary: string
  quality: string
  language: string
  subtitled: boolean
  duration_raw: string
  duration_seconds: number
  views: number
  thumbnail: string
  video_url: string
  embed_url: string
}

export interface Title {
  key: string
  kind: 'movie' | 'show'
  title: string
  year: number | null
  studio: string
  genre: string
  genre_secondary: string
  quality: string
  language: string
  subtitled: boolean
  thumbnail: string
  views: number
  durationSeconds: number
  catalogIndex: number
  /** For a movie, the single row. For a show, its seasons ordered ascending. */
  seasons: CatalogRow[]
}
