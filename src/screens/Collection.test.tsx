import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FocusProvider } from '../focus/FocusProvider'
import { useFocusable } from '../focus/useFocusable'
import type { Collection as CollectionData } from '../collections/types'
import type { Title } from '../types'
import { Collection } from './Collection'

function title(key: string, name: string): Title {
  return {
    key, kind: 'movie', title: name, year: null, studio: '', genre: '', genre_secondary: '',
    quality: '', language: '', subtitled: false, thumbnail: '', views: 0,
    durationSeconds: 0, catalogIndex: 0, seasons: [],
  }
}

const CN: CollectionData = {
  id: 'cartoon-network',
  name: 'Cartoon Network',
  order: 1,
  logo: 'assets/collections/cartoon-network/logo.svg',
  tile: { color: '#e4007c' },
  titles: ['c', 'a', 'b'],
}

const TITLES = [title('c', 'Coraje'), title('a', 'Hora de Aventura'), title('b', 'Chowder')]

function NavStub() {
  const { ref, focused } = useFocusable('nav:search', -2, 3, () => {}, { claimsInitialFocus: false })
  return <div ref={ref} data-testid="nav" data-focused={focused} />
}

function renderPage(onSelect = vi.fn()) {
  render(
    <FocusProvider onBack={() => {}}>
      <NavStub />
      <Collection collection={CN} titles={TITLES} onSelect={onSelect} />
    </FocusProvider>,
  )
  return onSelect
}

const press = (key: string) => fireEvent.keyDown(window, { key })

describe('Collection', () => {
  it('headings the page with the logo, named after the collection, and no visible title or count', () => {
    renderPage()
    const heading = screen.getByRole('heading', { level: 1, name: 'Cartoon Network' })
    expect(heading.querySelector('img')?.getAttribute('alt')).toBe('Cartoon Network')
    expect(heading.textContent).toBe('')
    expect(document.querySelector('.go-row_count')).toBeNull()
  })

  it('shows a banner in the tile colour with the logo', () => {
    renderPage()
    const banner = document.querySelector('.go-collection_banner') as HTMLElement
    expect(banner.style.backgroundColor).toBe('rgb(228, 0, 124)')
    expect(banner.querySelector('img')?.getAttribute('src')).toBe('/assets/collections/cartoon-network/logo.svg')
  })

  it('lists the titles in collection order and opens one with Enter', () => {
    const onSelect = renderPage()
    const cards = [...document.querySelectorAll('.go-card')].map((c) => c.getAttribute('aria-label'))
    expect(cards).toEqual(['Coraje', 'Hora de Aventura', 'Chowder'])
    press('Enter')
    expect(onSelect).toHaveBeenCalledWith(TITLES[0])
  })

  it('reaches the navbar with Up from the grid', () => {
    renderPage()
    press('ArrowUp')
    expect(screen.getByTestId('nav').getAttribute('data-focused')).toBe('true')
  })

  it('lives in the catalog scroller so lazy batching and the navbar offset work', () => {
    renderPage()
    expect(document.querySelector('.go-catalog.go-collection')).not.toBeNull()
  })
})
