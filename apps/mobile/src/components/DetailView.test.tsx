import { fireEvent, render, screen, userEvent, within } from '@testing-library/react-native'
import type { Progress } from '@go10/core/progress/progressStore'
import type { CatalogRow, Title } from '@go10/core/types'
import { DetailView } from './DetailView'

const base = {
  catalog_index: 0, title: 'T', title_raw: 'T', series_id: 's', series_title: 'Saint Seiya', year: null, studio: '',
  source: '', genre: '', genre_secondary: '', quality: '', language: '', subtitled: false, duration_raw: '', views: 0,
  thumbnail: '', video_url: '', embed_url: '', chapter_start_seconds: null, chapter_end_seconds: null,
}
const ep = (season: number, n: number): CatalogRow => ({
  ...base, video_id: `s${season}e${n}`, type: 'episode', season_number: season, season_label: '', episode_number: n, duration_seconds: 1440,
})
const pack = (season: number): CatalogRow => ({
  ...base, video_id: `pack${season}`, type: 'season', season_number: season, season_label: '', episode_number: null, duration_seconds: 7200,
})
const titleOf = (overrides: Partial<Title>): Title => ({
  key: 'k', kind: 'show', title: 'Saint Seiya', year: 1986, studio: 'Toei', source: '', genre: 'Anime', genre_secondary: 'Acción',
  quality: '1080p', language: 'Español', subtitled: false, thumbnail: 'catalogo_files/ss.jpg', views: 10, durationSeconds: 0,
  catalogIndex: 0, seasons: [], ...overrides,
})
const movie: CatalogRow = { ...base, video_id: 'm1', type: 'movie', season_number: null, season_label: '', episode_number: null, duration_seconds: 5400 }
const film = titleOf({ kind: 'movie', title: 'Coraje', studio: '', seasons: [movie] })
const show = titleOf({ seasons: [ep(1, 1), ep(1, 2), ep(1, 3), ep(2, 1), ep(2, 2)] })
const p = (time: number, updatedAt: number, watched = false, duration = 1440): Progress => ({ time, duration, updatedAt, watched })
const IMG = 'https://tv.test/'

function renderDetail(title: Title, progress: Record<string, Progress> = {}, onPlay = jest.fn(), onBack = jest.fn()) {
  return render(<DetailView title={title} progress={progress} imageBase={IMG} onPlay={onPlay} onBack={onBack} />)
}

describe('DetailView', () => {
  it('presents a movie with Reproducir focused first', async () => {
    const onPlay = jest.fn()
    await renderDetail(film, {}, onPlay)
    expect(screen.getByRole('header', { name: 'Coraje' })).toBeTruthy()
    expect(screen.getByText('Película')).toBeTruthy()
    expect(screen.getByText('1 h 30 min')).toBeTruthy()
    expect(screen.getByText('Acción')).toBeTruthy()
    const play = screen.getByRole('button', { name: 'Reproducir' })
    expect(play.props.hasTVPreferredFocus).toBe(true)
    await userEvent.setup().press(play)
    expect(onPlay).toHaveBeenCalledWith(movie)
    expect(screen.queryByText('Episodios')).toBeNull()
  })

  it('offers Reanudar with what is left and a progress bar', async () => {
    await renderDetail(film, { m1: p(3000, 1, false, 5400) })
    expect(screen.getByRole('button', { name: 'Reanudar' })).toBeTruthy()
    expect(screen.getByText('Quedan 40 min')).toBeTruthy()
    expect(screen.getByTestId('progress')).toBeTruthy()
  })

  it('opens on the season being watched, with its episodes', async () => {
    await renderDetail(show, { s2e1: p(600, 5) })
    expect(screen.getByText('Serie · 2 temporadas · Toei')).toBeTruthy()
    expect(screen.getByText('T2 · E1 · Quedan 14 min')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Temporada 2, 2 episodios' }).props.accessibilityState).toMatchObject({ selected: true })
    expect(screen.getByRole('button', { name: 'Episodio 1, 24 min · Quedan 14 min' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Episodio 3/ })).toBeNull()
  })

  it('switches season from its tab and plays an episode from the grid', async () => {
    const onPlay = jest.fn()
    await renderDetail(show, { s1e1: p(1440, 1, true) }, onPlay)
    const user = userEvent.setup()
    await user.press(screen.getByRole('button', { name: 'Temporada 1, 3 episodios' }))
    expect(screen.getByRole('button', { name: 'Episodio 1, 24 min · Visto' })).toBeTruthy()
    await user.press(screen.getByRole('button', { name: 'Episodio 3, 24 min' }))
    expect(onPlay).toHaveBeenCalledWith(ep(1, 3))
  })

  it('plays a one-file season straight from its tab', async () => {
    const onPlay = jest.fn()
    await renderDetail(titleOf({ seasons: [pack(1), pack(2)] }), {}, onPlay)
    await userEvent.setup().press(screen.getByRole('button', { name: 'Temporada 2, 2 h 0 min' }))
    expect(onPlay).toHaveBeenCalledWith(pack(2))
  })

  it('captions the focused episode, else the one Play starts', async () => {
    await renderDetail(show, { s1e2: p(300, 1) })
    const caption = screen.getByTestId('episode-caption')
    expect(within(caption).getByText('Episodio 2')).toBeTruthy()
    await fireEvent(screen.getByRole('button', { name: 'Episodio 3, 24 min' }), 'focus')
    expect(within(caption).getByText('Episodio 3')).toBeTruthy()
  })

  it('follows what was played while away', async () => {
    const { rerender } = await renderDetail(show, { s1e1: p(300, 1) })
    expect(screen.getByText('T1 · E1 · Quedan 19 min')).toBeTruthy()
    await rerender(
      <DetailView title={show} progress={{ s1e1: p(1440, 1, true), s2e1: p(120, 9) }} imageBase={IMG} onPlay={jest.fn()} onBack={jest.fn()} />,
    )
    expect(screen.getByText('T2 · E1 · Quedan 22 min')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Temporada 2, 2 episodios' }).props.accessibilityState).toMatchObject({ selected: true })
  })

  it('has a touch back button', async () => {
    const onBack = jest.fn()
    await renderDetail(film, {}, jest.fn(), onBack)
    await userEvent.setup().press(screen.getByRole('button', { name: 'Volver' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('blurs the thumbnail behind, and requests nothing without one', async () => {
    const { rerender } = await renderDetail(film)
    expect(screen.getByTestId('backdrop').props.source).toEqual([{ uri: 'https://tv.test/catalogo_files/ss.jpg' }])
    await rerender(<DetailView title={{ ...film, thumbnail: '' }} progress={{}} imageBase={IMG} onPlay={jest.fn()} onBack={jest.fn()} />)
    expect(screen.queryByTestId('backdrop')).toBeNull()
  })
})
