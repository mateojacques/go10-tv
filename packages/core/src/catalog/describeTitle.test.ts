import { describe, expect, it } from 'vitest'
import type { CatalogRow, Title } from '../types'
import { cardMeta, detailEyebrow, detailMeta, heroMeta, seasonCount, showExtent } from './describeTitle'

const row = (season: number | null, episode: number | null = null) =>
  ({ season_number: season, episode_number: episode, season_label: '' }) as CatalogRow

function title(overrides: Partial<Title>): Title {
  return {
    key: 'k', kind: 'movie', title: 'T', year: 2001, studio: '', source: '', genre: 'Animación', genre_secondary: '',
    quality: '1080p', language: 'Español', subtitled: false, thumbnail: '', views: 0, durationSeconds: 5400,
    catalogIndex: 0, seasons: [], ...overrides,
  }
}

describe('showExtent', () => {
  it('counts seasons when a show has several', () => {
    expect(showExtent(title({ kind: 'show', seasons: [row(1), row(2), row(3)] }))).toBe('3 temporadas')
  })

  it('counts episodes for a single season of episodes', () => {
    expect(showExtent(title({ kind: 'show', seasons: [row(1, 1), row(1, 2)] }))).toBe('2 episodios')
  })

  it('falls back to the runtime for a single one-file season', () => {
    expect(showExtent(title({ kind: 'show', seasons: [row(1)], durationSeconds: 14909 }))).toBe('4 h 8 min')
  })
})

describe('heroMeta', () => {
  it('lists runtime, year, quality and language for a movie', () => {
    expect(heroMeta(title({}))).toEqual(['1 h 30 min', '2001', '1080p', 'Español'])
  })

  it('uses the extent for a show, marks subtitles and skips blanks', () => {
    expect(heroMeta(title({ kind: 'show', seasons: [row(1), row(2)], year: null, quality: '', language: 'Japonés', subtitled: true })))
      .toEqual(['2 temporadas', 'Japonés (sub)'])
  })
})

describe('seasonCount', () => {
  it('counts distinct seasons, not rows', () => {
    expect(seasonCount(title({ seasons: [row(1, 1), row(1, 2), row(2, 1)] }))).toBe(2)
    expect(seasonCount(title({ seasons: [] }))).toBe(0)
  })
})

describe('cardMeta', () => {
  it('joins year and genre, skipping what is missing', () => {
    expect(cardMeta(title({}))).toBe('2001 · Animación')
    expect(cardMeta(title({ year: null }))).toBe('Animación')
    expect(cardMeta(title({ year: null, genre: '' }))).toBe('')
  })
})

describe('detailEyebrow', () => {
  it('says what it is, how many seasons, and the studio', () => {
    expect(detailEyebrow(title({ kind: 'show', studio: 'Toei', seasons: [row(1), row(2)] }))).toBe('Serie · 2 temporadas · Toei')
    expect(detailEyebrow(title({ kind: 'show', seasons: [row(1, 1), row(1, 2)] }))).toBe('Serie · 1 temporada')
    expect(detailEyebrow(title({}))).toBe('Película')
  })
})

describe('detailMeta', () => {
  it('lists year, quality, language, the row runtime and views', () => {
    const r = { year: 1999, duration_seconds: 1440 } as CatalogRow
    expect(detailMeta(title({ views: 12345, subtitled: true, language: 'Japonés' }), r))
      .toEqual(['1999', '1080p', 'Japonés (sub)', '24 min', '12.345 vistas'])
  })

  it('falls back to the title year and hides views for external titles', () => {
    const r = { year: null, duration_seconds: 0 } as CatalogRow
    expect(detailMeta(title({ external: true }), r)).toEqual(['2001', '1080p', 'Español'])
  })
})
