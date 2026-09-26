import { describe, it, expect } from 'vitest'
import { parseRoute, routeToPath } from './route'

describe('parseRoute', () => {
  it('parses the root path as home', () => {
    expect(parseRoute('/')).toEqual({ name: 'home' })
  })

  it('parses an empty path as home', () => {
    expect(parseRoute('')).toEqual({ name: 'home' })
  })

  it('parses a title path', () => {
    expect(parseRoute('/title/hora-de-aventura')).toEqual({ name: 'title', key: 'hora-de-aventura' })
  })

  it('parses a play path', () => {
    expect(parseRoute('/title/hora-de-aventura/play/222')).toEqual({
      name: 'play',
      key: 'hora-de-aventura',
      videoId: '222',
    })
  })

  it('decodes URL-encoded segments', () => {
    expect(parseRoute('/title/crows%20zero')).toEqual({ name: 'title', key: 'crows zero' })
  })

  it('falls back to home for an unrecognised path', () => {
    expect(parseRoute('/something/unexpected')).toEqual({ name: 'home' })
  })

  it('falls back to home for a malformed play path', () => {
    expect(parseRoute('/title/x/play')).toEqual({ name: 'home' })
  })
})

describe('routeToPath', () => {
  it('serialises home', () => {
    expect(routeToPath({ name: 'home' })).toBe('/')
  })

  it('serialises a title route', () => {
    expect(routeToPath({ name: 'title', key: 'hora-de-aventura' })).toBe('/title/hora-de-aventura')
  })

  it('serialises a play route', () => {
    expect(routeToPath({ name: 'play', key: 'hora-de-aventura', videoId: '222' })).toBe(
      '/title/hora-de-aventura/play/222',
    )
  })

  it('encodes special characters in segments', () => {
    expect(routeToPath({ name: 'title', key: 'crows zero' })).toBe('/title/crows%20zero')
  })
})

describe('catalog routes', () => {
  it('parses the section browse paths', () => {
    expect(parseRoute('/peliculas')).toEqual({ name: 'catalog', section: 'movie', query: '' })
    expect(parseRoute('/series')).toEqual({ name: 'catalog', section: 'show', query: '' })
  })

  it('parses a search, with and without a section', () => {
    expect(parseRoute('/buscar', '?q=spidy')).toEqual({ name: 'catalog', section: 'all', query: 'spidy' })
    expect(parseRoute('/buscar', '?q=spidy&en=peliculas')).toEqual({ name: 'catalog', section: 'movie', query: 'spidy' })
    expect(parseRoute('/buscar', '?q=spidy&en=series')).toEqual({ name: 'catalog', section: 'show', query: 'spidy' })
  })

  it('decodes + and percent-encoded accents in the query', () => {
    expect(parseRoute('/buscar', '?q=pel%C3%ADcula+de&en=peliculas')).toEqual({
      name: 'catalog', section: 'movie', query: 'película de',
    })
  })

  it('collapses an empty search to the section browse route', () => {
    expect(parseRoute('/buscar', '?q=&en=series')).toEqual({ name: 'catalog', section: 'show', query: '' })
    expect(parseRoute('/buscar', '?q=%20%20')).toEqual({ name: 'home' })
    expect(parseRoute('/buscar')).toEqual({ name: 'home' })
  })

  it('ignores an unknown section', () => {
    expect(parseRoute('/buscar', '?q=x&en=docs')).toEqual({ name: 'catalog', section: 'all', query: 'x' })
  })

  it('round-trips every catalog route', () => {
    const routes = [
      { name: 'catalog', section: 'movie', query: '' },
      { name: 'catalog', section: 'show', query: '' },
      { name: 'catalog', section: 'all', query: 'película & co' },
      { name: 'catalog', section: 'movie', query: 'toy story' },
    ] as const
    for (const route of routes) {
      const url = new URL(routeToPath(route), 'http://x')
      expect(parseRoute(url.pathname, url.search)).toEqual(route)
    }
  })

  it('prints an empty "all" catalog as home', () => {
    expect(routeToPath({ name: 'catalog', section: 'all', query: '' })).toBe('/')
  })
})

describe('collection routes', () => {
  it('parses a collection path', () => {
    expect(parseRoute('/coleccion/cartoon-network')).toEqual({ name: 'collection', id: 'cartoon-network' })
  })

  it('decodes an encoded collection id', () => {
    expect(parseRoute('/coleccion/cartoon%2Dnetwork')).toEqual({ name: 'collection', id: 'cartoon-network' })
  })

  it('falls back to home for a collection path without an id', () => {
    expect(parseRoute('/coleccion')).toEqual({ name: 'home' })
  })

  it('round-trips a collection route', () => {
    const route = { name: 'collection', id: 'cartoon-network' } as const
    expect(routeToPath(route)).toBe('/coleccion/cartoon-network')
    expect(parseRoute(routeToPath(route))).toEqual(route)
  })
})
