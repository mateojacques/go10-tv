import { render, screen, userEvent } from '@testing-library/react-native'
import type { CatalogRow, Title } from '@go10/core/types'
import { Card } from './Card'

function title(overrides: Partial<Title> = {}): Title {
  return {
    key: 'k', kind: 'movie', title: 'Coraje', year: 2001, studio: '', source: '', genre: 'Animación', genre_secondary: '',
    quality: '1080p', language: 'Español', subtitled: false, thumbnail: 'catalogo_files/a.webp', views: 0,
    durationSeconds: 5400, catalogIndex: 0, seasons: [], ...overrides,
  }
}
const IMG = 'https://tv.test/'

describe('Card', () => {
  it('shows the title, its year and genre, and its art from the site', async () => {
    await render(<Card title={title()} imageBase={IMG} onSelect={jest.fn()} />)
    expect(screen.getByText('Coraje')).toBeTruthy()
    expect(screen.getByText('2001 · Animación')).toBeTruthy()
    expect(screen.getByTestId('card-image').props.source).toEqual([{ uri: 'https://tv.test/catalogo_files/a.webp' }])
  })

  it('tags 4K and a show’s seasons', async () => {
    const seasons = [{ season_number: 1 }, { season_number: 2 }] as CatalogRow[]
    await render(<Card title={title({ quality: '4K', kind: 'show', seasons })} imageBase={IMG} onSelect={jest.fn()} />)
    expect(screen.getByText('4K')).toBeTruthy()
    expect(screen.getByText('2 Temporadas')).toBeTruthy()
  })

  it('selects its title when pressed', async () => {
    const onSelect = jest.fn()
    const t = title()
    await render(<Card title={t} imageBase={IMG} onSelect={onSelect} />)
    await userEvent.setup().press(screen.getByRole('button', { name: 'Coraje' }))
    expect(onSelect).toHaveBeenCalledWith(t)
  })

  it('keeps a long name on one line', async () => {
    await render(<Card title={title({ title: 'Un título larguísimo que no entra en una tarjeta de catálogo' })} imageBase={IMG} onSelect={jest.fn()} />)
    expect(screen.getByText('Un título larguísimo que no entra en una tarjeta de catálogo').props.numberOfLines).toBe(1)
  })

  it('shows the placeholder surface, and requests nothing, without a thumbnail', async () => {
    await render(<Card title={title({ thumbnail: '' })} imageBase={IMG} onSelect={jest.fn()} />)
    expect(screen.queryByTestId('card-image')).toBeNull()
  })
})
