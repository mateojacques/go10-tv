import { act, renderHook } from '@testing-library/react-native'
import { memoryStore, setKeyValueStore } from '@go10/core/ports/keyValueStore'
import { saveSnapshot } from '@go10/core/external/snapshots'
import { fetchTmdbTitle } from '@go10/core/external/tmdb/title'
import type { Title } from '@go10/core/types'
import { resetTmdbTitleCacheForTests, useTmdbTitle } from './useTmdbTitle'

jest.mock('@go10/core/external/tmdb/title', () => ({ fetchTmdbTitle: jest.fn() }))
const fetchTitle = fetchTmdbTitle as jest.MockedFunction<typeof fetchTmdbTitle>

const MOVIE = { key: 'tmdb-movie-155', title: 'Batman', seasons: [] as Title['seasons'] } as Title
const flush = () => act(async () => {})

beforeEach(() => {
  setKeyValueStore(memoryStore())
  resetTmdbTitleCacheForTests()
  fetchTitle.mockReset()
})

describe('useTmdbTitle', () => {
  it('is idle without a key', async () => {
    const { result } = await renderHook(() => useTmdbTitle(null))
    expect(result.current).toEqual({ status: 'idle' })
  })

  it('loads a title', async () => {
    fetchTitle.mockResolvedValue(MOVIE)
    const { result } = await renderHook(() => useTmdbTitle('tmdb-movie-155'))
    await flush()
    expect(result.current).toEqual({ status: 'ready', title: MOVIE })
  })

  it('is not-found when TMDB does not know it, error when it cannot be reached', async () => {
    fetchTitle.mockResolvedValueOnce(null)
    const missing = await renderHook(() => useTmdbTitle('tmdb-movie-1'))
    await flush()
    expect(missing.result.current).toEqual({ status: 'not-found' })
    fetchTitle.mockRejectedValueOnce(new Error('offline'))
    const failed = await renderHook(() => useTmdbTitle('tmdb-movie-2'))
    await flush()
    expect(failed.result.current).toEqual({ status: 'error' })
  })

  it('serves a snapshot at once, and keeps it while TMDB is unreachable', async () => {
    saveSnapshot(MOVIE)
    fetchTitle.mockRejectedValue(new Error('offline'))
    const { result } = await renderHook(() => useTmdbTitle('tmdb-movie-155'))
    expect(result.current).toEqual({ status: 'ready', title: MOVIE })
    await flush()
    expect(result.current).toEqual({ status: 'ready', title: MOVIE })
  })

  it('does not refetch a title already loaded this session', async () => {
    fetchTitle.mockResolvedValue(MOVIE)
    const first = await renderHook(() => useTmdbTitle('tmdb-movie-155'))
    await flush()
    await first.unmount()
    const { result } = await renderHook(() => useTmdbTitle('tmdb-movie-155'))
    expect(result.current).toEqual({ status: 'ready', title: MOVIE })
    expect(fetchTitle).toHaveBeenCalledTimes(1)
  })
})
