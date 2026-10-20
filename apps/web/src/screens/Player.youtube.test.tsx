import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { Player } from './Player'
import type { CatalogRow } from '@go10/core/types'

const YT = 'https://www.youtube-nocookie.com'
const HANDSHAKE = '{"event":"listening","id":1,"channel":"widget"}'

function row(overrides: Partial<CatalogRow> = {}): CatalogRow {
  return {
    catalog_index: 0, video_id: 'aqz-KE-bpKQ', type: 'movie', title: 'Big Buck Bunny', title_raw: 'Big Buck Bunny',
    series_id: '', series_title: '', season_number: null, season_label: '', episode_number: null,
    chapter_start_seconds: null, chapter_end_seconds: null, year: 2008, studio: '', source: '',
    genre: '', genre_secondary: '', quality: '', language: '', subtitled: false, duration_raw: '',
    duration_seconds: 635, views: 0, thumbnail: '',
    video_url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
    embed_url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
    ...overrides,
  }
}

const frame = () => document.querySelector('.go-player_frame') as HTMLIFrameElement
const info = (fields: Record<string, number>) => JSON.stringify({ event: 'infoDelivery', info: fields })
function post(data: unknown, origin = YT) {
  fireEvent(window, new MessageEvent('message', { data, origin, source: frame().contentWindow }))
}
function spyOnFrame() {
  const postMessage = vi.fn()
  Object.defineProperty(frame().contentWindow, 'postMessage', { value: postMessage, configurable: true })
  return postMessage
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Player with YouTube', () => {
  it('embeds the nocookie player', () => {
    render(<Player row={row()} onClose={() => {}} />)
    expect(frame().src.startsWith(`${YT}/embed/aqz-KE-bpKQ?enablejsapi=1&autoplay=1`)).toBe(true)
  })

  it('handshakes once the frame loads', () => {
    render(<Player row={row()} onClose={() => {}} />)
    const postMessage = spyOnFrame()
    fireEvent.load(frame())
    expect(postMessage).toHaveBeenCalledWith(HANDSHAKE, YT)
  })

  it('seeks and pauses from the remote', () => {
    render(<Player row={row()} onClose={() => {}} />)
    const postMessage = spyOnFrame()
    fireEvent.load(frame())
    post(info({ currentTime: 30, duration: 635, playerState: 1 }))
    postMessage.mockClear()
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(postMessage).toHaveBeenCalledWith('{"event":"command","func":"seekTo","args":[40,true]}', YT)
    fireEvent.keyDown(window, { key: 'MediaPlayPause' })
    expect(postMessage).toHaveBeenCalledWith('{"event":"command","func":"pauseVideo","args":[]}', YT)
  })

  it('falls back to YouTube at once when the video cannot be embedded', () => {
    render(<Player row={row()} onClose={() => {}} />)
    fireEvent.load(frame())
    post(JSON.stringify({ event: 'onError', info: 150 }))
    expect(screen.getByText('No se pudo reproducir aquí.')).toBeTruthy()
    expect(screen.getByText('Abrir en YouTube').getAttribute('href')).toBe('https://www.youtube.com/watch?v=aqz-KE-bpKQ')
  })

  it('reclaims focus when the YouTube embed takes it', () => {
    render(<Player row={row()} onClose={() => {}} />)
    fireEvent.load(frame())
    frame().focus()
    fireEvent(window, new Event('blur'))
    act(() => vi.advanceTimersByTime(0))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Mostrar controles' }))
  })

  it('ignores messages from other origins', () => {
    render(<Player row={row()} onClose={() => {}} />)
    post(JSON.stringify({ event: 'onError', info: 150 }), 'https://evil.example')
    expect(screen.queryByText('No se pudo reproducir aquí.')).toBeNull()
  })
})
