import { render, screen, userEvent } from '@testing-library/react-native'
import type { Title } from '@go10/core/types'
import { CatalogView } from './CatalogView'

const t = (key: string, title: string, kind: Title['kind'] = 'movie'): Title => ({
  key, kind, title, year: 2001, studio: '', source: '', genre: '', genre_secondary: '', quality: '', language: '',
  subtitled: false, thumbnail: '', views: 0, durationSeconds: 0, catalogIndex: 0, seasons: [],
})
const titles = [t('a', 'Coraje'), t('b', 'Dragon Ball', 'show'), t('c', 'Digimon', 'show')]
const IMG = 'https://tv.test/'

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
})
