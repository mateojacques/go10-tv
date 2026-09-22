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
})
