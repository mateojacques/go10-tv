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

describe('pickHero', () => {
  it('picks one title per bucket, without duplicates', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const slides = pickHero(CATALOG, {}, seeded(seed))
      const keys = slides.map((s) => s.title.key)
      expect(new Set(keys).size).toBe(keys.length)
      expect(slides).toHaveLength(HERO_BUCKETS.length)
    }
  })

  it('counts the secondary genre', () => {
    const slides = pickHero([title('x', 'Comedia', 'Terror')], {}, seeded(1))
    expect(slides.map((s) => s.title.key)).toEqual(['x'])
  })

  it('prefers titles with art in every bucket', () => {
    const index = art('ani2', 'dra2', 'anm1')
    for (let seed = 1; seed <= 50; seed++) {
      const keys = pickHero(CATALOG, index, seeded(seed)).map((s) => s.title.key)
      expect(keys).toEqual(expect.arrayContaining(['ani2', 'dra2', 'anm1']))
      expect(keys).not.toContain('ani1')
      expect(keys).not.toContain('anm2')
    }
  })

  it('falls back to a title without art when a bucket has none, with art null', () => {
    const slide = pickHero(CATALOG, {}, seeded(3)).find((s) => s.title.key === 'ter1')
    expect(slide).toEqual({ title: expect.objectContaining({ key: 'ter1' }), art: null })
  })

  it('carries the resolved art', () => {
    const slide = pickHero([title('ter1', 'Terror')], art('ter1'), seeded(1))[0]
    expect(slide.art).toEqual({ small: 'https://image.tmdb.org/t/p/w780/ter1.jpg', large: 'https://image.tmdb.org/t/p/w1280/ter1.jpg' })
  })

  it('skips empty buckets and never picks external titles', () => {
    const slides = pickHero([title('d', 'Drama'), title('ext', 'Terror', '', { external: true })], {}, seeded(1))
    expect(slides.map((s) => s.title.key)).toEqual(['d'])
  })

  it('shuffles the bucket order', () => {
    const orders = new Set(Array.from({ length: 30 }, (_, i) => pickHero(CATALOG, {}, seeded(i + 1)).map((s) => s.title.genre + s.title.genre_secondary).join('|')))
    expect(orders.size).toBeGreaterThan(1)
  })

  it('falls back to the first title when nothing matches a bucket', () => {
    expect(pickHero([title('a', 'Comedia'), title('b', '')], {}, seeded(1)).map((s) => s.title.key)).toEqual(['a'])
  })

  it('is empty for an empty catalog', () => {
    expect(pickHero([], {})).toEqual([])
  })
})

describe('pickHeroOnce', () => {
  beforeEach(() => resetHeroPickForTests())

  it('keeps the first pick for the process', () => {
    const first = pickHeroOnce(CATALOG, {})
    expect(pickHeroOnce([title('other', 'Drama')], art('other'))).toBe(first)
  })

  it('does not lock in an empty catalog', () => {
    expect(pickHeroOnce([], {})).toEqual([])
    expect(pickHeroOnce([title('d', 'Drama')], {}).map((s) => s.title.key)).toEqual(['d'])
  })
})
