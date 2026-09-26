import { describe, it, expect } from 'vitest'
import type { CatalogRow, Title } from '../types'
import type { Progress } from './progressStore'
import { titleProgress, continueWatching, playedFraction } from './titleProgress'
import { rowKey } from '../catalog/rowKey'

function row(video_id: string, episode_number: number | null = null): CatalogRow {
  return {
    catalog_index: 0, video_id, type: episode_number ? 'episode' : 'movie', title: 'T', title_raw: 'T',
    series_id: '', series_title: '', season_number: episode_number ? 1 : null, season_label: '',
    episode_number, chapter_start_seconds: null, chapter_end_seconds: null, year: null, studio: '', source: '', genre: '', genre_secondary: '',
    quality: '', language: '', subtitled: false, duration_raw: '', duration_seconds: 700,
    views: 0, thumbnail: '', video_url: '', embed_url: '',
  }
}

function title(key: string, rows: CatalogRow[]): Title {
  return {
    key, kind: rows.length > 1 ? 'show' : 'movie', title: key, year: null, studio: '', source: '', genre: '',
    genre_secondary: '', quality: '', language: '', subtitled: false, thumbnail: '', views: 0,
    durationSeconds: 700, catalogIndex: 0, seasons: rows,
  }
}

const p = (time: number, updatedAt: number, watched = false): Progress => ({
  time, duration: 700, updatedAt, watched,
})

const show = title('show', [row('e1', 1), row('e2', 2), row('e3', 3)])

describe('titleProgress', () => {
  it('starts at the first item when nothing has been played', () => {
    expect(titleProgress(show, {})).toMatchObject({ mode: 'start', updatedAt: 0, row: { video_id: 'e1' } })
  })

  it('resumes the most recently played item that is not finished', () => {
    const result = titleProgress(show, { e1: p(700, 1, true), e2: p(300, 2) })
    expect(result).toMatchObject({ mode: 'resume', updatedAt: 2, row: { video_id: 'e2' } })
    expect(result.progress?.time).toBe(300)
  })

  it('goes by recency, not order — a rewatched earlier episode wins', () => {
    const result = titleProgress(show, { e2: p(700, 1, true), e1: p(200, 5) })
    expect(result).toMatchObject({ mode: 'resume', row: { video_id: 'e1' } })
  })

  it('moves to the next item once the latest one is finished', () => {
    expect(titleProgress(show, { e1: p(700, 1, true) })).toMatchObject({ mode: 'next', row: { video_id: 'e2' } })
  })

  it('resumes the next item if it was already partly watched', () => {
    const result = titleProgress(show, { e2: p(100, 1), e1: p(700, 2, true) })
    expect(result).toMatchObject({ mode: 'resume', row: { video_id: 'e2' } })
  })

  it('falls back to the start after the final item is finished', () => {
    expect(titleProgress(show, { e3: p(700, 3, true) })).toMatchObject({ mode: 'start', row: { video_id: 'e1' } })
  })
})

function chapterRow(video_id: string, episode_number: number): CatalogRow {
  return { ...row(video_id, episode_number), chapter_start_seconds: 0 }
}

describe('titleProgress with chaptered episodes', () => {
  it('tracks two chapters of the same video_id independently', () => {
    const chaptered = title('chaptered', [chapterRow('9', 1), chapterRow('9', 2)])
    const key1 = rowKey(chaptered.seasons[0])
    const key2 = rowKey(chaptered.seasons[1])
    const result = titleProgress(chaptered, { [key1]: p(1435, 1, true), [key2]: p(300, 2) })
    expect(result).toMatchObject({ mode: 'resume', row: { episode_number: 2 } })
    expect(result.progress?.time).toBe(300)
  })
})

describe('continueWatching', () => {
  it('lists titles with something to continue, most recent first', () => {
    const movie = title('movie', [row('m1')])
    const done = title('done', [row('d1')])
    const items = continueWatching([show, movie, done], {
      e1: p(100, 1),
      m1: p(100, 3),
      d1: p(700, 5, true),
    })
    expect(items.map((item) => item.title.key)).toEqual(['movie', 'show'])
  })
})

describe('playedFraction', () => {
  it('is the played share, full for watched, 0 for nothing', () => {
    expect(playedFraction(p(350, 0))).toBe(0.5)
    expect(playedFraction(p(10, 0, true))).toBe(1)
    expect(playedFraction(null)).toBe(0)
  })
})
