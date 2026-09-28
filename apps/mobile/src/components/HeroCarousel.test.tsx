import { act, fireEvent, render, screen } from '@testing-library/react-native'
import type { HeroSlide } from '@go10/core/hero/pickHero'
import type { CatalogRow, Title } from '@go10/core/types'
import { HeroCarousel, SLIDE_MS } from './HeroCarousel'

const title = (key: string): Title => ({
  key, kind: 'movie', title: `Título ${key}`, year: 2001, studio: '', source: '', genre: 'Drama', genre_secondary: '',
  quality: '', language: '', subtitled: false, thumbnail: `catalogo_files/${key}.webp`, views: 0, durationSeconds: 0, catalogIndex: 0,
  seasons: [{ video_id: `${key}1`, type: 'movie' } as CatalogRow],
})
const SLIDES: HeroSlide[] = [{ title: title('a'), art: null }, { title: title('b'), art: null }, { title: title('c'), art: null }]
const props = () => ({ slides: SLIDES, imageBase: 'https://tv.test/', progress: {}, onPlayTitle: jest.fn(), onSelectTitle: jest.fn() })
const active = () => screen.getByTestId('hero-carousel').props.accessibilityValue?.now

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

describe('HeroCarousel (phone)', () => {
  it('renders every slide in a pager', async () => {
    await render(<HeroCarousel {...props()} />)
    expect(screen.getAllByRole('header', { name: /Título/ })).toHaveLength(3)
    expect(screen.getByRole('header', { name: 'Título c' })).toBeTruthy()
  })

  it('advances every 8 s and wraps', async () => {
    await render(<HeroCarousel {...props()} />)
    expect(active()).toBe(1)
    await act(async () => {
      jest.advanceTimersByTime(SLIDE_MS)
    })
    expect(active()).toBe(2)
    // Each slide arms its own timer after rendering, so step one slide at a time.
    for (let i = 0; i < 2; i++) {
      await act(async () => {
        jest.advanceTimersByTime(SLIDE_MS)
      })
    }
    expect(active()).toBe(1)
  })

  it('pauses while a finger is down', async () => {
    await render(<HeroCarousel {...props()} />)
    await fireEvent(screen.getByTestId('hero-carousel'), 'touchStart')
    await act(async () => {
      jest.advanceTimersByTime(SLIDE_MS * 3)
    })
    expect(active()).toBe(1)
    await fireEvent(screen.getByTestId('hero-carousel'), 'touchEnd')
    await act(async () => {
      jest.advanceTimersByTime(SLIDE_MS)
    })
    expect(active()).toBe(2)
  })

  it('follows a swipe', async () => {
    await render(<HeroCarousel {...props()} />)
    await fireEvent(screen.getByTestId('hero-pager'), 'momentumScrollEnd', { nativeEvent: { contentOffset: { x: 2 * 750, y: 0 }, layoutMeasurement: { width: 750, height: 400 } } })
    expect(active()).toBe(3)
  })

  it('plays and opens each slide from its own buttons', async () => {
    const p = props()
    await render(<HeroCarousel {...p} />)
    await fireEvent.press(screen.getAllByRole('button', { name: 'Reproducir' })[1])
    await fireEvent.press(screen.getAllByRole('button', { name: 'Más información' })[2])
    expect(p.onPlayTitle).toHaveBeenCalledWith(expect.objectContaining({ key: 'b' }), expect.objectContaining({ video_id: 'b1' }))
    expect(p.onSelectTitle).toHaveBeenCalledWith(expect.objectContaining({ key: 'c' }))
  })

  it('a single slide has no timer', async () => {
    await render(<HeroCarousel {...props()} slides={[SLIDES[0]]} />)
    await act(async () => {
      jest.advanceTimersByTime(SLIDE_MS * 2)
    })
    expect(active()).toBe(1)
  })
})
