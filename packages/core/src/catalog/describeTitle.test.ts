import { describe, expect, it } from 'vitest'
import type { CatalogRow, Title } from '../types'
import { cardMeta, heroMeta, seasonCount, showExtent } from './describeTitle'

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
