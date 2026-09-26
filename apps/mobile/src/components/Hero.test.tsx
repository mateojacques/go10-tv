import { render, screen, userEvent } from '@testing-library/react-native'
import type { CatalogRow, Title } from '@go10/core/types'
import { Hero } from './Hero'

const spidey: Title = {
  key: 'spidey', kind: 'show', title: 'Spidey y sus Sorprendentes Amigos', year: 2021, studio: 'Disney', source: '',
  genre: 'Animación', genre_secondary: 'Infantil', quality: '1080p', language: 'Español', subtitled: false,
  thumbnail: 'assets/spidey/thumb.webp', views: 0, durationSeconds: 0, catalogIndex: 0,
  seasons: [{ season_number: 1 }, { season_number: 2 }] as CatalogRow[],
}
const ART = { small: 'assets/spidey/spidey-hero-960.webp', large: 'assets/spidey/spidey-hero-1920.webp' }
const IMG = 'https://tv.test/'

describe('Hero', () => {
  it('presents the featured title like the web hero', async () => {
    await render(<Hero title={spidey} art={ART} imageBase={IMG} onPlay={jest.fn()} onInfo={jest.fn()} />)
    expect(screen.getByText('Destacado')).toBeTruthy()
    expect(screen.getByText(/Serie · Disney/)).toBeTruthy()
    expect(screen.getByRole('header', { name: 'Spidey y sus Sorprendentes Amigos' })).toBeTruthy()
    expect(screen.getByText('2 temporadas')).toBeTruthy()
    expect(screen.getByText('Animación')).toBeTruthy()
    expect(screen.getByText('Infantil')).toBeTruthy()
    expect(screen.getByTestId('hero-art').props.source).toEqual([{ uri: 'https://tv.test/assets/spidey/spidey-hero-1920.webp' }])
  })

  it('plays and opens the title from its two buttons, Reproducir taking focus first on TV', async () => {
    const onPlay = jest.fn()
    const onInfo = jest.fn()
    await render(<Hero title={spidey} art={ART} imageBase={IMG} onPlay={onPlay} onInfo={onInfo} />)
    const play = screen.getByRole('button', { name: 'Reproducir' })
    expect(play.props.hasTVPreferredFocus).toBe(true)
    const user = userEvent.setup()
    await user.press(play)
    await user.press(screen.getByRole('button', { name: 'Más información' }))
    expect(onPlay).toHaveBeenCalledTimes(1)
    expect(onInfo).toHaveBeenCalledTimes(1)
  })

  it('without key art, blurs the thumbnail behind and shows it crisp', async () => {
    await render(<Hero title={{ ...spidey, key: 'other' }} art={null} imageBase={IMG} onPlay={jest.fn()} onInfo={jest.fn()} />)
    expect(screen.queryByTestId('hero-art')).toBeNull()
    expect(screen.getByTestId('hero-backdrop').props.source).toEqual([{ uri: 'https://tv.test/assets/spidey/thumb.webp' }])
    expect(screen.getByTestId('hero-thumb').props.source).toEqual([{ uri: 'https://tv.test/assets/spidey/thumb.webp' }])
  })

  it('requests nothing without key art or a thumbnail', async () => {
    await render(<Hero title={{ ...spidey, key: 'other', thumbnail: '' }} art={null} imageBase={IMG} onPlay={jest.fn()} onInfo={jest.fn()} />)
    expect(screen.queryByTestId('hero-backdrop')).toBeNull()
    expect(screen.queryByTestId('hero-thumb')).toBeNull()
    expect(screen.getByRole('button', { name: 'Reproducir' })).toBeTruthy()
  })
})
