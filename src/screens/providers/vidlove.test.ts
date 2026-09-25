import { describe, expect, it } from 'vitest'
import { vidlove } from './vidlove'
import type { CatalogRow } from '../../types'

const episode = {
  video_id: 'tmdb-tv-1396-s1e2', type: 'episode', season_number: 1, episode_number: 2,
  embed_url: 'https://player.vidlove.cc/embed/tv/1396/1/2',
} as CatalogRow
const movie = { video_id: 'tmdb-movie-155', type: 'movie', season_number: null, episode_number: null, embed_url: 'https://player.vidlove.cc/embed/movie/155' } as CatalogRow
const event = (name: string, extra: Record<string, unknown> = {}) => ({
  type: 'PLAYER_EVENT', data: { event: name, tmdbId: 1396, mediaType: 'tv', season: 1, episode: 2, ...extra },
})

describe('vidlove provider', () => {
  it('adds our options to the embed and never uses a start time', () => {
    const src = new URL(vidlove.src(episode, 600))
    expect(src.origin + src.pathname).toBe('https://player.vidlove.cc/embed/tv/1396/1/2')
    expect(Object.fromEntries(src.searchParams)).toEqual({
      autoplay: 'true', primarycolor: 'c6f24e', secondarycolor: '08090c', iconcolor: 'f2f4f0',
      autonext: 'false', episodelist: 'false', showNextEpisode: 'false',
    })
  })

  it('parses time, pause and ended', () => {
    expect(vidlove.parse(event('timeupdate', { currentTime: 12.5, duration: 2800 }), episode)).toEqual({ kind: 'time', time: 12.5, duration: 2800 })
    expect(vidlove.parse(event('pause'), episode)).toEqual({ kind: 'paused' })
    expect(vidlove.parse(event('ended', { currentTime: 2800 }), episode)).toEqual({ kind: 'ended', time: 2800 })
  })

  it('ignores other messages and other titles or episodes', () => {
    expect(vidlove.parse({ event: 'timeupdate', time: 1 }, episode)).toBeNull()
    expect(vidlove.parse(event('fullscreen-enter'), episode)).toBeNull()
    expect(vidlove.parse(event('timeupdate', { currentTime: 1, tmdbId: 99 }), episode)).toBeNull()
    expect(vidlove.parse(event('timeupdate', { currentTime: 1, episode: 1 }), episode)).toBeNull()
    expect(vidlove.parse(event('timeupdate', { currentTime: 1, season: 2 }), episode)).toBeNull()
  })

  it('does not check seasons for a movie', () => {
    expect(vidlove.parse(event('timeupdate', { currentTime: 1, tmdbId: 155, mediaType: 'movie', season: undefined, episode: undefined }), movie))
      .toEqual({ kind: 'time', time: 1, duration: 0 })
  })

  it('seeks with its own command shape', () => {
    expect(vidlove.seekMessage(597)).toEqual({ type: 'seek', time: 597 })
    expect(vidlove.resumesViaUrl).toBe(false)
  })
})
