import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseRoute, routeToPath } from './route'
import { enableExternalTitles } from '../external/testing'

afterEach(() => vi.unstubAllEnvs())

describe('catalog-only search', () => {
  it('parses solo=catalogo while external titles are on', () => {
    enableExternalTitles()
    expect(parseRoute('/buscar', '?q=batman&solo=catalogo')).toEqual({
      name: 'catalog', section: 'all', query: 'batman', catalogOnly: true,
    })
  })

  it('writes it back after the section scope', () => {
    expect(routeToPath({ name: 'catalog', section: 'movie', query: 'batman', catalogOnly: true })).toBe(
      '/buscar?q=batman&en=peliculas&solo=catalogo',
    )
  })

  it('drops it with a blank query', () => {
    enableExternalTitles()
    expect(parseRoute('/buscar', '?q=&solo=catalogo')).toEqual({ name: 'home' })
  })

  it('ignores it while external titles are off', () => {
    expect(parseRoute('/buscar', '?q=batman&solo=catalogo')).toEqual({ name: 'catalog', section: 'all', query: 'batman' })
  })
})
