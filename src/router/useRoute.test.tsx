import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRoute } from './useRoute'

beforeEach(() => {
  window.history.replaceState({}, '', '/')
})

describe('useRoute', () => {
  it('reads the initial route from the current URL', () => {
    window.history.replaceState({}, '', '/title/abc')
    const { result } = renderHook(() => useRoute())
    expect(result.current.route).toEqual({ name: 'title', key: 'abc' })
  })

  it('navigate pushes a new history entry and updates the route', () => {
    const { result } = renderHook(() => useRoute())
    act(() => {
      result.current.navigate({ name: 'title', key: 'abc' })
    })
    expect(result.current.route).toEqual({ name: 'title', key: 'abc' })
    expect(window.location.pathname).toBe('/title/abc')
  })

  it('navigate with replace does not grow history length', () => {
    const { result } = renderHook(() => useRoute())
    const before = window.history.length
    act(() => {
      result.current.navigate({ name: 'title', key: 'abc' }, { replace: true })
    })
    expect(window.history.length).toBe(before)
    expect(window.location.pathname).toBe('/title/abc')
  })

  it('updates the route when a popstate event fires (browser back/forward)', () => {
    const { result } = renderHook(() => useRoute())
    act(() => {
      result.current.navigate({ name: 'title', key: 'abc' })
    })
    act(() => {
      window.history.pushState({}, '', '/title/xyz')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(result.current.route).toEqual({ name: 'title', key: 'xyz' })
  })

  it('reads the query string from the initial URL', () => {
    window.history.replaceState({}, '', '/buscar?q=toy&en=peliculas')
    const { result } = renderHook(() => useRoute())
    expect(result.current.route).toEqual({ name: 'catalog', section: 'movie', query: 'toy' })
  })
})
