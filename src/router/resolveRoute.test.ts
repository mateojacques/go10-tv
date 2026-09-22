import { describe, it, expect } from 'vitest'
import { resolveRoute } from './resolveRoute'
import type { CatalogRow, Title } from '../types'

function row(overrides: Partial<CatalogRow>): CatalogRow {
  return {
    catalog_index: 0, video_id: '1', type: 'movie', title: 'X', title_raw: '',
    series_id: '', series_title: '', season_number: null, season_label: '',
    episode_number: null, chapter_start_seconds: null, chapter_end_seconds: null, year: null, studio: '', genre: '', genre_secondary: '',
    quality: '', language: '', subtitled: false, duration_raw: '', duration_seconds: 0,
    views: 0, thumbnail: '', video_url: '', embed_url: '',
    ...overrides,
  }
}

function title(overrides: Partial<Title> & { seasons?: CatalogRow[] }): Title {
  const seasons = overrides.seasons ?? [row({})]
  return {
    key: 'x', kind: 'movie', title: 'X', year: null, studio: '', genre: '',
    genre_secondary: '', quality: '', language: '', subtitled: false, thumbnail: '',
    views: 0, durationSeconds: 0, catalogIndex: 0,
    ...overrides,
    seasons,
  }
}

describe('resolveRoute', () => {
  it('resolves the home route without needing titles', () => {
    expect(resolveRoute({ name: 'home' }, [])).toEqual({ name: 'home' })
  })

  it('resolves a title route to its matching Title', () => {
    const t = title({ key: 'abc' })
    expect(resolveRoute({ name: 'title', key: 'abc' }, [t])).toEqual({ name: 'detail', title: t })
  })

  it('resolves a play route to its matching Title and CatalogRow', () => {
    const r = row({ video_id: '9' })
    const t = title({ key: 'abc', seasons: [r] })
    expect(resolveRoute({ name: 'play', key: 'abc', videoId: '9' }, [t])).toEqual({
      name: 'player',
      title: t,
      row: r,
    })
  })

  it('returns not-found when the title key does not match any loaded title', () => {
    expect(resolveRoute({ name: 'title', key: 'missing' }, [title({ key: 'abc' })])).toEqual({
      name: 'not-found',
    })
  })

  it('returns not-found when the video id does not match any row on the title', () => {
    const t = title({ key: 'abc', seasons: [row({ video_id: '9' })] })
    expect(resolveRoute({ name: 'play', key: 'abc', videoId: 'missing' }, [t])).toEqual({
      name: 'not-found',
    })
  })
})
