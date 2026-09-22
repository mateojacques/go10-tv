import { describe, it, expect } from 'vitest'
import { findNextEpisode, findPreviousEpisode } from './nextEpisode'
import type { CatalogRow } from '../types'

function row(overrides: Partial<CatalogRow>): CatalogRow {
  return {
    catalog_index: 0, video_id: '1', type: 'episode', title: 'X', title_raw: '',
    series_id: 'x', series_title: 'X', season_number: 1, season_label: '',
    episode_number: 1, year: null, studio: '', genre: '', genre_secondary: '',
    quality: '', language: '', subtitled: false, duration_raw: '', duration_seconds: 0,
    views: 0, thumbnail: '', video_url: '', embed_url: '',
    ...overrides,
  }
}

describe('findNextEpisode', () => {
  it('returns the next episode by episode_number within the same season', () => {
    const rows = [
      row({ video_id: '1', season_number: 1, episode_number: 2 }),
      row({ video_id: '2', season_number: 1, episode_number: 3 }),
    ]
    expect(findNextEpisode(rows, rows[0])?.video_id).toBe('2')
  })

  it('crosses into the next season when at the last episode of a season', () => {
    const rows = [
      row({ video_id: '1', season_number: 1, episode_number: 17 }),
      row({ video_id: '2', season_number: 2, episode_number: 1 }),
    ]
    expect(findNextEpisode(rows, rows[0])?.video_id).toBe('2')
  })

  it('returns null for the last episode of the last season', () => {
    const rows = [
      row({ video_id: '1', season_number: 1, episode_number: 1 }),
      row({ video_id: '2', season_number: 1, episode_number: 2 }),
    ]
    expect(findNextEpisode(rows, rows[1])).toBeNull()
  })

  it('returns null for a movie row (never episodic)', () => {
    const movieRow = row({ video_id: '1', type: 'movie', season_number: null, episode_number: null })
    expect(findNextEpisode([movieRow], movieRow)).toBeNull()
  })

  it('returns null for a season row (single-video season, not per-episode)', () => {
    const rows = [
      row({ video_id: '1', type: 'season', season_number: 1, episode_number: null }),
      row({ video_id: '2', type: 'season', season_number: 2, episode_number: null }),
    ]
    expect(findNextEpisode(rows, rows[0])).toBeNull()
  })

  it('handles gaps in episode numbering by following sort order, not arithmetic succession', () => {
    const rows = [
      row({ video_id: '1', season_number: 1, episode_number: 2 }),
      row({ video_id: '2', season_number: 1, episode_number: 5 }),
    ]
    expect(findNextEpisode(rows, rows[0])?.video_id).toBe('2')
  })
})

describe('findPreviousEpisode', () => {
  it('returns the previous episode within the same season', () => {
    const rows = [
      row({ video_id: '1', season_number: 1, episode_number: 2 }),
      row({ video_id: '2', season_number: 1, episode_number: 3 }),
    ]
    expect(findPreviousEpisode(rows, rows[1])?.video_id).toBe('1')
  })

  it('crosses back into the previous season when at the first episode of a season', () => {
    const rows = [
      row({ video_id: '1', season_number: 1, episode_number: 17 }),
      row({ video_id: '2', season_number: 2, episode_number: 1 }),
    ]
    expect(findPreviousEpisode(rows, rows[1])?.video_id).toBe('1')
  })

  it('returns null for the first episode of the first season', () => {
    const rows = [
      row({ video_id: '1', season_number: 1, episode_number: 1 }),
      row({ video_id: '2', season_number: 1, episode_number: 2 }),
    ]
    expect(findPreviousEpisode(rows, rows[0])).toBeNull()
  })

  it('returns null for a movie row (never episodic)', () => {
    const movieRow = row({ video_id: '1', type: 'movie', season_number: null, episode_number: null })
    expect(findPreviousEpisode([movieRow], movieRow)).toBeNull()
  })
})
