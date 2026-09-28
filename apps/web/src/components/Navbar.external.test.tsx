import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { Navbar } from './Navbar'
import { FocusProvider } from '../focus/FocusProvider'
import { useFocusable } from '../focus/useFocusable'
import type { Route } from '@go10/core/router/route'
import { enableExternalTitles } from '@go10/core/external/testing'

function Result() {
  const { ref, focused } = useFocusable('grid:a', 0, 0, () => {})
  return <div ref={ref} tabIndex={-1} data-testid="grid:a" data-focused={focused} />
}

function Harness({ initial, spy }: { initial: Route; spy?: (route: Route, options?: { replace?: boolean }) => void }) {
  const [route, setRoute] = useState<Route>(initial)
  const onNavigate = (next: Route, options?: { replace?: boolean }) => {
    spy?.(next, options)
    setRoute(next)
  }
  return (
    <FocusProvider onBack={() => {}}>
      <Navbar route={route} onNavigate={onNavigate} />
      <Result />
    </FocusProvider>
  )
}

const input = () => screen.getByRole('searchbox') as HTMLInputElement

afterEach(() => vi.unstubAllEnvs())

describe('Navbar source chip (external titles on)', () => {
  beforeEach(() => enableExternalTitles())

  it('cycles Todas → Doblaje latino → Lenguaje original in place', () => {
    const spy = vi.fn()
    render(<Harness initial={{ name: 'catalog', section: 'all', query: 'bat' }} spy={spy} />)

    fireEvent.click(screen.getByText('Todas', { selector: '.go-nav_source' }))
    expect(spy).toHaveBeenLastCalledWith({ name: 'catalog', section: 'all', query: 'bat', source: 'catalog' }, { replace: true })

    fireEvent.click(screen.getByText('Doblaje latino', { selector: '.go-nav_source' }))
    expect(spy).toHaveBeenLastCalledWith({ name: 'catalog', section: 'all', query: 'bat', source: 'tmdb' }, { replace: true })

    fireEvent.click(screen.getByText('Lenguaje original', { selector: '.go-nav_source' }))
    expect(spy).toHaveBeenLastCalledWith({ name: 'catalog', section: 'all', query: 'bat' }, { replace: true })
  })

  it('keeps the source while typing and when the section chip is removed', () => {
    const spy = vi.fn()
    render(<Harness initial={{ name: 'catalog', section: 'movie', query: 'bat', source: 'catalog' }} spy={spy} />)

    fireEvent.click(input())
    fireEvent.change(input(), { target: { value: 'batm' } })
    expect(spy).toHaveBeenLastCalledWith({ name: 'catalog', section: 'movie', query: 'batm', source: 'catalog' }, { replace: true })

    fireEvent.click(screen.getByLabelText('Quitar filtro Películas'))
    expect(spy).toHaveBeenLastCalledWith({ name: 'catalog', section: 'all', query: 'batm', source: 'catalog' }, { replace: true })
  })

  it('still sends Enter from the search box to the first result, not the chip', () => {
    render(<Harness initial={{ name: 'catalog', section: 'all', query: 'bat' }} />)
    fireEvent.click(input())
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(screen.getByTestId('grid:a').dataset.focused).toBe('true')
  })

  it('has no chip without a query', () => {
    render(<Harness initial={{ name: 'catalog', section: 'movie', query: '' }} />)
    expect(screen.queryByText('Todas', { selector: '.go-nav_source' })).toBeNull()
  })
})

describe('Navbar source chip (external titles off)', () => {
  it('is never shown', () => {
    render(<Harness initial={{ name: 'catalog', section: 'all', query: 'bat' }} />)
    expect(screen.queryByText('Todas', { selector: '.go-nav_source' })).toBeNull()
  })
})

describe('Navbar phone scope menu (external titles on)', () => {
  beforeEach(() => enableExternalTitles())

  it('offers the source group alongside the section while searching', () => {
    const spy = vi.fn()
    render(<Harness initial={{ name: 'catalog', section: 'show', query: 'bat' }} spy={spy} />)
    fireEvent.click(screen.getByRole('button', { name: 'Buscar en: Series' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Doblaje latino' }))
    expect(spy).toHaveBeenLastCalledWith(
      { name: 'catalog', section: 'show', query: 'bat', source: 'catalog' },
      { replace: true },
    )
  })
})
