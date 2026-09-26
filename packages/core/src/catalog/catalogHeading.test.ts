import { describe, expect, it } from 'vitest'
import { catalogHeading } from './catalogHeading'

describe('catalogHeading', () => {
  it('names the section when browsing', () => {
    expect(catalogHeading('browse', 'movie', '')).toBe('Películas')
    expect(catalogHeading('browse', 'show', '')).toBe('Series')
    expect(catalogHeading('browse', 'all', '')).toBe('Catálogo')
  })

  it('quotes the trimmed query for results and for suggestions', () => {
    expect(catalogHeading('results', 'all', ' dragon ')).toBe('Resultados para "dragon"')
    expect(catalogHeading('searching', 'all', 'dragon')).toBe('Resultados para "dragon"')
    expect(catalogHeading('suggestions', 'movie', 'zzz')).toBe('Sin resultados para "zzz"')
  })
})
