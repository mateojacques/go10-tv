import { describe, it, expect } from 'vitest'
import { groupSeasons } from './groupSeasons'
import type { CatalogRow } from '../types'

function row(overrides: Partial<CatalogRow>): CatalogRow {
  return {
    catalog_index: 0, video_id: '1', type: 'season', title: 'X', title_raw: '',
    series_id: 'x', series_title: 'X', season_number: 1, season_label: '',
    episode_number: null, year: null, studio: '', genre: '', genre_secondary: '',
    quality: '', language: '', subtitled: false, duration_raw: '', duration_seconds: 0,
    views: 0, thumbnail: '', video_url: '', embed_url: '',
    ...overrides,
  }
}

describe('groupSeasons', () => {
  it('gives one group per season row for a legacy single-video show', () => {
    const rows = [row({ video_id: '1', season_number: 1 }), row({ video_id: '2', season_number: 2 })]
    const groups = groupSeasons(rows)
    expect(groups).toHaveLength(2)
    expect(groups[0].rows).toHaveLength(1)
    expect(groups[1].rows).toHaveLength(1)
  })

  it('groups multiple episode rows sharing a season number together', () => {
    const rows = [
      row({ video_id: '1', type: 'episode', season_number: 1, episode_number: 1 }),
      row({ video_id: '2', type: 'episode', season_number: 1, episode_number: 2 }),
      row({ video_id: '3', type: 'episode', season_number: 2, episode_number: 1 }),
    ]
    const groups = groupSeasons(rows)
    expect(groups).toHaveLength(2)
    expect(groups[0].rows.map((r) => r.video_id)).toEqual(['1', '2'])
    expect(groups[1].rows.map((r) => r.video_id)).toEqual(['3'])
  })

  it('falls back to "Temporada N" when season_label is empty', () => {
    const groups = groupSeasons([row({ season_number: 3, season_label: '' })])
    expect(groups[0].label).toBe('Temporada 3')
  })

  it('uses season_label verbatim when present', () => {
    const groups = groupSeasons([
      row({ season_number: 5, season_label: '22º Torneo de las Artes Marciales' }),
    ])
    expect(groups[0].label).toBe('22º Torneo de las Artes Marciales')
  })
})
