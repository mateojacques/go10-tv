import { describe, expect, it } from 'vitest'
import { imageSrc } from './imageSrc'

describe('imageSrc', () => {
  it('roots a relative catalog path', () => {
    expect(imageSrc('catalogo_files/a.webp')).toBe('/catalogo_files/a.webp')
  })

  it('passes absolute URLs through', () => {
    expect(imageSrc('https://image.tmdb.org/t/p/w780/x.jpg')).toBe('https://image.tmdb.org/t/p/w780/x.jpg')
    expect(imageSrc('http://example.com/x.jpg')).toBe('http://example.com/x.jpg')
  })

  it('roots a relative path at another site when given a base URL', () => {
    expect(imageSrc('catalogo_files/a.webp', 'https://tv.go10.blog/')).toBe('https://tv.go10.blog/catalogo_files/a.webp')
    expect(imageSrc('https://image.tmdb.org/t/p/w780/x.jpg', 'https://tv.go10.blog/')).toBe('https://image.tmdb.org/t/p/w780/x.jpg')
  })
})
