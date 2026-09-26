import { render, screen, userEvent } from '@testing-library/react-native'
import type { Collection } from '@go10/core/collections/types'
import type { Title } from '@go10/core/types'
import { CollectionView } from './CollectionView'

const t = (key: string, title: string): Title => ({
  key, kind: 'movie', title, year: 2001, studio: '', source: '', genre: '', genre_secondary: '', quality: '', language: '',
  subtitled: false, thumbnail: '', views: 0, durationSeconds: 0, catalogIndex: 0, seasons: [],
})
const pixar: Collection = {
  id: 'pixar', name: 'Pixar', order: 1, logo: 'assets/collections/pixar/logo.svg',
  tile: { color: '#123456', background: 'assets/collections/pixar/bg.webp' }, titles: ['b', 'a'],
}
const IMG = 'https://tv.test/'

describe('CollectionView', () => {
  it('heads the grid with the collection banner and keeps its order', async () => {
    await render(<CollectionView collection={pixar} titles={[t('b', 'Toy Story'), t('a', 'Cars')]} imageBase={IMG} onSelect={jest.fn()} onBack={jest.fn()} />)
    expect(screen.getByRole('header', { name: 'Pixar' })).toBeTruthy()
    expect(screen.getByTestId('collection-logo').props.source).toEqual([{ uri: 'https://tv.test/assets/collections/pixar/logo.svg' }])
    expect(screen.getByTestId('collection-background').props.source).toEqual([{ uri: 'https://tv.test/assets/collections/pixar/bg.webp' }])
    const cards = screen.getAllByRole('button').filter((b) => b.props.accessibilityLabel !== 'Volver')
    expect(cards.map((c) => c.props.accessibilityLabel)).toEqual(['Toy Story', 'Cars'])
    expect(cards[0].props.hasTVPreferredFocus).toBe(true)
  })

  it('opens a title and goes back', async () => {
    const onSelect = jest.fn()
    const onBack = jest.fn()
    const titles = [t('b', 'Toy Story')]
    await render(<CollectionView collection={{ ...pixar, tile: { color: '#000' } }} titles={titles} imageBase={IMG} onSelect={onSelect} onBack={onBack} />)
    expect(screen.queryByTestId('collection-background')).toBeNull()
    const user = userEvent.setup()
    await user.press(screen.getByRole('button', { name: 'Toy Story' }))
    await user.press(screen.getByRole('button', { name: 'Volver' }))
    expect(onSelect).toHaveBeenCalledWith(titles[0])
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
