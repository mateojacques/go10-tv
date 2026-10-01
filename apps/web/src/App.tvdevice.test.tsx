import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import App from './App'
import { siteFetch } from './test/site'

// A TV: live TV waits for its own spec (no mini-player reachable by remote yet).
vi.mock('./tv/liveTvEnabled', () => ({ liveTvEnabled: () => false }))

const CN_CSV = `catalog_index,video_id,type,title,title_raw,series_id,series_title,season_number,season_label,year,studio,genre,genre_secondary,quality,language,subtitled,duration_raw,duration_seconds,views,thumbnail,video_url,embed_url
0,111,movie,Foo Movie,Foo Movie,,,,,2020,,Drama,,1080p,Español,false,1:00:00,3600,10,thumb.webp,https://ok.ru/video/111,https://ok.ru/videoembed/111
1,222,season,Chowder,Chowder - Temporada 1,chowder,Chowder,1,,2008,Cartoon N.,Animación,,1080p,Español,false,1:00:00,3600,5,thumb.webp,https://ok.ru/video/222,https://ok.ru/videoembed/222
`

beforeEach(() => {
  window.history.replaceState({}, '', '/')
  localStorage.clear()
  vi.stubGlobal('fetch', siteFetch(CN_CSV))
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('App on a TV device', () => {
  it('offers no live TV entry points', async () => {
    render(<App />)
    await screen.findByRole('navigation', { name: 'Principal' })
    expect(screen.queryByRole('button', { name: 'TV en vivo' })).toBeNull()
    expect(screen.queryByRole('heading', { name: /En vivo ahora/ })).toBeNull()
  })

  it('sends /tv to Home', async () => {
    window.history.replaceState({}, '', '/tv/cartoon-network')
    render(<App />)
    await screen.findByRole('navigation', { name: 'Principal' })
    await waitFor(() => expect(window.location.pathname).toBe('/'))
    expect(document.querySelector('.go-tvslot')).toBeNull()
  })
})
