import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseRoute, routeToPath } from './route'
import { enableExternalTitles } from '../external/testing'

afterEach(() => vi.unstubAllEnvs())

describe('search source', () => {
  it('parses solo=catalogo and solo=original while external titles are on', () => {
    enableExternalTitles()
    expect(parseRoute('/buscar', '?q=batman&solo=catalogo')).toEqual({
      name: 'catalog', section: 'all', query: 'batman', source: 'catalog',
    })
    expect(parseRoute('/buscar', '?q=batman&solo=original')).toEqual({
      name: 'catalog', section: 'all', query: 'batman', source: 'tmdb',
    })
  })

  it('writes it back after the section scope', () => {
    expect(routeToPath({ name: 'catalog', section: 'movie', query: 'batman', source: 'catalog' })).toBe(
      '/buscar?q=batman&en=peliculas&solo=catalogo',
    )
    expect(routeToPath({ name: 'catalog', section: 'all', query: 'batman', source: 'tmdb' })).toBe('/buscar?q=batman&solo=original')
  })

  it('drops it with a blank query', () => {
    enableExternalTitles()
    expect(parseRoute('/buscar', '?q=&solo=catalogo')).toEqual({ name: 'home' })
  })

  it('ignores it while external titles are off', () => {
    expect(parseRoute('/buscar', '?q=batman&solo=catalogo')).toEqual({ name: 'catalog', section: 'all', query: 'batman' })
    expect(parseRoute('/buscar', '?q=batman&solo=original')).toEqual({ name: 'catalog', section: 'all', query: 'batman' })
  })
})
