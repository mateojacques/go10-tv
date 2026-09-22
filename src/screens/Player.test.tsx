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

  it('writes a resume timestamp on first successful load, reused as fromTime on the next reload', () => {
    render(<Player row={row()} onClose={() => {}} />)
    fireEvent.load(getFrame())
    expect(localStorage.getItem('go10:resume:1')).not.toBeNull()

    act(() => vi.advanceTimersByTime(30_000))
    fireEvent.keyDown(window, { key: 'r' })
    expect(getFrame().src).toContain('fromTime=')
  })

  it('clears the resume timestamp when the video changes', () => {
    const { rerender } = render(<Player row={row({ video_id: '1' })} onClose={() => {}} />)
    fireEvent.load(getFrame())
    expect(localStorage.getItem('go10:resume:1')).not.toBeNull()

    rerender(<Player row={row({ video_id: '2' })} onClose={() => {}} />)
    expect(localStorage.getItem('go10:resume:1')).toBeNull()
  })

  it('calls onEnded once the episode duration has elapsed since load', () => {
    const onEnded = vi.fn()
    render(<Player row={row({ duration_seconds: 100 })} onClose={() => {}} onEnded={onEnded} />)
    fireEvent.load(getFrame())

    act(() => vi.advanceTimersByTime(99_000))
    expect(onEnded).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(1_000))
    expect(onEnded).toHaveBeenCalledTimes(1)
  })

  it('does not call onEnded when no callback is provided', () => {
    render(<Player row={row({ duration_seconds: 100 })} onClose={() => {}} />)
    fireEvent.load(getFrame())
    expect(() => act(() => vi.advanceTimersByTime(100_000))).not.toThrow()
  })
})
