import { describe, expect, it } from 'vitest'
import { languageName, mapMovie, mapSearchResult, mapShow, type TmdbMovie, type TmdbSeason, type TmdbShow } from './map'

const MOVIE: TmdbMovie = {
  id: 155,
  title: 'Batman: El caballero de la noche',
  release_date: '2008-07-16',
  genres: [{ id: 18, name: 'Drama' }, { id: 28, name: 'Acción' }, { id: 80, name: 'Crimen' }],
  production_companies: [{ name: 'Warner Bros. Pictures' }],
  original_language: 'en',
  runtime: 152,
  backdrop_path: '/back.jpg',
  poster_path: '/poster.jpg',
}

const SHOW: TmdbShow = {
  id: 1396,
  name: 'Breaking Bad',
  first_air_date: '2008-01-20',
  genres: [{ id: 18, name: 'Drama' }],
  networks: [{ name: 'AMC' }],
  original_language: 'en',
  episode_run_time: [47],
  backdrop_path: '/bb.jpg',
  poster_path: null,
  seasons: [{ season_number: 0 }, { season_number: 1 }, { season_number: 2 }],
}

const SEASONS: TmdbSeason[] = [
  { season_number: 0, episodes: [{ season_number: 0, episode_number: 1, name: 'Especial', air_date: '2009-02-17', runtime: 5 }] },
  {
    season_number: 2,
    episodes: [
      { season_number: 2, episode_number: 1, name: 'Siete treinta y siete', air_date: '2009-03-08', runtime: 47, still_path: '/s2e1.jpg' },
      { season_number: 2, episode_number: 2, name: 'Futuro', air_date: '2099-01-01', runtime: 47 },
      { season_number: 2, episode_number: 3, name: 'Sin fecha', air_date: null, runtime: 47 },
    ],
  },
  {
    season_number: 1,
    episodes: [
      { season_number: 1, episode_number: 2, name: 'El gato está en la bolsa', air_date: '2008-01-27', runtime: null },
      { season_number: 1, episode_number: 1, name: 'Piloto', air_date: '2008-01-20', runtime: 58 },
    ],
  },
]

describe('languageName', () => {
  it('names languages in Spanish, capitalised', () => {
    expect(languageName('en')).toBe('Inglés')
    expect(languageName('es')).toBe('Español')
    expect(languageName('ja')).toBe('Japonés')
  })

  it('falls back to the code, and to blank', () => {
    expect(languageName('xx')).toBe('XX')
    expect(languageName(undefined)).toBe('')
  })
})

describe('mapMovie', () => {
  it('maps a movie into a one-row title', () => {
    const title = mapMovie(MOVIE)
    expect(title).toMatchObject({
      key: 'tmdb-movie-155', kind: 'movie', title: 'Batman: El caballero de la noche', year: 2008,
      studio: 'Warner Bros. Pictures', source: '', genre: 'Drama', genre_secondary: 'Acción',
      quality: '', language: 'Inglés', subtitled: true, views: 0, durationSeconds: 9120,
      thumbnail: 'https://image.tmdb.org/t/p/w780/back.jpg', external: true,
    })
    expect(title.seasons).toHaveLength(1)
    expect(title.seasons[0]).toMatchObject({
      video_id: 'tmdb-movie-155', type: 'movie', series_id: '', season_number: null,
      chapter_start_seconds: null, chapter_end_seconds: null, duration_seconds: 9120,
      embed_url: 'https://player.vidlove.cc/embed/movie/155',
      video_url: 'https://player.vidlove.cc/embed/movie/155', external: true,
    })
  })

  it('falls back to the poster, and handles Spanish originals and missing runtime', () => {
    const title = mapMovie({ ...MOVIE, backdrop_path: null, original_language: 'es', runtime: null })
    expect(title.thumbnail).toBe('https://image.tmdb.org/t/p/w500/poster.jpg')
    expect(title.language).toBe('Español')
    expect(title.subtitled).toBe(false)
    expect(title.durationSeconds).toBe(0)
  })

  it('leaves the year blank for a missing date', () => {
    expect(mapMovie({ ...MOVIE, release_date: '' }).year).toBeNull()
  })
})

describe('mapShow', () => {
  it('flattens aired episodes, in order, without specials', () => {
    const title = mapShow(SHOW, SEASONS, '2026-09-25')!
    expect(title).toMatchObject({ key: 'tmdb-tv-1396', kind: 'show', title: 'Breaking Bad', studio: 'AMC', year: 2008, durationSeconds: 3480 })
    expect(title.seasons.map((r) => r.video_id)).toEqual(['tmdb-tv-1396-s1e1', 'tmdb-tv-1396-s1e2', 'tmdb-tv-1396-s2e1'])
    expect(title.seasons[0]).toMatchObject({
      type: 'episode', title: 'Piloto', series_id: 'tmdb-tv-1396', series_title: 'Breaking Bad',
      season_number: 1, season_label: 'Temporada 1', episode_number: 1, duration_seconds: 3480,
      embed_url: 'https://player.vidlove.cc/embed/tv/1396/1/1', thumbnail: 'https://image.tmdb.org/t/p/w780/bb.jpg',
      external: true,
    })
  })

  it("uses the show's runtime and art when an episode has none", () => {
    const title = mapShow(SHOW, SEASONS, '2026-09-25')!
    expect(title.seasons[1].duration_seconds).toBe(47 * 60)
    expect(title.seasons[2].thumbnail).toBe('https://image.tmdb.org/t/p/w780/s2e1.jpg')
  })

  it('is null when nothing has aired', () => {
    expect(mapShow(SHOW, [], '2026-09-25')).toBeNull()
  })
})

describe('mapSearchResult', () => {
  const genres = new Map([[18, 'Drama'], [28, 'Acción']])

  it('maps a movie result into a lightweight title', () => {
    expect(
      mapSearchResult({ id: 155, media_type: 'movie', title: 'Batman', release_date: '2008-07-16', genre_ids: [28, 18], original_language: 'en', backdrop_path: '/b.jpg' }, genres),
    ).toMatchObject({
      key: 'tmdb-movie-155', kind: 'movie', title: 'Batman', year: 2008, genre: 'Acción', genre_secondary: 'Drama',
      language: 'Inglés', subtitled: true, thumbnail: 'https://image.tmdb.org/t/p/w780/b.jpg', seasons: [], external: true,
    })
  })

  it('maps a TV result by name and first air date', () => {
    expect(
      mapSearchResult({ id: 1396, media_type: 'tv', name: 'Breaking Bad', first_air_date: '2008-01-20', poster_path: '/p.jpg' }, genres),
    ).toMatchObject({ key: 'tmdb-tv-1396', kind: 'show', title: 'Breaking Bad', year: 2008, thumbnail: 'https://image.tmdb.org/t/p/w500/p.jpg' })
  })

  it('takes the media type from the endpoint when the result has none', () => {
    expect(mapSearchResult({ id: 1, title: 'X', backdrop_path: '/x.jpg' }, genres, 'movie')?.kind).toBe('movie')
  })

  it('drops people, imageless results and nameless results', () => {
    expect(mapSearchResult({ id: 1, media_type: 'person', name: 'Someone', poster_path: '/p.jpg' }, genres)).toBeNull()
    expect(mapSearchResult({ id: 2, media_type: 'movie', title: 'No art' }, genres)).toBeNull()
    expect(mapSearchResult({ id: 3, media_type: 'movie', title: '', backdrop_path: '/x.jpg' }, genres)).toBeNull()
  })
})
