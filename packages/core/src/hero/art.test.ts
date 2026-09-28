import { describe, it, expect } from 'vitest'
import { LOCAL_ART, parseHeroArt, resolveArt } from './art'

const SPIDEY = 'spidey-y-sus-sorprendentes-amigos'

describe('parseHeroArt', () => {
  it('reads a schema-1 sidecar', () => {
    const json = JSON.stringify({ schema_version: 1, items: { a: { tmdb: 'movie/1', backdrop: '/a.jpg' } } })
    expect(parseHeroArt(json)).toEqual({ a: { tmdb: 'movie/1', backdrop: '/a.jpg' } })
  })

  it('drops entries without a usable backdrop', () => {
    const json = JSON.stringify({ schema_version: 1, items: { a: { tmdb: 'movie/1', backdrop: '' }, b: { tmdb: 'tv/2' }, c: null, d: { tmdb: 'tv/3', backdrop: '/d.jpg' } } })
    expect(parseHeroArt(json)).toEqual({ d: { tmdb: 'tv/3', backdrop: '/d.jpg' } })
  })

  it('is null for anything that is not the sidecar', () => {
    expect(parseHeroArt('<!doctype html><html></html>')).toBeNull()
    expect(parseHeroArt('')).toBeNull()
    expect(parseHeroArt('[]')).toBeNull()
    expect(parseHeroArt(JSON.stringify({ schema_version: 2, items: {} }))).toBeNull()
    expect(parseHeroArt(JSON.stringify({ schema_version: 1, items: [] }))).toBeNull()
  })
})

describe('resolveArt', () => {
  const index = { a: { tmdb: 'movie/1', backdrop: '/a.jpg' }, [SPIDEY]: { tmdb: 'tv/9', backdrop: '/s.jpg' } }

  it('prefers local key art over TMDB', () => {
    expect(resolveArt(SPIDEY, index)).toBe(LOCAL_ART[SPIDEY])
    expect(LOCAL_ART[SPIDEY].large).toBe('assets/spidey/spidey-hero-1920.webp')
  })

  it('builds TMDB w780 / w1280 URLs', () => {
    expect(resolveArt('a', index)).toEqual({
      small: 'https://image.tmdb.org/t/p/w780/a.jpg',
      large: 'https://image.tmdb.org/t/p/w1280/a.jpg',
    })
  })

  it('is null without art', () => {
    expect(resolveArt('nope', index)).toBeNull()
  })
})
