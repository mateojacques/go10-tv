import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { Catalog } from './Catalog'
import { FocusProvider } from '../focus/FocusProvider'
import type { Title } from '@go10/core/types'
import type { Section } from '@go10/core/catalog/selectTitles'
import { resetTmdbClientForTests } from '@go10/core/external/tmdb/client'
import { resetTmdbSearchForTests } from '../external/useTmdbSearch'
import { enableExternalTitles, tmdbFetch } from '@go10/core/external/testing'

function title(key: string, name: string): Title {
  return {
    key, kind: 'movie', title: name, year: null, studio: '', source: '', genre: '', genre_secondary: '',
    quality: '', language: '', subtitled: false, thumbnail: '', views: 0,
    durationSeconds: 0, catalogIndex: 0, seasons: [],
  }
}

const CATALOG = [title('m0', 'Batman Returns')]
const GENRES = { '/genre/movie/list': { genres: [] }, '/genre/tv/list': { genres: [] } }
const DARK_KNIGHT = { id: 155, media_type: 'movie', title: 'Batman: El caballero de la noche', backdrop_path: '/b.jpg' }
const BREAKING_BAD = { id: 1396, media_type: 'tv', name: 'Breaking Bad', poster_path: '/p.jpg' }

function renderSearch(query: string, { section = 'all' as Section, catalogOnly = false } = {}) {
  return render(
    <FocusProvider onBack={() => {}}>
      <Catalog titles={CATALOG} section={section} query={query} catalogOnly={catalogOnly} onSelect={() => {}} />
    </FocusProvider>,
  )
}

const cardNames = () => Array.from(document.querySelectorAll('.go-card_name')).map((n) => n.textContent)

beforeEach(() => {
  enableExternalTitles()
  resetTmdbClientForTests()
  resetTmdbSearchForTests()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('Catalog with external titles', () => {
  it('appends TMDB results after catalog matches, with the TMDB credit', async () => {
    vi.stubGlobal('fetch', tmdbFetch({ ...GENRES, '/search/multi': { results: [DARK_KNIGHT, BREAKING_BAD] } }))
    renderSearch('batman')

    expect(cardNames()).toEqual(['Batman Returns'])
    expect(screen.queryByText('Datos de títulos: TMDB')).toBeNull()

    await screen.findByText('Batman: El caballero de la noche')
    expect(cardNames()).toEqual(['Batman Returns', 'Batman: El caballero de la noche', 'Breaking Bad'])
    expect(screen.getByText('Datos de títulos: TMDB')).not.toBeNull()
  })

  it('keeps focus on the catalog card when TMDB results arrive', async () => {
    vi.stubGlobal('fetch', tmdbFetch({ ...GENRES, '/search/multi': { results: [DARK_KNIGHT] } }))
    renderSearch('batman')
    expect(screen.getByLabelText('Batman Returns').dataset.focused).toBe('true')
    await screen.findByText('Batman: El caballero de la noche')
    expect(screen.getByLabelText('Batman Returns').dataset.focused).toBe('true')
  })

  it('shows Buscando… rather than suggestions while TMDB is pending, then its results', async () => {
    vi.stubGlobal('fetch', tmdbFetch({ ...GENRES, '/search/multi': { results: [BREAKING_BAD] } }))
    renderSearch('breaking')

    expect(screen.getByText('Buscando…')).not.toBeNull()
    expect(screen.queryByText('Quizás te interese')).toBeNull()

    await screen.findByText('Breaking Bad')
    expect(screen.getByRole('heading', { name: /Resultados para "breaking"/ })).not.toBeNull()
  })

  it('does not label a TMDB show "0 Temporadas"', async () => {
    vi.stubGlobal('fetch', tmdbFetch({ ...GENRES, '/search/multi': { results: [BREAKING_BAD] } }))
    renderSearch('breaking')
    await screen.findByText('Breaking Bad')
    expect(screen.queryByText(/0 Temporadas/)).toBeNull()
  })

  it('falls back to suggestions when TMDB has nothing or fails', async () => {
    vi.stubGlobal('fetch', tmdbFetch({ ...GENRES, '/search/multi': { results: [] } }))
    renderSearch('zzzz')
    await screen.findByText('Quizás te interese')

    vi.stubGlobal('fetch', tmdbFetch(GENRES)) // search 404s
    renderSearch('yyyy')
    await waitFor(() => expect(screen.getAllByText('Quizás te interese')).toHaveLength(2))
  })

  it('makes no TMDB request with Solo catálogo', async () => {
    const fetch = tmdbFetch({ ...GENRES, '/search/multi': { results: [BREAKING_BAD] } })
    vi.stubGlobal('fetch', fetch)
    renderSearch('breaking', { catalogOnly: true })

    expect(screen.getByText('Quizás te interese')).not.toBeNull()
    await new Promise((resolve) => setTimeout(resolve, 450))
    expect(fetch).not.toHaveBeenCalled()
  })

  it("searches the section's endpoint", async () => {
    vi.stubGlobal('fetch', tmdbFetch({ ...GENRES, '/search/tv': { results: [{ ...BREAKING_BAD, media_type: undefined }] } }))
    renderSearch('breaking', { section: 'show' })
    await screen.findByText('Breaking Bad')
  })
})
