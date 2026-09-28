import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FocusProvider } from '../focus/FocusProvider'
import type { Collection } from '@go10/core/collections/types'
import type { CatalogRow, Title } from '@go10/core/types'
import { Home } from './Home'

function title(key: string, name: string): Title {
  const row = { video_id: key, chapter_start_seconds: null, episode_number: null } as CatalogRow
  return {
    key, kind: 'movie', title: name, year: null, studio: '', source: '', genre: '', genre_secondary: '',
    quality: '', language: '', subtitled: false, thumbnail: '', views: 0,
    durationSeconds: 0, catalogIndex: 0, seasons: [row],
  }
}

const TITLES = [{ ...title('m0', 'Movie 0'), genre: 'Drama' }, title('m1', 'Movie 1'), title('m2', 'Movie 2')]
// m0 has a backdrop, so it's the hero.
const HERO_ART = { m0: { tmdb: 'movie/1', backdrop: '/m0.jpg' } }

const collection = (id: string, name: string, titles: string[]): Collection => ({
  id, name, order: 1, logo: `assets/collections/${id}/logo.svg`, tile: { color: '#e4007c' }, titles,
})

const CN = collection('cartoon-network', 'Cartoon Network', ['m1'])
const STALE = collection('stale', 'Stale', ['gone'])

function renderHome(collections: Collection[], onOpenCollection = vi.fn()) {
  render(
    <FocusProvider onBack={() => {}}>
      <Home titles={TITLES} heroArt={HERO_ART} onSelect={() => {}} onResume={() => {}} collections={collections} onOpenCollection={onOpenCollection} />
    </FocusProvider>,
  )
  return onOpenCollection
}

const press = (key: string) => fireEvent.keyDown(window, { key })
const focusedLabel = () => document.querySelector('[data-focused="true"]')?.getAttribute('aria-label')

beforeEach(() => localStorage.clear())

describe('Home collections strip', () => {
  it('sits between the hero and the first row', () => {
    renderHome([CN])
    const nav = screen.getByRole('navigation', { name: 'Colecciones' })
    expect(nav.parentElement?.classList.contains('go-rows')).toBe(true)
    expect(nav.parentElement?.previousElementSibling?.classList.contains('go-hero')).toBe(true)
    expect(nav.nextElementSibling?.classList.contains('go-row')).toBe(true)
  })

  it('only shows collections with titles in the catalog', () => {
    renderHome([STALE, CN])
    const tiles = screen.getByRole('navigation', { name: 'Colecciones' }).querySelectorAll('[role="button"]')
    expect([...tiles].map((t) => t.getAttribute('aria-label'))).toEqual(['Cartoon Network'])
  })

  it('goes hero → tiles → first row with Down, and opens a tile with Enter', () => {
    const onOpenCollection = renderHome([CN])
    press('ArrowDown')
    expect(focusedLabel()).toBe('Cartoon Network')
    press('Enter')
    expect(onOpenCollection).toHaveBeenCalledWith(CN)
    press('ArrowDown')
    expect(focusedLabel()).toBe('Movie 0')
  })

  it('renders no strip and keeps hero → first row when no collection is visible', () => {
    renderHome([STALE])
    expect(screen.queryByRole('navigation', { name: 'Colecciones' })).toBeNull()
    press('ArrowDown')
    expect(focusedLabel()).toBe('Movie 0')
  })

  it('shows no hero when no title has art, never a title without one', () => {
    render(
      <FocusProvider onBack={() => {}}>
        <Home titles={TITLES} heroArt={{}} onSelect={() => {}} onResume={() => {}} collections={[]} onOpenCollection={vi.fn()} />
      </FocusProvider>,
    )
    expect(document.querySelector('.go-hero')).toBeNull()
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    expect(document.querySelector('.go-home_top')).not.toBeNull()
    expect(focusedLabel()).toBe('Movie 0')
  })
})
