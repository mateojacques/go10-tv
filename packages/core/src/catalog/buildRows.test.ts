import { describe, it, expect } from 'vitest'
import { buildRows, ROW_LIMIT } from './buildRows'
import type { Title } from '../types'

function title(overrides: Partial<Title> & { key: string }): Title {
  return {
    kind: 'movie',
    title: overrides.key,
    year: 2010,
    studio: '', source: '',
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

const SEED = { seed: 1 }

function show(key: string, episodes: number, overrides: Partial<Title> = {}): Title {
  const seasons = Array.from({ length: episodes }, (_, i) => ({
    catalog_index: i, video_id: `${key}-${i}`, type: 'episode', title: `${key} ${i}`, title_raw: '',
    series_id: key, series_title: key, season_number: 1, season_label: '', episode_number: i + 1,
    chapter_start_seconds: null, chapter_end_seconds: null, year: 2010, studio: '', source: '',
    genre: 'Acción', genre_secondary: '', quality: '1080p', language: 'Español', subtitled: false,
    duration_raw: '', duration_seconds: 1320, views: 10, thumbnail: '', video_url: '', embed_url: '',
  }) as Title['seasons'][number])
  return title({ key, kind: 'show', seasons, ...overrides })
}

describe('buildRows', () => {
  it('leads with Recién añadidos in catalog order', () => {
    const rows = buildRows(TITLES, SEED)
    expect(rows[0].id).toBe('recientes')
    expect(rows[0].label).toBe('Recién añadidos')
    expect(rows[0].titles.map((t) => t.key)).toEqual(['show-1', 'm1', 'm2', 'm3'])
  })

  it('builds a Series row containing only shows', () => {
    const series = buildRows(TITLES, SEED).find((r) => r.id === 'series')!
    expect(series.titles.map((t) => t.key)).toEqual(['show-1'])
  })

  it('builds a 4K row', () => {
    const uhd = buildRows(TITLES, SEED).find((r) => r.id === '4k')!
    expect(uhd.titles.map((t) => t.key).sort()).toEqual(['m1', 'm2'])
  })

  it('sorts Más vistos by views descending', () => {
    const popular = buildRows(TITLES, SEED).find((r) => r.id === 'populares')!
    expect(popular.titles.map((t) => t.key)).toEqual(['m1', 'm2', 'show-1', 'm3'])
  })

  it('builds studio and decade rows once they have enough titles', () => {
    const many = Array.from({ length: 4 }, (_, i) =>
      title({ key: `d${i}`, title: `Película ${'abcd'[i]}`, studio: 'Disney', year: 1995, catalogIndex: i }),
    )
    const ids = buildRows(many, SEED).map((r) => r.id)
    expect(ids).toContain('studio-disney')
    expect(ids).toContain('decada-1990')
  })

  it('leaves out category rows too short to read as a row', () => {
    const ids = buildRows(TITLES, SEED).map((r) => r.id)
    expect(ids).not.toContain('studio-disney')
    expect(ids).not.toContain('studio-pixar')
    expect(buildRows(TITLES, SEED).every((r) => r.titles.length > 0)).toBe(true)
  })

  it('caps every row at ROW_LIMIT', () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      title({ key: `x${i}`, catalogIndex: i }),
    )
    for (const row of buildRows(many, SEED)) {
      expect(row.titles.length).toBeLessThanOrEqual(ROW_LIMIT)
    }
  })

  it('builds a genre row once a genre clears the threshold, counting secondaries', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      title({ key: `t${i}`, genre: 'Drama', genre_secondary: 'Comedia', catalogIndex: i }),
    )
    const ids = buildRows(many, SEED).map((r) => r.id)
    expect(ids).toContain('genero-drama')
    // Comedia reaches 12 only by being counted as a secondary genre.
    expect(ids).toContain('genero-comedia')
  })

  it('does not build a genre row below the threshold', () => {
    const few = Array.from({ length: 11 }, (_, i) =>
      title({ key: `t${i}`, genre: 'Terror', genre_secondary: '', catalogIndex: i }),
    )
    expect(buildRows(few, SEED).map((r) => r.id)).not.toContain('genero-terror')
  })

  it('never emits duplicate row ids', () => {
    const ids = buildRows(TITLES, SEED).map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('shows one title per franchise in a row', () => {
    const tom = ['Tom y Jerry', 'Tom y Jerry: La película', 'Tom y Jerry y Robin Hood'].map((name, i) =>
      title({ key: `tom${i}`, title: name, catalogIndex: i }),
    )
    const rows = buildRows([...tom, title({ key: 'other', catalogIndex: 3 })], SEED)
    for (const row of rows) {
      expect(row.titles.filter((t) => t.key.startsWith('tom')).length).toBeLessThanOrEqual(1)
    }
    expect(rows[0].titles.map((t) => t.key)).toEqual(['tom0', 'other'])
  })

  it('ranks by polish: the long 4K series with art leads Destacados', () => {
    const titles = [
      title({ key: 'plain', quality: '480p', language: '', catalogIndex: 0 }),
      show('big', 60, { catalogIndex: 1 }),
      title({ key: 'mid', catalogIndex: 2 }),
    ]
    titles[1].seasons.forEach((s) => (s.quality = '4K'))
    const art = { big: { tmdb: 'tv/1', backdrop: '/big.jpg' } }
    const featured = buildRows(titles, { seed: 1, heroArt: art }).find((r) => r.id === 'destacados')!
    expect(featured.titles.map((t) => t.key)).toEqual(['big', 'mid', 'plain'])
  })

  it('spreads titles across rows instead of repeating the same leaders', () => {
    const titles = Array.from({ length: 30 }, (_, i) =>
      title({ key: `k${i}`, title: `Título ${i}`, genre: 'Drama', catalogIndex: i, year: 1995 }),
    )
    const rows = buildRows(titles, SEED).filter((r) => r.id !== 'recientes' && r.id !== 'populares')
    const leaders = rows.map((r) => r.titles[0].key)
    expect(new Set(leaders).size).toBe(leaders.length)
  })

  it('keeps hero titles out of the front of the rows', () => {
    const titles = Array.from({ length: 30 }, (_, i) => title({ key: `k${i}`, title: `Título ${i}`, catalogIndex: i }))
    const plain = buildRows(titles, SEED).find((r) => r.id === 'destacados')!.titles[0].key
    const withHero = buildRows(titles, { seed: 1, featured: [plain] }).find((r) => r.id === 'destacados')!
    expect(withHero.titles[0].key).not.toBe(plain)
  })

  it('is stable for a seed and varies between seeds', () => {
    const titles = Array.from({ length: 30 }, (_, i) => title({ key: `k${i}`, title: `Título ${i}`, catalogIndex: i }))
    const order = (seed: number) => buildRows(titles, { seed }).find((r) => r.id === 'destacados')!.titles.map((t) => t.key).join()
    expect(order(7)).toBe(order(7))
    expect(new Set([1, 2, 3, 4, 5].map(order)).size).toBeGreaterThan(1)
  })
})
