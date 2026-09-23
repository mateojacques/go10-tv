import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { Navbar } from './Navbar'
import { FocusProvider } from '../focus/FocusProvider'
import { useFocusable } from '../focus/useFocusable'
import type { Route } from '../router/route'

function Result() {
  const { ref, focused } = useFocusable('grid:a', 0, 0, () => {})
  return <div ref={ref} data-testid="result" data-focused={focused} />
}

function Harness({ initial, spy, onBack = () => {} }: { initial: Route; spy?: (route: Route, options?: { replace?: boolean }) => void; onBack?: () => void }) {
  const [route, setRoute] = useState<Route>(initial)
  const onNavigate = (next: Route, options?: { replace?: boolean }) => {
    spy?.(next, options)
    setRoute(next)
  }
  return (
    <FocusProvider onBack={onBack}>
      <Navbar route={route} onNavigate={onNavigate} />
      <Result />
      <output data-testid="route">{JSON.stringify(route)}</output>
    </FocusProvider>
  )
}

const press = (key: string) => fireEvent.keyDown(window, { key })
const input = () => screen.getByRole('searchbox') as HTMLInputElement
const route = () => JSON.parse(screen.getByTestId('route').textContent!)

describe('Navbar', () => {
  it('navigates to the section pages', () => {
    render(<Harness initial={{ name: 'home' }} />)
    fireEvent.click(screen.getByText('Películas'))
    expect(route()).toEqual({ name: 'catalog', section: 'movie', query: '' })
    fireEvent.click(screen.getByText('Series'))
    expect(route()).toEqual({ name: 'catalog', section: 'show', query: '' })
  })

  it('pushes the first keystroke and replaces the rest, scoped to the section', () => {
    const spy = vi.fn()
    render(<Harness initial={{ name: 'catalog', section: 'movie', query: '' }} spy={spy} />)
    fireEvent.click(input())
    fireEvent.change(input(), { target: { value: 't' } })
    expect(spy).toHaveBeenLastCalledWith({ name: 'catalog', section: 'movie', query: 't' }, { replace: false })
    fireEvent.change(input(), { target: { value: 'to' } })
    expect(spy).toHaveBeenLastCalledWith({ name: 'catalog', section: 'movie', query: 'to' }, { replace: true })
    fireEvent.change(input(), { target: { value: '' } })
    expect(spy).toHaveBeenLastCalledWith({ name: 'catalog', section: 'movie', query: '' }, { replace: true })
  })

  it('clearing a search started from Home returns Home', () => {
    render(<Harness initial={{ name: 'catalog', section: 'all', query: 'x' }} />)
    fireEvent.click(input())
    fireEvent.change(input(), { target: { value: '' } })
    expect(route()).toEqual({ name: 'home' })
  })

  it('shows a removable scope chip while searching a section', () => {
    render(<Harness initial={{ name: 'catalog', section: 'movie', query: 'toy' }} />)
    fireEvent.click(screen.getByRole('button', { name: /quitar filtro películas/i }))
    expect(route()).toEqual({ name: 'catalog', section: 'all', query: 'toy' })
    expect(screen.queryByRole('button', { name: /quitar filtro/i })).toBeNull()
    expect(document.querySelector('.go-search[data-focused="true"]')).not.toBeNull()
  })

  it('uses a scoped placeholder', () => {
    render(<Harness initial={{ name: 'catalog', section: 'show', query: '' }} />)
    expect(input().placeholder).toBe('Buscar en Series')
  })

  it('Enter starts editing; Escape stops editing without going back', () => {
    const onBack = vi.fn()
    render(<Harness initial={{ name: 'catalog', section: 'movie', query: '' }} onBack={onBack} />)
    press('ArrowUp') // result → navbar row
    // Walk right to the search box.
    press('ArrowRight'); press('ArrowRight'); press('ArrowRight')
    expect(document.querySelector('.go-search[data-focused="true"]')).not.toBeNull()
    press('Enter')
    expect(document.activeElement).toBe(input())
    press('Escape')
    expect(onBack).not.toHaveBeenCalled()
    expect(document.activeElement).not.toBe(input())
    expect(document.querySelector('.go-search[data-focused="true"]')).not.toBeNull()
  })

  it('Backspace while editing does not go back', () => {
    const onBack = vi.fn()
    render(<Harness initial={{ name: 'catalog', section: 'movie', query: 'to' }} onBack={onBack} />)
    fireEvent.click(input())
    fireEvent.keyDown(input(), { key: 'Backspace' })
    expect(onBack).not.toHaveBeenCalled()
  })

  it('Down while editing moves to the first result', () => {
    render(<Harness initial={{ name: 'catalog', section: 'movie', query: 'to' }} />)
    fireEvent.click(input())
    press('ArrowDown')
    expect(screen.getByTestId('result').dataset.focused).toBe('true')
  })
})
