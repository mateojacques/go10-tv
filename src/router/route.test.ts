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
