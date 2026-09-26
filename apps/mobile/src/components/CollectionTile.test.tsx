import { render, screen, userEvent } from '@testing-library/react-native'
import type { Collection } from '@go10/core/collections/types'
import { CollectionTile } from './CollectionTile'

const collection = (tile: Collection['tile']): Collection => ({
  id: 'pixar', name: 'Pixar', order: 1, logo: 'assets/collections/pixar/logo.svg', tile, titles: ['a'],
})

describe('CollectionTile', () => {
  it('shows the logo on the tile colour and opens the collection', async () => {
    const onSelect = jest.fn()
    const c = collection({ color: '#0a3d62' })
    await render(<CollectionTile collection={c} imageBase="https://tv.test/" onSelect={onSelect} />)
    const tile = screen.getByRole('button', { name: 'Pixar' })
    expect(screen.getByTestId('tile-logo').props.source).toEqual([{ uri: 'https://tv.test/assets/collections/pixar/logo.svg' }])
    expect(screen.getByTestId('tile-surface')).toHaveStyle({ backgroundColor: '#0a3d62' })
    await userEvent.setup().press(tile)
    expect(onSelect).toHaveBeenCalledWith(c)
  })

  it('draws the background art only when the collection has one', async () => {
    await render(<CollectionTile collection={collection({ color: '#000' })} imageBase="https://tv.test/" onSelect={jest.fn()} />)
    expect(screen.queryByTestId('tile-background')).toBeNull()
  })
})
