import { setExternalConfigSource } from '@go10/core/external/config'
import { useTmdbSearch } from '../external/useTmdbSearch'
import { render, screen, userEvent } from '@testing-library/react-native'
import type { Title } from '@go10/core/types'
import { CatalogView } from './CatalogView'

const t = (key: string, title: string, kind: Title['kind'] = 'movie'): Title => ({
  key, kind, title, year: 2001, studio: '', source: '', genre: '', genre_secondary: '', quality: '', language: '',
  subtitled: false, thumbnail: '', views: 0, durationSeconds: 0, catalogIndex: 0, seasons: [],
})
const titles = [t('a', 'Coraje'), t('b', 'Dragon Ball', 'show'), t('c', 'Digimon', 'show')]
const IMG = 'https://tv.test/'


jest.mock('../external/useTmdbSearch', () => ({ useTmdbSearch: jest.fn() }))
const tmdb = useTmdbSearch as jest.MockedFunction<typeof useTmdbSearch>
const external = (on: boolean) => setExternalConfigSource(() => ({ externalTitles: on ? 'on' : undefined, tmdbToken: on ? 'test' : undefined }))
const BATMAN: Title = { ...t('tmdb-movie-155', 'Batman'), external: true }

beforeEach(() => {
  external(false)
  tmdb.mockReturnValue({ status: 'off', titles: [] })
})

describe('CatalogView', () => {
  it('browses a section with its name and count, first card focused on TV', async () => {
    await render(<CatalogView titles={titles} section="show" query="" imageBase={IMG} onSelect={jest.fn()} preferFirst />)
    expect(screen.getByRole('header', { name: /Series/ })).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Dragon Ball' }).props.hasTVPreferredFocus).toBe(true)
    expect(screen.getByRole('button', { name: 'Digimon' }).props.hasTVPreferredFocus).toBeFalsy()
    expect(screen.queryByRole('button', { name: 'Coraje' })).toBeNull()
  })

  it('shows search results and opens the one pressed', async () => {
    const onSelect = jest.fn()
    await render(<CatalogView titles={titles} section="all" query="dragon" imageBase={IMG} onSelect={onSelect} />)
    expect(screen.getByRole('header', { name: /Resultados para "dragon"/ })).toBeTruthy()
    await userEvent.setup().press(screen.getByRole('button', { name: 'Dragon Ball' }))
    expect(onSelect).toHaveBeenCalledWith(titles[1])
  })

  it('suggests near titles when nothing matches', async () => {
    await render(<CatalogView titles={titles} section="all" query="zzzz" imageBase={IMG} onSelect={jest.fn()} />)
    expect(screen.getByRole('header', { name: /Sin resultados para "zzzz"/ })).toBeTruthy()
    expect(screen.getByText('Quizás te interese')).toBeTruthy()
    expect(screen.getAllByRole('button').length).toBe(3)
  })

  it('says so when a section has nothing', async () => {
    await render(<CatalogView titles={[titles[0]]} section="show" query="" imageBase={IMG} onSelect={jest.fn()} />)
    expect(screen.getByText('No hay títulos.')).toBeTruthy()
  })

  it('mounts a window of cards, not all of them', async () => {
    const many = Array.from({ length: 300 }, (_, i) => t(`m${i}`, `Película ${i}`))
    await render(<CatalogView titles={many} section="movie" query="" imageBase={IMG} onSelect={jest.fn()} />)
    expect(screen.getByRole('button', { name: 'Película 0' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Película 299' })).toBeNull()
  })

  it('appends TMDB hits after the catalog matches, with the credit', async () => {
    external(true)
    tmdb.mockReturnValue({ status: 'done', titles: [BATMAN] })
    await render(<CatalogView titles={titles} section="all" query="dig" imageBase={IMG} onSelect={jest.fn()} />)
    const cards = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel)
    expect(cards).toEqual(['Digimon', 'Batman'])
    expect(screen.getByText('Datos de títulos: TMDB')).toBeTruthy()
    expect(tmdb).toHaveBeenCalledWith('dig', 'all', true)
  })

  it('waits for TMDB before suggesting near titles', async () => {
    external(true)
    tmdb.mockReturnValue({ status: 'pending', titles: [] })
    await render(<CatalogView titles={titles} section="all" query="zzzz" imageBase={IMG} onSelect={jest.fn()} />)
    expect(screen.getByText('Buscando…')).toBeTruthy()
    expect(screen.queryByText('Quizás te interese')).toBeNull()
  })

  it('falls back to the catalog when TMDB fails', async () => {
    external(true)
    tmdb.mockReturnValue({ status: 'failed', titles: [] })
    await render(<CatalogView titles={titles} section="all" query="zzzz" imageBase={IMG} onSelect={jest.fn()} />)
    expect(screen.getByText('Quizás te interese')).toBeTruthy()
    expect(screen.queryByText('Datos de títulos: TMDB')).toBeNull()
  })

  it('Doblaje latino searches the catalog only', async () => {
    external(true)
    await render(<CatalogView titles={titles} section="all" query="dragon" catalogOnly imageBase={IMG} onSelect={jest.fn()} />)
    expect(tmdb).toHaveBeenCalledWith('dragon', 'all', false)
  })

  it('never asks TMDB while browsing a section', async () => {
    external(true)
    await render(<CatalogView titles={titles} section="show" query="" imageBase={IMG} onSelect={jest.fn()} />)
    expect(tmdb).toHaveBeenCalledWith('', 'show', false)
  })
})
