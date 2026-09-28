import { describe, it, expect, beforeEach } from 'vitest'
import type { Title } from '../types'
import { HERO_BUCKETS, pickHero, pickHeroOnce, resetHeroPickForTests } from './pickHero'

function title(key: string, genre: string, genre_secondary = '', extra: Partial<Title> = {}): Title {
  return {
    key, kind: 'movie', title: key, year: null, studio: '', source: '', genre, genre_secondary,
    quality: '', language: '', subtitled: false, thumbnail: `catalogo_files/${key}.webp`, views: 0,
    durationSeconds: 0, catalogIndex: 0, seasons: [], ...extra,
  }
}

/** mulberry32: a deterministic `random` for tests. */
function seeded(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const art = (...keys: string[]) => Object.fromEntries(keys.map((k) => [k, { tmdb: `movie/${k}`, backdrop: `/${k}.jpg` }]))

const CATALOG = [
  title('ani1', 'Animación'), title('ani2', 'Animación'),
  title('dra1', 'Drama'), title('dra2', 'Comedia', 'Drama'),
  title('ter1', 'Terror'),
  title('inf1', 'Animación', 'Infantil'), title('inf2', 'Comedia', 'Infantil'),
  title('anm1', 'Anime'), title('anm2', 'Anime'),
]

const ALL_ART = art(...CATALOG.map((t) => t.key))

describe('pickHero', () => {
  it('picks one title per bucket, without duplicates', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const slides = pickHero(CATALOG, ALL_ART, seeded(seed))
      const keys = slides.map((s) => s.title.key)
      expect(new Set(keys).size).toBe(keys.length)
      expect(slides).toHaveLength(HERO_BUCKETS.length)
    }
  })

  it('counts the secondary genre', () => {
    const slides = pickHero([title('x', 'Comedia', 'Terror')], art('x'), seeded(1))
    expect(slides.map((s) => s.title.key)).toEqual(['x'])
  })

  it('only features titles with art', () => {
    const index = art('ani2', 'dra2', 'anm1')
    for (let seed = 1; seed <= 50; seed++) {
      const slides = pickHero(CATALOG, index, seeded(seed))
      expect(slides.map((s) => s.title.key).sort()).toEqual(['ani2', 'anm1', 'dra2'])
      expect(slides.every((s) => s.art !== null)).toBe(true)
    }
  })

  it('leaves out a bucket with no art rather than feature a title without it', () => {
    const keys = pickHero(CATALOG, art('dra1'), seeded(3)).map((s) => s.title.key)
    expect(keys).toEqual(['dra1'])
  })

  it('counts local key art as art', () => {
    const spidey = title('spidey-y-sus-sorprendentes-amigos', 'Animación', 'Infantil')
    expect(pickHero([spidey], {}, seeded(1)).map((s) => s.art?.large)).toEqual(['assets/spidey/spidey-hero-1920.webp'])
  })

  it('carries the resolved art', () => {
    const slide = pickHero([title('ter1', 'Terror')], art('ter1'), seeded(1))[0]
    expect(slide.art).toEqual({ small: 'https://image.tmdb.org/t/p/w780/ter1.jpg', large: 'https://image.tmdb.org/t/p/w1280/ter1.jpg' })
  })

  it('skips empty buckets and never picks external titles', () => {
    const slides = pickHero([title('d', 'Drama'), title('ext', 'Terror', '', { external: true })], art('d', 'ext'), seeded(1))
    expect(slides.map((s) => s.title.key)).toEqual(['d'])
  })

  it('shuffles the bucket order', () => {
    const orders = new Set(Array.from({ length: 30 }, (_, i) => pickHero(CATALOG, ALL_ART, seeded(i + 1)).map((s) => s.title.genre + s.title.genre_secondary).join('|')))
    expect(orders.size).toBeGreaterThan(1)
  })

  it('is empty when no title has art, or none is in a bucket', () => {
    expect(pickHero(CATALOG, {}, seeded(1))).toEqual([])
    expect(pickHero([title('a', 'Comedia'), title('b', '')], art('a', 'b'), seeded(1))).toEqual([])
  })

  it('is empty for an empty catalog', () => {
    expect(pickHero([], {})).toEqual([])
  })
})

describe('pickHeroOnce', () => {
  beforeEach(() => resetHeroPickForTests())

  it('keeps the first pick for the process', () => {
    const first = pickHeroOnce(CATALOG, ALL_ART)
    expect(pickHeroOnce([title('other', 'Drama')], art('other'))).toBe(first)
  })

  it('does not lock in an empty pick, so art arriving later still gets a hero', () => {
    expect(pickHeroOnce([], {})).toEqual([])
    expect(pickHeroOnce([title('d', 'Drama')], {})).toEqual([])
    expect(pickHeroOnce([title('d', 'Drama')], art('d')).map((s) => s.title.key)).toEqual(['d'])
  })
})
