import { describe, it, expect } from 'vitest'
import { buildRows, ROW_LIMIT } from './buildRows'
import type { Title } from '../types'

function title(overrides: Partial<Title> & { key: string }): Title {
  return {
    kind: 'movie',
    title: overrides.key,
    year: 2010,
    studio: '',
    genre: 'Acción',
    genre_secondary: '',
    quality: '1080p',
    language: 'Español',
    subtitled: false,
    thumbnail: 'catalogo_files/a.webp',
    views: 100,
    durationSeconds: 3600,
    catalogIndex: 0,
    seasons: [],
    ...overrides,
  }
}

const TITLES: Title[] = [
  title({ key: 'show-1', kind: 'show', catalogIndex: 0 }),
  title({ key: 'm1', quality: '4K', views: 900, catalogIndex: 1, studio: 'Disney' }),
  title({ key: 'm2', quality: '4K', views: 500, catalogIndex: 2, studio: 'Disney' }),
  title({ key: 'm3', year: 1995, views: 50, catalogIndex: 3 }),
]

describe('buildRows', () => {
  it('leads with Recién añadidos in catalog order', () => {
    const rows = buildRows(TITLES)
    expect(rows[0].id).toBe('recientes')
    expect(rows[0].label).toBe('Recién añadidos')
    expect(rows[0].titles.map((t) => t.key)).toEqual(['show-1', 'm1', 'm2', 'm3'])
  })

  it('builds a Series row containing only shows', () => {
    const series = buildRows(TITLES).find((r) => r.id === 'series')!
    expect(series.titles.map((t) => t.key)).toEqual(['show-1'])
  })

  it('builds a 4K row', () => {
    const uhd = buildRows(TITLES).find((r) => r.id === '4k')!
    expect(uhd.titles.map((t) => t.key)).toEqual(['m1', 'm2'])
  })

  it('sorts Más vistos by views descending', () => {
    const popular = buildRows(TITLES).find((r) => r.id === 'populares')!
    expect(popular.titles.map((t) => t.key)).toEqual(['m1', 'm2', 'show-1', 'm3'])
  })

  it('builds a studio row', () => {
    const disney = buildRows(TITLES).find((r) => r.id === 'studio-disney')!
    expect(disney.titles.map((t) => t.key)).toEqual(['m1', 'm2'])
  })

  it('builds a decade row', () => {
    const nineties = buildRows(TITLES).find((r) => r.id === 'decada-1990')!
    expect(nineties.titles.map((t) => t.key)).toEqual(['m3'])
  })

  it('omits empty rows entirely', () => {
    const rows = buildRows(TITLES)
    expect(rows.every((r) => r.titles.length > 0)).toBe(true)
    expect(rows.find((r) => r.id === 'studio-pixar')).toBeUndefined()
  })

  it('caps every row at ROW_LIMIT', () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      title({ key: `x${i}`, catalogIndex: i }),
    )
    for (const row of buildRows(many)) {
      expect(row.titles.length).toBeLessThanOrEqual(ROW_LIMIT)
    }
  })

  it('builds a genre row once a genre clears the threshold, counting secondaries', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      title({ key: `t${i}`, genre: 'Drama', genre_secondary: 'Comedia', catalogIndex: i }),
    )
    const ids = buildRows(many).map((r) => r.id)
    expect(ids).toContain('genero-drama')
    // Comedia reaches 12 only by being counted as a secondary genre.
    expect(ids).toContain('genero-comedia')
  })

  it('does not build a genre row below the threshold', () => {
    const few = Array.from({ length: 11 }, (_, i) =>
      title({ key: `t${i}`, genre: 'Terror', genre_secondary: '', catalogIndex: i }),
    )
    expect(buildRows(few).map((r) => r.id)).not.toContain('genero-terror')
  })

  it('never emits duplicate row ids', () => {
    const ids = buildRows(TITLES).map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
