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
})
