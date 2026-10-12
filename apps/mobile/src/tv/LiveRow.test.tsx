import { fireEvent, render, screen } from '@testing-library/react-native'
import { resolveLineup } from '@go10/core/tv/lineup'
import { collectionOf, showTitle } from '@go10/core/tv/testing'
import { LiveRow } from './LiveRow'

const lineup = resolveLineup(
  {
    epoch: '2026-10-01T00:00:00Z',
    defaultChannel: 'a',
    channels: [
      { id: 'a', number: 1, collection: 'a' },
      { id: 'b', number: 2, collection: 'b' },
    ],
  },
  [collectionOf('a', ['s1']), collectionOf('b', ['s2'])],
  [showTitle('s1', 3, 600), showTitle('s2', 3, 600)],
)!

const mixed = resolveLineup(
  {
    epoch: '2026-10-01T00:00:00Z',
    defaultChannel: 'a',
    channels: [
      { id: 'a', number: 1, collection: 'a' },
      { id: 'b', number: 101, collection: 'b' },
    ],
  },
  [collectionOf('a', ['s1']), { ...collectionOf('b', ['s2']), group: 'franchise' as const }],
  [showTitle('s1', 3, 600), showTitle('s2', 3, 600)],
)!

describe('LiveRow', () => {
  it('lists every channel under "En vivo ahora", and a tile watches it', async () => {
    const onWatch = jest.fn()
    await render(<LiveRow lineup={lineup} imageBase="https://tv.test/" onWatch={onWatch} />)
    expect(screen.getByText('En vivo ahora')).toBeTruthy()
    expect(screen.getByLabelText(/^1 /)).toBeTruthy()
    await fireEvent.press(screen.getByLabelText(/^2 /))
    expect(onWatch).toHaveBeenCalledWith('b')
  })

  it('shows networks under "Canales" and franchises under "24/7"', async () => {
    await render(<LiveRow lineup={mixed} imageBase="https://tv.test/" onWatch={jest.fn()} />)
    expect(screen.getByText('Canales')).toBeTruthy()
    expect(screen.getByText('24/7')).toBeTruthy()
    expect(screen.getByLabelText(/^101 /)).toBeTruthy()
  })

  it('shows no "24/7" label without franchise channels', async () => {
    await render(<LiveRow lineup={lineup} imageBase="https://tv.test/" onWatch={jest.fn()} />)
    expect(screen.queryByText('24/7')).toBeNull()
  })
})
