import Papa from 'papaparse'
import type { CatalogRow, Title } from '../types'

const NUMERIC = ['catalog_index', 'season_number', 'episode_number', 'year', 'duration_seconds', 'views']

export function parseCatalogCsv(text: string): CatalogRow[] {
  const { data } = Papa.parse<Record<string, string>>(text.trim(), {
    header: true,
    skipEmptyLines: true,
  })

  return data.map((raw) => {
    const row: Record<string, unknown> = { ...raw }
    for (const key of NUMERIC) {
      const value = raw[key]
      row[key] = value === '' || value === undefined ? null : Number(value)
    }
    row.subtitled = raw.subtitled === 'true'
    return row as unknown as CatalogRow
  })
}

export function buildTitles(rows: CatalogRow[]): Title[] {
  const byKey = new Map<string, CatalogRow[]>()

  for (const row of rows) {
    const key = row.series_id || row.video_id
    const bucket = byKey.get(key)
    if (bucket) bucket.push(row)
    else byKey.set(key, [row])
  }

  return [...byKey.entries()].map(([key, group]): Title => {
    const seasons = [...group].sort(
      (a, b) =>
        (a.season_number ?? 0) - (b.season_number ?? 0) ||
        (a.episode_number ?? 0) - (b.episode_number ?? 0),
    )
    const primary = seasons[0]
    const isShow = Boolean(primary.series_id)

    return {
      key,
      kind: isShow ? 'show' : 'movie',
      title: isShow ? primary.series_title : primary.title,
      year: primary.year,
      studio: primary.studio,
      genre: primary.genre,
      genre_secondary: primary.genre_secondary,
      quality: primary.quality,
      language: primary.language,
      subtitled: primary.subtitled,
      thumbnail: primary.thumbnail,
      views: seasons.reduce((total, s) => total + s.views, 0),
      durationSeconds: primary.duration_seconds,
      catalogIndex: Math.min(...seasons.map((s) => s.catalog_index)),
      seasons,
    }
  }).sort((a, b) => a.catalogIndex - b.catalogIndex)
}
