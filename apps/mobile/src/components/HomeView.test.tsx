import { setExternalConfigSource } from '@go10/core/external/config'
import { saveSnapshot } from '@go10/core/external/snapshots'
import { memoryStore, setKeyValueStore } from '@go10/core/ports/keyValueStore'
import { render, screen, userEvent } from '@testing-library/react-native'
import type { Collection } from '@go10/core/collections/types'
import type { CatalogRow, Title } from '@go10/core/types'
import type { Progress } from '@go10/core/progress/progressStore'
import type { HomeModel } from '../home/homeModel'
import { HomeView, homeSections } from './HomeView'

const title = (key: string): Title => ({
  key, kind: 'movie', title: `Título ${key}`, year: 2001, studio: '', source: '', genre: '', genre_secondary: '',
  quality: '', language: '', subtitled: false, thumbnail: '', views: 0, durationSeconds: 0, catalogIndex: 0,
  seasons: [{ video_id: `${key}1`, type: 'movie' } as CatalogRow],
})
const pixar: Collection = { id: 'pixar', name: 'Pixar', order: 1, logo: 'assets/collections/pixar/logo.svg', tile: { color: '#000' }, titles: ['a'] }

function model(overrides: Partial<HomeModel> = {}): HomeModel {
  return {
    featured: title('a'),
    titles: [title('a'), title('b'), title('c')],
    featuredArt: null,
    strip: [pixar],
    rows: [
      { id: 'recientes', label: 'Recién añadidos', titles: [title('a'), title('b')] },
      { id: 'series', label: 'Series', titles: [title('c')] },
    ],
    ...overrides,
  }
}
const handlers = () => ({ onSelectTitle: jest.fn(), onPlayTitle: jest.fn(), onSelectCollection: jest.fn(), onOpenSection: jest.fn(), onSearch: jest.fn() })

describe('HomeView', () => {
  it('stacks the hero, the collection strip and the rows', async () => {
    await render(<HomeView progress={{}} model={model()} imageBase="https://tv.test/" {...handlers()} />)
    expect(screen.getByRole('header', { name: 'Título a' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Pixar' })).toBeTruthy()
    expect(screen.getByRole('header', { name: /Recién añadidos/ })).toBeTruthy()
    expect(screen.getByRole('header', { name: /Series/ })).toBeTruthy()
  })

  it('routes each kind of press to its handler', async () => {
    const h = handlers()
    await render(<HomeView progress={{}} model={model()} imageBase="https://tv.test/" {...h} />)
    const user = userEvent.setup()
    await user.press(screen.getByRole('button', { name: 'Reproducir' }))
    await user.press(screen.getByRole('button', { name: 'Más información' }))
    await user.press(screen.getByRole('button', { name: 'Pixar' }))
    await user.press(screen.getByRole('button', { name: 'Título c' }))
    expect(h.onPlayTitle).toHaveBeenCalledWith(expect.objectContaining({ key: 'a' }), expect.objectContaining({ video_id: 'a1' }))
    expect(h.onSelectTitle).toHaveBeenNthCalledWith(1, expect.objectContaining({ key: 'a' }))
    expect(h.onSelectCollection).toHaveBeenCalledWith(pixar)
    expect(h.onSelectTitle).toHaveBeenNthCalledWith(2, expect.objectContaining({ key: 'c' }))
  })

  it('leaves the strip out when no collection is visible', async () => {
    await render(<HomeView progress={{}} model={model({ strip: [] })} imageBase="https://tv.test/" {...handlers()} />)
    expect(screen.queryByRole('button', { name: 'Pixar' })).toBeNull()
    expect(screen.getByRole('header', { name: /Recién añadidos/ })).toBeTruthy()
  })

  it('keeps the hero out of the virtualised sections, so it never remounts and re-takes TV focus', async () => {
    expect(homeSections(model()).map((s) => s.kind)).toEqual(['strip', 'row', 'row'])
    expect(homeSections(model({ strip: [] })).map((s) => s.kind)).toEqual(['row', 'row'])
    expect(homeSections(model(), 1).map((s) => s.kind)).toEqual(['strip', 'continue', 'row', 'row'])
  })

  it('shows Seguir viendo with progress, and plays straight from it', async () => {
    const h = handlers()
    const progress: Record<string, Progress> = { b1: { time: 600, duration: 1200, updatedAt: 5, watched: false } }
    await render(<HomeView progress={progress} model={model()} imageBase="https://tv.test/" {...h} />)
    expect(screen.getByRole('header', { name: /Seguir viendo/ })).toBeTruthy()
    expect(screen.getByText('Quedan 10 min')).toBeTruthy()
    await userEvent.setup().press(screen.getAllByRole('button', { name: 'Título b' })[0])
    expect(h.onPlayTitle).toHaveBeenCalledWith(expect.objectContaining({ key: 'b' }), expect.objectContaining({ video_id: 'b1' }))
  })

  it('has no Seguir viendo row when nothing is in progress', async () => {
    await render(<HomeView progress={{}} model={model()} imageBase="https://tv.test/" {...handlers()} />)
    expect(screen.queryByRole('header', { name: /Seguir viendo/ })).toBeNull()
  })

  it('reaches Películas, Series and search from the navbar', async () => {
    const h = handlers()
    await render(<HomeView progress={{}} model={model()} imageBase="https://tv.test/" {...h} />)
    const user = userEvent.setup()
    await user.press(screen.getByRole('button', { name: 'Películas' }))
    await user.press(screen.getByRole('button', { name: 'Buscar' }))
    expect(h.onOpenSection).toHaveBeenCalledWith('movie')
    expect(h.onSearch).toHaveBeenCalledTimes(1)
  })

  it('lists played TMDB titles in Seguir viendo from their snapshots, only with external titles on', async () => {
    setKeyValueStore(memoryStore())
    const batman: Title = { ...title('tmdb-movie-155'), title: 'Batman', external: true, seasons: [{ video_id: 'tmdb-movie-155', type: 'movie' } as CatalogRow] }
    saveSnapshot(batman)
    const progress: Record<string, Progress> = { 'tmdb-movie-155': { time: 600, duration: 1200, updatedAt: 5, watched: false } }

    setExternalConfigSource(() => ({ externalTitles: 'on', tmdbToken: 'test' }))
    const on = await render(<HomeView progress={progress} model={model()} imageBase="https://tv.test/" {...handlers()} />)
    expect(screen.getByRole('button', { name: 'Batman' })).toBeTruthy()
    await on.unmount()

    setExternalConfigSource(() => ({ externalTitles: undefined, tmdbToken: undefined }))
    await render(<HomeView progress={progress} model={model()} imageBase="https://tv.test/" {...handlers()} />)
    expect(screen.queryByRole('button', { name: 'Batman' })).toBeNull()
  })
})
