import { describe, expect, it } from 'vitest'
import { artBase, artSrc } from './art'

describe('artSrc', () => {
  it('serves catalog art from the site root by default', () => {
    expect(artBase({})).toBe('/')
    expect(artSrc('assets/alf/1.jpg', '/')).toBe('/assets/alf/1.jpg')
  })

  it('serves it from VITE_IMAGE_BASE when set (the Tizen build)', () => {
    const base = artBase({ VITE_IMAGE_BASE: 'https://tv.go10.blog/' })
    expect(artSrc('assets/alf/1.jpg', base)).toBe('https://tv.go10.blog/assets/alf/1.jpg')
  })

  it('leaves absolute URLs (TMDB art) alone', () => {
    expect(artSrc('https://image.tmdb.org/t/p/w1280/x.jpg', 'https://tv.go10.blog/')).toBe('https://image.tmdb.org/t/p/w1280/x.jpg')
  })
})
