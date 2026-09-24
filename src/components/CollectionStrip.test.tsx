import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FocusProvider } from '../focus/FocusProvider'
import type { Collection } from '../collections/types'
import { CollectionStrip } from './CollectionStrip'

const collection = (id: string, name: string, extra: Partial<Collection> = {}): Collection => ({
  id,
  name,
  order: 1,
  logo: `assets/collections/${id}/logo.svg`,
  tile: { color: '#e4007c' },
  titles: ['a'],
  ...extra,
})

const CN = collection('cartoon-network', 'Cartoon Network')
const MARVEL = collection('marvel', 'Marvel', {
  tile: { color: '#000000', background: 'assets/collections/marvel/tile.webp' },
})

function renderStrip(onSelect = vi.fn()) {
  render(
    <FocusProvider onBack={() => {}}>
      <CollectionStrip collections={[CN, MARVEL]} rowIndex={0} onSelect={onSelect} />
    </FocusProvider>,
  )
  return onSelect
}

const press = (key: string) => fireEvent.keyDown(window, { key })
const focused = () => document.querySelector('[data-focused="true"]')?.getAttribute('aria-label')

describe('CollectionStrip', () => {
  it('is a navigation landmark of tiles named after their collections', () => {
    renderStrip()
    const nav = screen.getByRole('navigation', { name: 'Colecciones' })
    const tiles = nav.querySelectorAll('[role="button"]')
    expect([...tiles].map((t) => t.getAttribute('aria-label'))).toEqual(['Cartoon Network', 'Marvel'])
  })

  it('paints the tile color and shows the logo', () => {
    renderStrip()
    const tile = screen.getByRole('button', { name: 'Cartoon Network' })
    expect(tile.style.backgroundColor).toBe('rgb(228, 0, 124)')
    expect(tile.querySelector('.go-tile_logo')?.getAttribute('src')).toBe('/assets/collections/cartoon-network/logo.svg')
    expect(tile.querySelector('.go-tile_bg')).toBeNull()
  })

  it('layers the background art when a tile has one', () => {
    renderStrip()
    const tile = screen.getByRole('button', { name: 'Marvel' })
    expect(tile.querySelector('.go-tile_bg')?.getAttribute('src')).toBe('/assets/collections/marvel/tile.webp')
  })

  it('moves between tiles with the arrows and selects with Enter', () => {
    const onSelect = renderStrip()
    expect(focused()).toBe('Cartoon Network')
    press('ArrowRight')
    expect(focused()).toBe('Marvel')
    press('Enter')
    expect(onSelect).toHaveBeenCalledWith(MARVEL)
  })

  it('selects a tile on click', () => {
    const onSelect = renderStrip()
    fireEvent.click(screen.getByRole('button', { name: 'Cartoon Network' }))
    expect(onSelect).toHaveBeenCalledWith(CN)
  })
})
