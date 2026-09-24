import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from './App'

const CSV = `catalog_index,video_id,type,title,title_raw,series_id,series_title,season_number,season_label,year,studio,genre,genre_secondary,quality,language,subtitled,duration_raw,duration_seconds,views,thumbnail,video_url,embed_url
0,111,movie,Foo Movie,Foo Movie,,,,,2020,,Drama,,1080p,Español,false,1:00:00,3600,10,thumb.webp,https://ok.ru/video/111,https://ok.ru/videoembed/111
`

beforeEach(() => {
  window.history.replaceState({}, '', '/')
  sessionStorage.clear()
  localStorage.clear()
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(CSV) }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('App routing', () => {
  it('plays the featured title straight from the hero', async () => {
    render(<App />)

    await screen.findByRole('heading', { name: 'Foo Movie' })
    fireEvent.click(screen.getByText('Reproducir'))

    await waitFor(() => expect(window.location.pathname).toBe('/title/111/play/111'))
  })

  it('navigates from home to detail to player, updating the URL each time, and back again', async () => {
    render(<App />)

    await screen.findByRole('heading', { name: 'Foo Movie' })
    fireEvent.click(screen.getByText('Más información'))

    await waitFor(() => expect(window.location.pathname).toBe('/title/111'))
    screen.getByRole('heading', { name: 'Foo Movie' }) // throws if not found

    fireEvent.click(screen.getByText('Reproducir'))
    await waitFor(() => expect(window.location.pathname).toBe('/title/111/play/111'))
    expect(document.querySelector('.go-player_frame')).not.toBeNull()

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(window.location.pathname).toBe('/title/111'))
  })

  it('resolves a direct deep link to the player route on first render', async () => {
    window.history.replaceState({}, '', '/title/111/play/111')
    render(<App />)
    await waitFor(() => expect(document.querySelector('.go-player_frame')).not.toBeNull())
  })

  it('redirects to home when the URL does not match any loaded title', async () => {
    window.history.replaceState({}, '', '/title/does-not-exist')
    render(<App />)
    await screen.findByRole('heading', { name: 'Foo Movie' })
    expect(window.location.pathname).toBe('/')
  })

  it('typing on Home moves to /buscar with the same input still focused', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Foo Movie' })
    const input = screen.getByRole('searchbox')
    fireEvent.click(input)
    fireEvent.change(input, { target: { value: 'foo' } })
    await waitFor(() => expect(window.location.pathname).toBe('/buscar'))
    expect(window.location.search).toBe('?q=foo')
    expect(screen.getByRole('searchbox')).toBe(input)
    expect(document.activeElement).toBe(input)
    screen.getByRole('heading', { name: /Resultados para "foo"/ })
  })

  it('returns to the search from a title opened in it', async () => {
    window.history.replaceState({}, '', '/buscar?q=foo')
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Foo Movie' }))
    await waitFor(() => expect(window.location.pathname).toBe('/title/111'))
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(window.location.pathname).toBe('/buscar'))
    expect(window.location.search).toBe('?q=foo')
  })

  it('navbar links open the section catalogs', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Foo Movie' })
    fireEvent.click(screen.getByText('Películas'))
    await waitFor(() => expect(window.location.pathname).toBe('/peliculas'))
    screen.getByRole('heading', { level: 1, name: /Películas/ })
    fireEvent.click(screen.getByText('Series'))
    await waitFor(() => expect(window.location.pathname).toBe('/series'))
  })

  const EPISODIC_CSV = `catalog_index,video_id,type,title,title_raw,series_id,series_title,season_number,season_label,episode_number,year,studio,genre,genre_secondary,quality,language,subtitled,duration_raw,duration_seconds,views,thumbnail,video_url,embed_url
0,201,episode,Ep Show,Ep Show,ep-show,Ep Show,1,,1,2020,,Drama,,1080p,Español,false,23:00,1380,10,thumb.webp,https://ok.ru/video/201,https://ok.ru/videoembed/201
1,202,episode,Ep Show,Ep Show,ep-show,Ep Show,1,,2,2020,,Drama,,1080p,Español,false,23:00,1380,10,thumb.webp,https://ok.ru/video/202,https://ok.ru/videoembed/202
2,203,episode,Ep Show,Ep Show,ep-show,Ep Show,1,,3,2020,,Drama,,1080p,Español,false,23:00,1380,10,thumb.webp,https://ok.ru/video/203,https://ok.ru/videoembed/203
`

  const SINGLE_EPISODE_CSV = `catalog_index,video_id,type,title,title_raw,series_id,series_title,season_number,season_label,episode_number,year,studio,genre,genre_secondary,quality,language,subtitled,duration_raw,duration_seconds,views,thumbnail,video_url,embed_url
0,201,episode,Ep Show,Ep Show,ep-show,Ep Show,1,,1,2020,,Drama,,1080p,Español,false,23:00,1380,10,thumb.webp,https://ok.ru/video/201,https://ok.ru/videoembed/201
`

  function postEnded(frame: HTMLIFrameElement) {
    fireEvent(
      window,
      new MessageEvent('message', {
        data: { event: 'ended', time: 0 },
        origin: 'https://ok.ru',
        source: frame.contentWindow,
      }),
    )
  }

  it('autoplays the next episode once the ok.ru embed reports "ended"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(EPISODIC_CSV) }),
    )

    render(<App />)
    await screen.findByRole('heading', { name: 'Ep Show' })
    fireEvent.click(screen.getByText('Más información'))
    await waitFor(() => expect(window.location.pathname).toBe('/title/ep-show'))

    fireEvent.click(screen.getByText('Reproducir'))
    await waitFor(() => expect(window.location.pathname).toBe('/title/ep-show/play/201'))

    const frame = document.querySelector('.go-player_frame') as HTMLIFrameElement
    fireEvent.load(frame)
    postEnded(frame)

    await waitFor(() => expect(window.location.pathname).toBe('/title/ep-show/play/202'))
  })

  it('does not autoplay past the last episode', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(SINGLE_EPISODE_CSV) }),
    )

    render(<App />)
    await screen.findByRole('heading', { name: 'Ep Show' })
    fireEvent.click(screen.getByText('Más información'))
    await waitFor(() => expect(window.location.pathname).toBe('/title/ep-show'))

    fireEvent.click(screen.getByText('Reproducir'))
    await waitFor(() => expect(window.location.pathname).toBe('/title/ep-show/play/201'))

    const frame = document.querySelector('.go-player_frame') as HTMLIFrameElement
    fireEvent.load(frame)
    postEnded(frame)

    expect(window.location.pathname).toBe('/title/ep-show/play/201')
  })

  it('jumps to the next/previous episode on Shift+ArrowRight/ArrowLeft', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(EPISODIC_CSV) }),
    )

    render(<App />)
    await screen.findByRole('heading', { name: 'Ep Show' })
    fireEvent.click(screen.getByText('Más información'))
    await waitFor(() => expect(window.location.pathname).toBe('/title/ep-show'))

    fireEvent.click(screen.getByText('Reproducir'))
    await waitFor(() => expect(window.location.pathname).toBe('/title/ep-show/play/201'))

    fireEvent.keyDown(window, { key: 'ArrowRight', shiftKey: true })
    await waitFor(() => expect(window.location.pathname).toBe('/title/ep-show/play/202'))

    fireEvent.keyDown(window, { key: 'ArrowLeft', shiftKey: true })
    await waitFor(() => expect(window.location.pathname).toBe('/title/ep-show/play/201'))

    // No previous episode from the first one — nothing happens.
    fireEvent.keyDown(window, { key: 'ArrowLeft', shiftKey: true })
    expect(window.location.pathname).toBe('/title/ep-show/play/201')
  })

  function storeProgress(videoId: string, progress: object) {
    localStorage.setItem(`go10:progress:${videoId}`, JSON.stringify(progress))
  }

  it('lists an in-progress title under "Seguir viendo" and plays it from the saved spot', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(EPISODIC_CSV) }),
    )
    storeProgress('201', { time: 1380, duration: 1380, updatedAt: 1, watched: true })
    storeProgress('202', { time: 600, duration: 1380, updatedAt: 2, watched: false })

    render(<App />)
    await screen.findByText('Seguir viendo')
    screen.getByText('T1 · E2 · Quedan 13 min')

    const card = screen.getAllByRole('button', { name: 'Ep Show' })[0]
    fireEvent.click(card)
    await waitFor(() => expect(window.location.pathname).toBe('/title/ep-show/play/202'))
    const frame = document.querySelector('.go-player_frame') as HTMLIFrameElement
    expect(frame.src).toContain('fromTime=597')

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(window.location.pathname).toBe('/title/ep-show'))
    screen.getByText('Reanudar')
  })

  it('offers the next episode once the last-watched one is finished', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(EPISODIC_CSV) }),
    )
    storeProgress('201', { time: 1380, duration: 1380, updatedAt: 1, watched: true })

    render(<App />)
    await screen.findByText('Siguiente: T1 · E2')
  })

  it('shows no "Seguir viendo" row without any progress', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Foo Movie' })
    expect(screen.queryByText('Seguir viendo')).toBeNull()
  })
})
