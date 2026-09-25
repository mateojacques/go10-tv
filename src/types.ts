export interface CatalogRow {
  catalog_index: number
  video_id: string
  type: 'movie' | 'season' | 'episode'
  title: string
  title_raw: string
  series_id: string
  series_title: string
  season_number: number | null
  season_label: string
  episode_number: number | null
  chapter_start_seconds: number | null
  chapter_end_seconds: number | null
  year: number | null
  studio: string
  source: string
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
  /** Mapped from TMDB and played through vidlove. Absent on catalog data. */
  external?: true
}

export interface Title {
  key: string
  kind: 'movie' | 'show'
  title: string
  year: number | null
  studio: string
  source: string
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
  /** Mapped from TMDB and played through vidlove. Absent on catalog data. */
  external?: true
}
