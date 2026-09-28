import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { FocusProvider } from '../focus/FocusProvider'
import type { CatalogRow, Title } from '@go10/core/types'
import type { HeroSlide } from '@go10/core/hero/pickHero'
import { HeroCarousel } from './HeroCarousel'
import { SLIDE_MS } from './useCarousel'

function title(key: string): Title {
  const row = { video_id: `${key}1`, chapter_start_seconds: null, episode_number: null } as CatalogRow
  return {
    key, kind: 'movie', title: `Título ${key}`, year: 2001, studio: '', source: '', genre: 'Drama', genre_secondary: '',
    quality: '', language: '', subtitled: false, thumbnail: `catalogo_files/${key}.webp`, views: 0,
    durationSeconds: 0, catalogIndex: 0, seasons: [row],
  }
}
const ART = { small: 'https://image.tmdb.org/t/p/w780/a.jpg', large: 'https://image.tmdb.org/t/p/w1280/a.jpg' }
const SLIDES: HeroSlide[] = [{ title: title('a'), art: ART }, { title: title('b'), art: null }, { title: title('c'), art: ART }]

function renderCarousel(slides = SLIDES, handlers = { onPlay: vi.fn(), onInfo: vi.fn() }) {
  render(
    <FocusProvider onBack={() => {}}>
      <HeroCarousel slides={slides} {...handlers} />
    </FocusProvider>,
  )
  return handlers
}
const current = () => screen.getByRole('heading', { level: 1, hidden: false }).textContent
const press = (key: string) => fireEvent.keyDown(window, { key })
const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms))

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('HeroCarousel', () => {
  it('advances every 8 s and wraps', () => {
    renderCarousel()
    expect(current()).toBe('Título a')
    tick(SLIDE_MS - 1)
    expect(current()).toBe('Título a')
    tick(1)
    expect(current()).toBe('Título b')
    // Each slide arms its own timer after rendering, so step one slide at a time.
    tick(SLIDE_MS)
    tick(SLIDE_MS)
    expect(current()).toBe('Título a')
  })

  it('pauses while hovered and restarts the slide on leave', () => {
    renderCarousel()
    const hero = document.querySelector('.go-hero')!
    fireEvent.pointerEnter(hero)
    tick(SLIDE_MS * 3)
    expect(current()).toBe('Título a')
    fireEvent.pointerLeave(hero)
    tick(SLIDE_MS - 1)
    expect(current()).toBe('Título a')
    tick(1)
    expect(current()).toBe('Título b')
  })

  it('does not advance with reduced motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), addEventListener() {}, removeEventListener() {} }))
    try {
      renderCarousel()
      tick(SLIDE_MS * 3)
      expect(current()).toBe('Título a')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('jumps from the indicators and the arrows', () => {
    renderCarousel()
    fireEvent.click(screen.getByRole('button', { name: 'Ir a la diapositiva 3' }))
    expect(current()).toBe('Título c')
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(current()).toBe('Título a')
    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }))
    expect(current()).toBe('Título c')
  })

  it('changes slide with ← on Reproducir and → on Más información, keeping focus', () => {
    renderCarousel()
    const focused = () => document.querySelector('[data-focused="true"]')?.textContent
    expect(focused()).toMatch(/Reproducir/)
    press('ArrowLeft')
    expect(current()).toBe('Título c')
    expect(focused()).toMatch(/Reproducir/)
    press('ArrowRight') // Reproducir → Más información: a focus move, not a slide change
    expect(current()).toBe('Título c')
    expect(focused()).toMatch(/Más información/)
    press('ArrowRight')
    expect(current()).toBe('Título a')
    expect(focused()).toMatch(/Más información/)
  })

  it('a slide change restarts the 8 s', () => {
    renderCarousel()
    tick(SLIDE_MS - 1000)
    press('ArrowRight')
    press('ArrowRight') // → slide b
    tick(SLIDE_MS - 1)
    expect(current()).toBe('Título b')
  })

  it('acts on the visible slide', () => {
    const handlers = renderCarousel()
    tick(SLIDE_MS)
    press('Enter') // Reproducir holds focus
    expect(handlers.onPlay).toHaveBeenCalledWith(expect.objectContaining({ key: 'b' }), expect.objectContaining({ video_id: 'b1' }))
  })

  it('falls back to the blurred layout when a slide art fails to load', () => {
    renderCarousel()
    const art = '.go-hero_stage.is-active .go-hero_frame:not(.go-hero_frame--thumb) .go-hero_key'
    fireEvent.error(document.querySelector(art)!)
    expect(document.querySelector(art)).toBeNull()
    expect(document.querySelector('.go-hero_stage.is-active .go-backdrop')).not.toBeNull()
    expect(document.querySelector('.go-hero')!.classList.contains('has-art')).toBe(false)
  })

  it('shows one slide with no indicators, arrows or timer', () => {
    renderCarousel([SLIDES[0]])
    expect(screen.queryByRole('button', { name: /Ir a la diapositiva/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Siguiente' })).toBeNull()
    tick(SLIDE_MS * 2)
    expect(current()).toBe('Título a')
  })
})
