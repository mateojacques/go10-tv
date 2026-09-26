import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from './App'
import { enableExternalTitles, tmdbFetch } from './external/testing'
import { resetTmdbClientForTests } from './external/tmdb/client'
import { resetTmdbTitleCacheForTests } from './external/useTmdbTitle'
import { listSnapshots, saveSnapshot } from './external/snapshots'
import { mapMovie, type TmdbMovie } from './external/tmdb/map'
import { writeProgress } from './progress/progressStore'

const CSV = `catalog_index,video_id,type,title,title_raw,series_id,series_title,season_number,season_label,year,studio,genre,genre_secondary,quality,language,subtitled,duration_raw,duration_seconds,views,thumbnail,video_url,embed_url
0,111,movie,Foo Movie,Foo Movie,,,,,2020,,Drama,,1080p,Español,false,1:00:00,3600,10,thumb.webp,https://ok.ru/video/111,https://ok.ru/videoembed/111
`

const MOVIE: TmdbMovie = {
  id: 155, title: 'Batman: El caballero de la noche', release_date: '2008-07-16',
  genres: [{ id: 28, name: 'Acción' }], original_language: 'en', runtime: 152, backdrop_path: '/b.jpg',
}

const csv = async () => ({ ok: true, text: async () => CSV })

beforeEach(() => {
  window.history.replaceState({}, '', '/')
  sessionStorage.clear()
  localStorage.clear()
  resetTmdbClientForTests()
  resetTmdbTitleCacheForTests()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('App with external titles on', () => {
  beforeEach(() => enableExternalTitles())

  it('opens a TMDB title from a deep link and plays it through vidlove', async () => {
    vi.stubGlobal('fetch', tmdbFetch({ '/movie/155': MOVIE }, csv))
    window.history.replaceState({}, '', '/title/tmdb-movie-155')
    render(<App />)

    await screen.findByRole('heading', { name: 'Batman: El caballero de la noche' })
    expect(screen.getByText('Inglés (sub)')).not.toBeNull()
    expect(screen.queryByText(/vistas/)).toBeNull()

    fireEvent.click(screen.getByText('Reproducir'))
    await waitFor(() => expect(window.location.pathname).toBe('/title/tmdb-movie-155/play/tmdb-movie-155'))
    const frame = document.querySelector('.go-player_frame') as HTMLIFrameElement
    expect(frame.src.startsWith('https://player.vidlove.cc/embed/movie/155?')).toBe(true)
    await waitFor(() => expect(listSnapshots().map((t) => t.key)).toEqual(['tmdb-movie-155']))
  })

  it('shows the load error with a way back when TMDB is unreachable', async () => {
    vi.stubGlobal('fetch', tmdbFetch({ '/movie/155': () => { throw new TypeError('offline') } }, csv))
    window.history.replaceState({}, '', '/title/tmdb-movie-155')
    render(<App />)

    await screen.findByText('No se pudo cargar el título.')
    fireEvent.click(screen.getByLabelText('Volver'))
    await waitFor(() => expect(window.location.pathname).toBe('/'))
  })

  it('lets Back leave while a TMDB title is still loading', async () => {
    vi.stubGlobal('fetch', tmdbFetch({ '/movie/155': () => new Promise(() => {}) }, csv))
    window.history.replaceState({}, '', '/title/tmdb-movie-155')
    render(<App />)

    await screen.findByText('Cargando título…')
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(window.location.pathname).toBe('/'))
  })

  it('bounces an unknown TMDB id home', async () => {
    vi.stubGlobal('fetch', tmdbFetch({}, csv))
    window.history.replaceState({}, '', '/title/tmdb-movie-404')
    render(<App />)
    await screen.findByRole('heading', { name: 'Foo Movie' })
    expect(window.location.pathname).toBe('/')
  })

  it('lists a played TMDB title under Seguir viendo', async () => {
    vi.stubGlobal('fetch', tmdbFetch({}, csv))
    saveSnapshot(mapMovie(MOVIE))
    writeProgress('tmdb-movie-155', { time: 600, duration: 9120 })
    render(<App />)

    await screen.findByText('Seguir viendo')
    expect(screen.getAllByText('Batman: El caballero de la noche').length).toBeGreaterThan(0)
  })
})

describe('App with external titles off', () => {
  it('treats TMDB keys as unknown and never calls TMDB', async () => {
    const fetch = tmdbFetch({ '/movie/155': MOVIE }, csv)
    vi.stubGlobal('fetch', fetch)
    window.history.replaceState({}, '', '/title/tmdb-movie-155')
    render(<App />)

    await screen.findByRole('heading', { name: 'Foo Movie' })
    expect(window.location.pathname).toBe('/')
    expect(fetch.mock.calls.some(([input]) => String(input).includes('themoviedb'))).toBe(false)
  })

  it('ignores snapshots on Home', async () => {
    vi.stubGlobal('fetch', tmdbFetch({}, csv))
    saveSnapshot(mapMovie(MOVIE))
    writeProgress('tmdb-movie-155', { time: 600, duration: 9120 })
    render(<App />)

    await screen.findByRole('heading', { name: 'Foo Movie' })
    expect(screen.queryByText('Seguir viendo')).toBeNull()
  })
})
