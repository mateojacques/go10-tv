import { describe, it, expect } from 'vitest'
import { rowKey } from './rowKey'
import type { CatalogRow } from '../types'

function row(overrides: Partial<CatalogRow>): CatalogRow {
  return {
    catalog_index: 0, video_id: '1', type: 'episode', title: 'X', title_raw: '',
    series_id: 'x', series_title: 'X', season_number: 1, season_label: '',
    episode_number: 1, chapter_start_seconds: null, chapter_end_seconds: null,
    year: null, studio: '', source: '', genre: '', genre_secondary: '',
    quality: '', language: '', subtitled: false, duration_raw: '', duration_seconds: 0,
    views: 0, thumbnail: '', video_url: '', embed_url: '',
    ...overrides,
  }
}

describe('rowKey', () => {
  it('is the bare video_id for a row with no chapter boundary', () => {
    expect(rowKey(row({ video_id: '42', chapter_start_seconds: null }))).toBe('42')
  })

  it('composes video_id and episode_number for a chaptered row', () => {
    expect(rowKey(row({ video_id: '42', chapter_start_seconds: 0, episode_number: 3 }))).toBe('42:3')
  })

  it('differs between two chapters of the same video', () => {
    const a = row({ video_id: '42', chapter_start_seconds: 0, episode_number: 1 })
    const b = row({ video_id: '42', chapter_start_seconds: 1435, episode_number: 2 })
    expect(rowKey(a)).not.toBe(rowKey(b))
  })
})
