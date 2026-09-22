import type { CatalogRow } from '../types'

export interface SeasonGroup {
  seasonNumber: number
  label: string
  rows: CatalogRow[]
}

/** `rows` must already be sorted by season_number (buildTitles guarantees this). */
export function groupSeasons(rows: CatalogRow[]): SeasonGroup[] {
  const groups: SeasonGroup[] = []

  for (const row of rows) {
    const seasonNumber = row.season_number ?? 0
    const current = groups[groups.length - 1]

    if (current && current.seasonNumber === seasonNumber) {
      current.rows.push(row)
    } else {
      groups.push({
        seasonNumber,
        label: row.season_label || `Temporada ${seasonNumber}`,
        rows: [row],
      })
    }
  }

  return groups
}
