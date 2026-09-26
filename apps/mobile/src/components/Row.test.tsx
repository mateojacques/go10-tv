import { render, screen } from '@testing-library/react-native'
import type { Title } from '@go10/core/types'
import { Row } from './Row'

const title = (key: string): Title => ({
  key, kind: 'movie', title: `Título ${key}`, year: 2001, studio: '', source: '', genre: '', genre_secondary: '',
  quality: '', language: '', subtitled: false, thumbnail: '', views: 0, durationSeconds: 0, catalogIndex: 0, seasons: [],
})

describe('Row', () => {
  it('heads its cards with the label and count, like the web', async () => {
    await render(<Row group={{ id: 'series', label: 'Series', titles: [title('a'), title('b')] }} imageBase="https://tv.test/" onSelect={jest.fn()} />)
    expect(screen.getByRole('header', { name: /Series/ })).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Título a' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Título b' })).toBeTruthy()
  })
})
