import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useHeroArt } from './useHeroArt'

afterEach(() => vi.unstubAllGlobals())

const SIDECAR = JSON.stringify({ schema_version: 1, items: { a: { tmdb: 'movie/1', backdrop: '/a.jpg' } } })

describe('useHeroArt', () => {
  it('is null while loading, then the index', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(SIDECAR) }))
    const { result } = renderHook(() => useHeroArt())
    expect(result.current).toBeNull()
    await waitFor(() => expect(result.current).toEqual({ a: { tmdb: 'movie/1', backdrop: '/a.jpg' } }))
    expect(fetch).toHaveBeenCalledWith('/data/hero_art.json')
  })

  it.each([
    ['a 404', () => Promise.resolve({ ok: false, text: () => Promise.resolve('') })],
    ['an HTML fallback page', () => Promise.resolve({ ok: true, text: () => Promise.resolve('<!doctype html>') })],
    ['a network error', () => Promise.reject(new Error('offline'))],
  ])('settles to {} on %s', async (_, response) => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(response))
    const { result } = renderHook(() => useHeroArt())
    await waitFor(() => expect(result.current).toEqual({}))
  })

  it('fetches once per page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(SIDECAR) }))
    const first = renderHook(() => useHeroArt())
    await waitFor(() => expect(first.result.current).not.toBeNull())
    const second = renderHook(() => useHeroArt())
    expect(second.result.current).not.toBeNull() // already settled: no loading flash on remount
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
