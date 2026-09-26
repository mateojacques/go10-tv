import { render, screen } from '@testing-library/react-native'
import type { Title } from '@go10/core/types'
import { TitleList } from './TitleList'

const title = (key: string, name: string, thumbnail: string): Title => ({
  key, kind: 'movie', title: name, year: null, studio: '', source: '', genre: '', genre_secondary: '',
  quality: '', language: '', subtitled: false, thumbnail, views: 0, durationSeconds: 0, catalogIndex: 0, seasons: [],
})

describe('TitleList', () => {
  it('lists every title with its count', async () => {
    await render(<TitleList titles={[title('a', 'Coraje', 'catalogo_files/a.webp'), title('b', 'Chowder', 'catalogo_files/b.webp')]} imageBase="https://tv.test/" />)
    expect(screen.getByText('2 títulos')).toBeTruthy()
    expect(screen.getByText('Coraje')).toBeTruthy()
    expect(screen.getByText('Chowder')).toBeTruthy()
  })

  it('loads catalog art from the site and TMDB art as-is', async () => {
    await render(<TitleList titles={[title('a', 'Coraje', 'catalogo_files/a.webp'), title('t', 'Film', 'https://image.tmdb.org/t/p/w780/x.jpg')]} imageBase="https://tv.test/" />)
    // expo-image normalises `source` to an array on the rendered view.
    expect(screen.getByLabelText('Coraje').props.source).toEqual([{ uri: 'https://tv.test/catalogo_files/a.webp' }])
    expect(screen.getByLabelText('Film').props.source).toEqual([{ uri: 'https://image.tmdb.org/t/p/w780/x.jpg' }])
  })
})
