import { describe, it, expect, beforeEach } from 'vitest'
import { readCachedCatalog, writeCachedCatalog } from './catalogCache'
import type { CatalogRow } from '../types'

function row(overrides: Partial<CatalogRow> = {}): CatalogRow {
  return {
    catalog_index: 0, video_id: '1', type: 'movie', title: 'X', title_raw: '',
    series_id: '', series_title: '', season_number: null, season_label: '',
    episode_number: null, chapter_start_seconds: null, chapter_end_seconds: null, year: null, studio: '', source: '', genre: '', genre_secondary: '',
    quality: '', language: '', subtitled: false, duration_raw: '', duration_seconds: 0,
    views: 0, thumbnail: '', video_url: '', embed_url: '',
    ...overrides,
  }
}

beforeEach(() => {
  sessionStorage.clear()
})

describe('catalogCache', () => {
  it('returns null when nothing has been cached', () => {
    expect(readCachedCatalog()).toBeNull()
  })

  it('round-trips rows written to the cache', () => {
    const rows = [row({ video_id: '1' }), row({ video_id: '2' })]
    writeCachedCatalog(rows)
    expect(readCachedCatalog()).toEqual(rows)
  })

  it('returns null for malformed stored data instead of throwing', () => {
    sessionStorage.setItem('go10:catalog:v1', 'not json')
    expect(readCachedCatalog()).toBeNull()
  })
})
