import { describe, it, expect } from 'vitest'
import { buildEmbedSrc } from './embedSrc'

describe('buildEmbedSrc', () => {
  it('appends autoplay when there is no resume point', () => {
    expect(buildEmbedSrc('https://ok.ru/videoembed/1', null)).toBe(
      'https://ok.ru/videoembed/1?autoplay=1',
    )
  })

  it('appends fromTime when a positive resume point is given', () => {
    expect(buildEmbedSrc('https://ok.ru/videoembed/1', 42)).toBe(
      'https://ok.ru/videoembed/1?autoplay=1&fromTime=42',
    )
  })

  it('omits fromTime when the resume point is 0', () => {
    expect(buildEmbedSrc('https://ok.ru/videoembed/1', 0)).toBe(
      'https://ok.ru/videoembed/1?autoplay=1',
    )
  })

  it('uses & when the embed URL already has a query string', () => {
    expect(buildEmbedSrc('https://ok.ru/videoembed/1?foo=bar', 42)).toBe(
      'https://ok.ru/videoembed/1?foo=bar&autoplay=1&fromTime=42',
    )
  })
})
