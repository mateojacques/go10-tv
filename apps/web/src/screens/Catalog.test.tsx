import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Catalog } from './Catalog'
import { FocusProvider } from '../focus/FocusProvider'
import { useFocusable } from '../focus/useFocusable'
import type { Title } from '../types'

function title(key: string, name: string, kind: Title['kind'] = 'movie'): Title {
  return {
    key, kind, title: name, year: null, studio: '', source: '', genre: '', genre_secondary: '',
    quality: '', language: '', subtitled: false, thumbnail: '', views: 0,
    durationSeconds: 0, catalogIndex: 0, seasons: [],
  }
}

const MOVIES = Array.from({ length: 12 }, (_, i) => title(`m${i}`, `Movie ${i}`))

function NavStub() {
  const { ref, focused } = useFocusable('nav:search', -2, 3, () => {}, { claimsInitialFocus: false })
  return <div ref={ref} data-testid="nav" data-focused={focused} />
}

function renderCatalog(props: Partial<Parameters<typeof Catalog>[0]> = {}) {
  return render(
    <FocusProvider onBack={() => {}}>
      <NavStub />
      <Catalog titles={MOVIES} section="movie" query="" onSelect={() => {}} {...props} />
    </FocusProvider>,
  )
}

const press = (key: string) => fireEvent.keyDown(window, { key })
const focusedCard = () => document.querySelector('.go-card[data-focused="true"]')?.getAttribute('aria-label')

describe('Catalog', () => {
  it('headers a section browse with its count', () => {
    renderCatalog()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Películas')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('12')
  })

  it('headers search results', () => {
    renderCatalog({ query: 'movie 3' })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Resultados para "movie 3"')
  })

  it('shows suggestions when nothing matches', () => {
    renderCatalog({ query: 'xqzvw' })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Sin resultados para "xqzvw"')
    expect(screen.getByText('Quizás te interese')).toBeTruthy()
    expect(document.querySelectorAll('.go-card').length).toBeGreaterThan(0)
  })

  it('lays cards out in a 5-column focus grid', () => {
    renderCatalog()
    expect(focusedCard()).toBe('Movie 0')
    press('ArrowDown')
    expect(focusedCard()).toBe('Movie 5')
    press('ArrowRight')
    expect(focusedCard()).toBe('Movie 6')
    press('ArrowDown'); press('ArrowRight'); press('ArrowRight'); press('ArrowRight')
    expect(focusedCard()).toBe('Movie 11') // short last row: stays on nearest
  })

  it('goes from the grid up to the navbar and back down with few results', () => {
    renderCatalog({ titles: MOVIES.slice(0, 2) })
    press('ArrowUp')
    expect(screen.getByTestId('nav').dataset.focused).toBe('true')
    // The search box sits at col 3; the nearest of two cards is the second.
    press('ArrowDown')
    expect(focusedCard()).toBe('Movie 1')
  })

  it('renders every card when IntersectionObserver is unavailable', () => {
    renderCatalog({ titles: Array.from({ length: 130 }, (_, i) => title(`t${i}`, `T ${i}`)) })
    expect(document.querySelectorAll('.go-card')).toHaveLength(130)
  })

  it('handles an empty section', () => {
    renderCatalog({ titles: [], section: 'show' })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Series')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('0')
    expect(screen.getByText('No hay títulos.')).toBeTruthy()
  })
})
