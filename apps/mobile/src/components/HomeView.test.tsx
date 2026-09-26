import { render, screen, userEvent } from '@testing-library/react-native'
import type { Collection } from '@go10/core/collections/types'
import type { CatalogRow, Title } from '@go10/core/types'
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
    featuredArt: null,
    strip: [pixar],
    rows: [
      { id: 'recientes', label: 'Recién añadidos', titles: [title('a'), title('b')] },
      { id: 'series', label: 'Series', titles: [title('c')] },
    ],
    ...overrides,
  }
}
const handlers = () => ({ onSelectTitle: jest.fn(), onPlayTitle: jest.fn(), onSelectCollection: jest.fn() })

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
  })
})
