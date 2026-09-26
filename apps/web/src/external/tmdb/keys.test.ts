import { describe, expect, it } from 'vitest'
import { isTmdbKey, parseTmdbKey, tmdbEpisodeVideoId, tmdbTitleKey } from './keys'

describe('tmdb keys', () => {
  it('builds title keys and episode video ids', () => {
    expect(tmdbTitleKey('movie', 155)).toBe('tmdb-movie-155')
    expect(tmdbTitleKey('tv', 1396)).toBe('tmdb-tv-1396')
    expect(tmdbEpisodeVideoId(1396, 1, 3)).toBe('tmdb-tv-1396-s1e3')
  })

  it('parses title keys and episode ids', () => {
    expect(parseTmdbKey('tmdb-movie-155')).toEqual({ media: 'movie', id: 155 })
    expect(parseTmdbKey('tmdb-tv-1396')).toEqual({ media: 'tv', id: 1396 })
    expect(parseTmdbKey('tmdb-tv-1396-s1e3')).toEqual({ media: 'tv', id: 1396 })
  })

  it('rejects anything else', () => {
    expect(parseTmdbKey('hora-de-aventura')).toBeNull()
    expect(parseTmdbKey('tmdb-person-3')).toBeNull()
    expect(parseTmdbKey('tmdb-movie-abc')).toBeNull()
    expect(isTmdbKey('tmdb-movie-1')).toBe(true)
    expect(isTmdbKey('111')).toBe(false)
  })
})
