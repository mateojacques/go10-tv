import type { CatalogRow, Title } from '../types'
import type { Collection } from '../collections/types'

export function catalogRow(overrides: Partial<CatalogRow> = {}): CatalogRow {
  return {
    catalog_index: 0, video_id: 'v1', type: 'movie', title: 'Movie', title_raw: 'Movie',
    series_id: '', series_title: '', season_number: null, season_label: '', episode_number: null,
    chapter_start_seconds: null, chapter_end_seconds: null, year: null, studio: '', source: '', genre: '',
    genre_secondary: '', quality: '', language: '', subtitled: false, duration_raw: '', duration_seconds: 600,
    views: 0, thumbnail: 'assets/x.jpg', video_url: 'https://ok.ru/video/v1', embed_url: 'https://ok.ru/videoembed/v1',
    ...overrides,
  }
}

export function movieTitle(key: string, seconds: number): Title {
  const row = catalogRow({ video_id: key, title: key, duration_seconds: seconds, embed_url: `https://ok.ru/videoembed/${key}` })
  return {
    key, kind: 'movie', title: key, year: null, studio: '', source: '', genre: '', genre_secondary: '',
    quality: '', language: '', subtitled: false, thumbnail: row.thumbnail, views: 0,
    durationSeconds: seconds, catalogIndex: 0, seasons: [row],
  }
}

/** A show of `count` separate episode files, each `seconds` long, season 1. */
export function showTitle(key: string, count: number, seconds: number): Title {
  const seasons = Array.from({ length: count }, (_, i) =>
    catalogRow({
      video_id: `${key}-${i + 1}`, type: 'episode', title: `${key} ${i + 1}`, series_id: key, series_title: key,
      season_number: 1, episode_number: i + 1, duration_seconds: seconds,
      embed_url: `https://ok.ru/videoembed/${key}-${i + 1}`,
    }),
  )
  return { ...movieTitle(key, seconds), kind: 'show', title: key, seasons }
}

export function collectionOf(id: string, titles: string[]): Collection {
  return { id, name: id.toUpperCase(), order: 1, logo: `assets/collections/${id}/logo.svg`, tile: { color: '#e4007c' }, titles }
}
