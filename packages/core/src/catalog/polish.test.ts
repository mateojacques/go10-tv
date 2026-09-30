import { describe, it, expect } from 'vitest'
import { franchiseKeys, polishScore } from './polish'
import type { Title } from '../types'

function title(key: string, overrides: Partial<Title> = {}): Title {
  return {
    key, kind: 'movie', title: key, year: 2010, studio: '', source: '', genre: 'Acción', genre_secondary: '',
    quality: '1080p', language: 'Español', subtitled: false, thumbnail: `catalogo_files/${key}.webp`, views: 0,
    durationSeconds: 5400, catalogIndex: 0, seasons: [], ...overrides,
  }
}

describe('polishScore', () => {
  it('prefers sharper video', () => {
    expect(polishScore(title('a', { quality: '4K' }))).toBeGreaterThan(polishScore(title('b', { quality: '480p' })))
  })

  it('prefers Latino audio over subtitles', () => {
    expect(polishScore(title('a', { language: 'Español Latino' }))).toBeGreaterThan(
      polishScore(title('b', { subtitled: true })),
    )
  })

  it('prefers titles with hero art and hi-res thumbnails', () => {
    const base = polishScore(title('a'))
    expect(polishScore(title('a'), { a: { tmdb: 'movie/1', backdrop: '/a.jpg' } })).toBeGreaterThan(base)
    expect(polishScore(title('a', { thumbnail: 'assets/a/1.jpg' }))).toBeGreaterThan(base)
  })

  it('prefers features over shorts', () => {
    expect(polishScore(title('a'))).toBeGreaterThan(polishScore(title('b', { durationSeconds: 600 })))
  })
})

describe('franchiseKeys', () => {
  const keys = (...names: string[]) => [...franchiseKeys(names.map((n, i) => title(`k${i}`, { title: n }))).values()]

  it('folds subtitles, sequels and spin-offs into the shortest base', () => {
    expect(new Set(keys('Tom y Jerry', 'Tom y Jerry: La película', 'Tom y Jerry y Robin Hood', 'Tom y Jerry (Redoblaje)')).size).toBe(1)
    expect(new Set(keys('Dragon Ball', 'Dragon Ball Z: La batalla', 'Dragon Ball Super: Broly')).size).toBe(1)
    expect(new Set(keys('Peter Pan', 'Peter Pan 2')).size).toBe(1)
  })

  it('keeps unrelated titles apart', () => {
    expect(new Set(keys('Up', 'Up en el aire', 'Batman', 'Bambi')).size).toBe(4)
  })
})
