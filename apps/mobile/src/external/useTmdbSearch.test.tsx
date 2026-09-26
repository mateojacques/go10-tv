import { act, renderHook } from '@testing-library/react-native'
import type { Title } from '@go10/core/types'
import { searchTmdb } from '@go10/core/external/tmdb/search'
import { tmdbAvailable } from '@go10/core/external/tmdb/client'
import { resetTmdbSearchForTests, useTmdbSearch } from './useTmdbSearch'

jest.mock('@go10/core/external/tmdb/search', () => ({ searchTmdb: jest.fn(), resetGenresForTests: jest.fn() }))
jest.mock('@go10/core/external/tmdb/client', () => ({ tmdbAvailable: jest.fn() }))
const search = searchTmdb as jest.MockedFunction<typeof searchTmdb>
const available = tmdbAvailable as jest.MockedFunction<typeof tmdbAvailable>

const BATMAN = { key: 'tmdb-movie-155', title: 'Batman' } as Title

// RNTL 14's async render and act settle through setImmediate/queueMicrotask; freezing them hangs.
beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'queueMicrotask', 'nextTick'] })
  resetTmdbSearchForTests()
  search.mockReset()
  available.mockReturnValue(true)
})
afterEach(() => jest.useRealTimers())

const settle = () => act(async () => { jest.advanceTimersByTime(400) })

describe('useTmdbSearch', () => {
  it('searches once typing settles and returns the hits', async () => {
    search.mockResolvedValue([BATMAN])
    const { result } = await renderHook(() => useTmdbSearch('batman', 'all', true))
    expect(result.current.status).toBe('pending')
    await settle()
    expect(result.current).toEqual({ status: 'done', titles: [BATMAN] })
    expect(search).toHaveBeenCalledWith('batman', 'all', expect.anything())
  })

  it('is off when disabled, or for fewer than 2 characters, without searching', async () => {
    expect((await renderHook(() => useTmdbSearch('batman', 'all', false))).result.current.status).toBe('off')
    expect((await renderHook(() => useTmdbSearch(' b ', 'all', true))).result.current.status).toBe('off')
    await settle()
    expect(search).not.toHaveBeenCalled()
  })

  it('is off while the switch is off', async () => {
    available.mockReturnValue(false)
    const { result } = await renderHook(() => useTmdbSearch('batman', 'all', true))
    expect(result.current.status).toBe('off')
  })

  it('debounces a burst of typing into one request', async () => {
    search.mockResolvedValue([])
    const { rerender } = await renderHook(({ q }: { q: string }) => useTmdbSearch(q, 'all', true), { initialProps: { q: 'ba' } })
    await rerender({ q: 'bat' })
    await rerender({ q: 'batm' })
    await settle()
    expect(search).toHaveBeenCalledTimes(1)
    expect(search.mock.calls[0][0]).toBe('batm')
  })

  it('reports a failure', async () => {
    search.mockRejectedValue(new Error('offline'))
    const { result } = await renderHook(() => useTmdbSearch('batman', 'all', true))
    await settle()
    expect(result.current.status).toBe('failed')
  })

  it('serves a repeated query from cache', async () => {
    search.mockResolvedValue([BATMAN])
    const first = await renderHook(() => useTmdbSearch('batman', 'movie', true))
    await settle()
    await first.unmount()
    const { result } = await renderHook(() => useTmdbSearch('Batman ', 'movie', true))
    expect(result.current).toEqual({ status: 'done', titles: [BATMAN] })
    expect(search).toHaveBeenCalledTimes(1)
  })
})
