import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { Player } from './Player'
import type { CatalogRow } from '../types'

function row(overrides: Partial<CatalogRow> = {}): CatalogRow {
  return {
    catalog_index: 0, video_id: '1', type: 'movie', title: 'Foo', title_raw: 'Foo',
    series_id: '', series_title: '', season_number: null, season_label: '',
    episode_number: null, year: null, studio: '', genre: '', genre_secondary: '',
    quality: '', language: '', subtitled: false, duration_raw: '', duration_seconds: 0,
    views: 0, thumbnail: '', video_url: 'https://ok.ru/video/1',
    embed_url: 'https://ok.ru/videoembed/1',
    ...overrides,
  }
}

function getFrame() {
  return document.querySelector('.go-player_frame') as HTMLIFrameElement
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Player', () => {
  it('renders the embed with autoplay', () => {
    render(<Player row={row()} onClose={() => {}} />)
    expect(getFrame().src).toBe('https://ok.ru/videoembed/1?autoplay=1')
  })

  it('calls onClose on Escape and Backspace', () => {
    const onClose = vi.fn()
    render(<Player row={row()} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.keyDown(window, { key: 'Backspace' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('shows a reconnecting indicator on load timeout, then recovers on load', () => {
    render(<Player row={row()} onClose={() => {}} />)
    expect(screen.queryByText('Reconectando…')).toBeNull()

    act(() => vi.advanceTimersByTime(8000)) // load timeout -> retrying
    expect(screen.getByText('Reconectando…')).not.toBeNull()

    act(() => vi.advanceTimersByTime(1000)) // backoff for attempt 1 -> reload
    expect(screen.queryByText('Reconectando…')).toBeNull()

    fireEvent.load(getFrame())
    expect(screen.queryByText('Reconectando…')).toBeNull()
    expect(screen.queryByText('No se pudo reproducir aquí.')).toBeNull()
  })

  it('falls back to the manual link after exhausting retries', () => {
    render(<Player row={row()} onClose={() => {}} />)

    act(() => vi.advanceTimersByTime(8000)) // timeout 1 -> retrying (attempt 1)
    act(() => vi.advanceTimersByTime(1000)) // backoff 1 -> loading
    act(() => vi.advanceTimersByTime(8000)) // timeout 2 -> retrying (attempt 2)
    act(() => vi.advanceTimersByTime(2000)) // backoff 2 -> loading
    act(() => vi.advanceTimersByTime(8000)) // timeout 3 -> retrying (attempt 3)
    act(() => vi.advanceTimersByTime(3000)) // backoff 3 -> loading
    act(() => vi.advanceTimersByTime(8000)) // timeout 4 -> failed

    expect(screen.getByText('No se pudo reproducir aquí.')).not.toBeNull()
    expect(screen.getByText('Abrir en ok.ru')).not.toBeNull()
  })

  it('reloads immediately on "r", bypassing backoff', () => {
    render(<Player row={row()} onClose={() => {}} />)
    act(() => vi.advanceTimersByTime(8000)) // -> retrying, attempt 1
    expect(screen.getByText('Reconectando…')).not.toBeNull()

    fireEvent.keyDown(window, { key: 'r' })
    expect(screen.queryByText('Reconectando…')).toBeNull()
    expect(getFrame()).not.toBeNull()
  })

  function postFromEmbed(frame: HTMLIFrameElement, data: unknown, origin = 'https://ok.ru') {
    fireEvent(
      window,
      new MessageEvent('message', { data, origin, source: frame.contentWindow }),
    )
  }

  function stored(videoId = '1') {
    const raw = localStorage.getItem(`go10:progress:${videoId}`)
    return raw ? JSON.parse(raw) : null
  }

  it('saves the position ok.ru reports, throttled, and flushes it on close', () => {
    const { unmount } = render(<Player row={row()} onClose={() => {}} />)
    const frame = getFrame()
    fireEvent.load(frame)

    postFromEmbed(frame, { event: 'timeupdate', time: 60, duration: 700 })
    expect(stored().time).toBe(60)

    act(() => vi.advanceTimersByTime(1000))
    postFromEmbed(frame, { event: 'timeupdate', time: 61, duration: 700 })
    expect(stored().time).toBe(60) // throttled

    act(() => vi.advanceTimersByTime(5000))
    postFromEmbed(frame, { event: 'timeupdate', time: 66, duration: 700 })
    expect(stored().time).toBe(66)

    postFromEmbed(frame, { event: 'timeupdate', time: 67, duration: 700 })
    unmount()
    expect(stored().time).toBe(67)
  })

  it('saves immediately on pause', () => {
    render(<Player row={row()} onClose={() => {}} />)
    const frame = getFrame()
    postFromEmbed(frame, { event: 'timeupdate', time: 60, duration: 700 })
    postFromEmbed(frame, { event: 'timeupdate', time: 62, duration: 700 })
    postFromEmbed(frame, { event: 'paused', time: 62 })
    expect(stored().time).toBe(62)
  })

  it('opens at the saved position via fromTime', () => {
    localStorage.setItem(
      'go10:progress:1',
      JSON.stringify({ time: 120, duration: 700, updatedAt: 0, watched: false }),
    )
    render(<Player row={row()} onClose={() => {}} />)
    expect(getFrame().src).toBe('https://ok.ru/videoembed/1?autoplay=1&fromTime=117')
  })

  it('keeps the iframe src stable while progress is being saved', () => {
    render(<Player row={row()} onClose={() => {}} />)
    const frame = getFrame()
    const src = frame.src
    postFromEmbed(frame, { event: 'timeupdate', time: 60, duration: 700 })
    act(() => vi.advanceTimersByTime(6000))
    postFromEmbed(frame, { event: 'timeupdate', time: 66, duration: 700 })
    expect(getFrame()).toBe(frame)
    expect(getFrame().src).toBe(src)
  })

  it('resumes from the latest position on a manual reload', () => {
    render(<Player row={row()} onClose={() => {}} />)
    postFromEmbed(getFrame(), { event: 'timeupdate', time: 60, duration: 700 })
    act(() => vi.advanceTimersByTime(1000))
    postFromEmbed(getFrame(), { event: 'timeupdate', time: 63, duration: 700 }) // throttled, unsaved
    fireEvent.keyDown(window, { key: 'r' })
    expect(getFrame().src).toContain('fromTime=60')
  })

  it('marks the video watched on "ended", so reopening starts over', () => {
    const { unmount } = render(<Player row={row()} onClose={() => {}} />)
    postFromEmbed(getFrame(), { event: 'timeupdate', time: 690, duration: 700 })
    postFromEmbed(getFrame(), { event: 'ended', time: 700 })
    unmount()
    expect(stored().watched).toBe(true)

    render(<Player row={row()} onClose={() => {}} />)
    expect(getFrame().src).toBe('https://ok.ru/videoembed/1?autoplay=1')
  })

  it('attributes progress to the right video when switching episodes', () => {
    const { rerender } = render(<Player row={row({ video_id: '1' })} onClose={() => {}} />)
    postFromEmbed(getFrame(), { event: 'timeupdate', time: 60, duration: 700 })
    act(() => vi.advanceTimersByTime(1000))
    postFromEmbed(getFrame(), { event: 'timeupdate', time: 64, duration: 700 })

    rerender(<Player row={row({ video_id: '2', embed_url: 'https://ok.ru/videoembed/2' })} onClose={() => {}} />)
    expect(stored('1').time).toBe(64)
    expect(stored('2')).toBeNull()
  })

  it('calls onEnded when the ok.ru embed posts an "ended" message', () => {
    const onEnded = vi.fn()
    render(<Player row={row()} onClose={() => {}} onEnded={onEnded} />)
    const frame = getFrame()
    fireEvent.load(frame)

    postFromEmbed(frame, { event: 'ended', time: 1412 })
    expect(onEnded).toHaveBeenCalledTimes(1)
  })

  it('ignores an "ended" message from a different origin', () => {
    const onEnded = vi.fn()
    render(<Player row={row()} onClose={() => {}} onEnded={onEnded} />)
    const frame = getFrame()
    fireEvent.load(frame)

    postFromEmbed(frame, { event: 'ended', time: 1412 }, 'https://evil.example')
    expect(onEnded).not.toHaveBeenCalled()
  })

  it('does not treat a "timeupdate" message as the end', () => {
    const onEnded = vi.fn()
    render(<Player row={row()} onClose={() => {}} onEnded={onEnded} />)
    const frame = getFrame()
    fireEvent.load(frame)

    postFromEmbed(frame, { event: 'timeupdate', time: 5, duration: 1412 })
    expect(onEnded).not.toHaveBeenCalled()
  })

  it('does not throw on an "ended" message when no onEnded callback is provided', () => {
    render(<Player row={row()} onClose={() => {}} />)
    const frame = getFrame()
    fireEvent.load(frame)
    expect(() => postFromEmbed(frame, { event: 'ended', time: 1412 })).not.toThrow()
  })

  it('navigates to the previous/next episode on Shift+ArrowLeft/ArrowRight', () => {
    const onPrev = vi.fn()
    const onNext = vi.fn()
    render(<Player row={row()} onClose={() => {}} onPrev={onPrev} onNext={onNext} />)

    fireEvent.keyDown(window, { key: 'ArrowLeft', shiftKey: true })
    fireEvent.keyDown(window, { key: 'ArrowRight', shiftKey: true })

    expect(onPrev).toHaveBeenCalledTimes(1)
    expect(onNext).toHaveBeenCalledTimes(1)
  })

  it('does not treat a plain arrow key (no Shift) as episode navigation', () => {
    const onPrev = vi.fn()
    const onNext = vi.fn()
    render(<Player row={row()} onClose={() => {}} onPrev={onPrev} onNext={onNext} />)

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    fireEvent.keyDown(window, { key: 'ArrowRight' })

    expect(onPrev).not.toHaveBeenCalled()
    expect(onNext).not.toHaveBeenCalled()
  })
})
