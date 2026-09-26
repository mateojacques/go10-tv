import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { Player } from './Player'
import type { CatalogRow } from '@go10/core/types'
import { writeProgress } from '@go10/core/progress/progressStore'

const VIDLOVE = 'https://player.vidlove.cc'

function row(overrides: Partial<CatalogRow> = {}): CatalogRow {
  return {
    catalog_index: 0, video_id: 'tmdb-tv-1396-s1e2', type: 'episode', title: 'Ep 2', title_raw: 'Ep 2',
    series_id: 'tmdb-tv-1396', series_title: 'Breaking Bad', season_number: 1, season_label: 'Temporada 1',
    episode_number: 2, chapter_start_seconds: null, chapter_end_seconds: null, year: 2008, studio: '', source: '',
    genre: '', genre_secondary: '', quality: '', language: 'Inglés', subtitled: true, duration_raw: '',
    duration_seconds: 2820, views: 0, thumbnail: '',
    video_url: 'https://player.vidlove.cc/embed/tv/1396/1/2',
    embed_url: 'https://player.vidlove.cc/embed/tv/1396/1/2',
    external: true,
    ...overrides,
  }
}

const frame = () => document.querySelector('.go-player_frame') as HTMLIFrameElement
const event = (name: string, extra: Record<string, unknown> = {}) => ({
  type: 'PLAYER_EVENT', data: { event: name, tmdbId: 1396, mediaType: 'tv', season: 1, episode: 2, ...extra },
})
function post(data: unknown, origin = VIDLOVE) {
  fireEvent(window, new MessageEvent('message', { data, origin, source: frame().contentWindow }))
}
function stored(videoId = 'tmdb-tv-1396-s1e2') {
  const raw = localStorage.getItem(`go10:progress:${videoId}`)
  return raw ? JSON.parse(raw) : null
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Player with vidlove', () => {
  it('never sandboxes an embed: vidlove refuses to play sandboxed ("This site broke the player")', () => {
    const { unmount } = render(<Player row={row()} onClose={() => {}} />)
    expect(frame().src.startsWith('https://player.vidlove.cc/embed/tv/1396/1/2?autoplay=true')).toBe(true)
    expect(frame().getAttribute('sandbox')).toBeNull()
    unmount()

    render(<Player row={row({ external: undefined, embed_url: 'https://ok.ru/videoembed/1', video_url: 'https://ok.ru/video/1' })} onClose={() => {}} />)
    expect(frame().getAttribute('sandbox')).toBeNull()
  })

  it('saves the position vidlove reports and ignores other origins', () => {
    render(<Player row={row()} onClose={() => {}} />)
    post(event('timeupdate', { currentTime: 30, duration: 2820 }), 'https://ok.ru')
    expect(stored()).toBeNull()

    post(event('timeupdate', { currentTime: 120, duration: 2820 }))
    expect(stored()).toMatchObject({ time: 120, duration: 2820, watched: false })
  })

  it('drops a late event from another episode', () => {
    const onEnded = vi.fn()
    render(<Player row={row()} onClose={() => {}} onEnded={onEnded} />)
    post(event('timeupdate', { currentTime: 300, duration: 2820, episode: 1 }))
    post(event('ended', { currentTime: 2820, episode: 1 }))
    expect(stored()).toBeNull()
    expect(onEnded).not.toHaveBeenCalled()
  })

  it('resumes by posting one seek once playback starts', () => {
    writeProgress('tmdb-tv-1396-s1e2', { time: 600, duration: 2820 })
    render(<Player row={row()} onClose={() => {}} />)
    expect(frame().src).not.toContain('fromTime')
    const send = vi.spyOn(frame().contentWindow!, 'postMessage')

    post(event('timeupdate', { currentTime: 2, duration: 2820 }))
    post(event('timeupdate', { currentTime: 3, duration: 2820 }))

    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith({ type: 'seek', time: 597 }, VIDLOVE)
  })

  it('marks the episode watched and moves on when vidlove reports the end', () => {
    const onEnded = vi.fn()
    render(<Player row={row()} onClose={() => {}} onEnded={onEnded} />)
    post(event('timeupdate', { currentTime: 2810, duration: 2820 }))
    post(event('ended', { currentTime: 2820 }))
    expect(onEnded).toHaveBeenCalledOnce()
    expect(stored()).toMatchObject({ watched: true })
  })

  it('offers the embed in a new tab once retries run out', () => {
    render(<Player row={row()} onClose={() => {}} />)
    for (const ms of [8000, 1000, 8000, 2000, 8000, 3000, 8000]) act(() => vi.advanceTimersByTime(ms))
    const link = screen.getByText('Abrir en una pestaña nueva')
    expect(link.getAttribute('href')).toBe('https://player.vidlove.cc/embed/tv/1396/1/2')
  })
})
