import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useCatalog } from './useCatalog'

const CSV = `catalog_index,video_id,type,title,title_raw,series_id,series_title,season_number,season_label,year,studio,genre,genre_secondary,quality,language,subtitled,duration_raw,duration_seconds,views,thumbnail,video_url,embed_url
0,111,movie,Foo,Foo,,,,,2020,,Drama,,1080p,Español,false,1:00:00,3600,10,thumb.webp,https://ok.ru/video/111,https://ok.ru/videoembed/111
`

beforeEach(() => {
  sessionStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useCatalog', () => {
  it('fetches and parses the catalog when there is no cache', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(CSV) })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useCatalog())
    expect(result.current.loading).toBe(true)

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.titles).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('hydrates synchronously from the session cache and skips the fetch', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    sessionStorage.setItem(
      'go10:catalog:v1',
      JSON.stringify({
        rows: [
          {
            catalog_index: 0, video_id: '111', type: 'movie', title: 'Foo', title_raw: 'Foo',
            series_id: '', series_title: '', season_number: null, season_label: '',
            episode_number: null, year: 2020, studio: '', genre: 'Drama', genre_secondary: '',
            quality: '1080p', language: 'Español', subtitled: false, duration_raw: '1:00:00',
            duration_seconds: 3600, views: 10, thumbnail: 'thumb.webp',
            video_url: 'https://ok.ru/video/111', embed_url: 'https://ok.ru/videoembed/111',
          },
        ],
        builtAt: Date.now(),
      }),
    )

    const { result } = renderHook(() => useCatalog())
    expect(result.current.loading).toBe(false)
    expect(result.current.titles).toHaveLength(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('writes the parsed catalog to the session cache after a successful fetch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(CSV) }))

    const { result } = renderHook(() => useCatalog())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(sessionStorage.getItem('go10:catalog:v1')).not.toBeNull()
  })
})
