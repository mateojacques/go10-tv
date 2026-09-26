import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { Linking } from 'react-native'
import { memoryStore, setKeyValueStore } from '@go10/core/ports/keyValueStore'
import { readProgress, writeProgress } from '@go10/core/progress/progressStore'
import type { CatalogRow } from '@go10/core/types'
import { PlayerView } from './PlayerView'

const mockInject = jest.fn()
jest.mock('react-native-webview', () => {
  const React = require('react')
  const { View } = require('react-native')
  const WebView = React.forwardRef((props: object, ref: unknown) => {
    React.useImperativeHandle(ref, () => ({ injectJavaScript: mockInject }))
    return React.createElement(View, props)
  })
  return { WebView }
})

const mockRemote: { key?: (key: string) => void; back?: () => boolean } = {}
jest.mock('../platform/remote', () => ({
  useRemoteKeys: (onKey: (key: string) => void) => { mockRemote.key = onKey },
  useBackPress: (onBack: () => boolean) => { mockRemote.back = onBack },
}))

const base = {
  catalog_index: 0, title_raw: 'T', series_id: '', season_label: '', year: null, studio: '', source: '', genre: '',
  genre_secondary: '', quality: '', language: '', subtitled: false, duration_raw: '', views: 0, thumbnail: '',
  chapter_start_seconds: null, chapter_end_seconds: null,
}
const movie: CatalogRow = {
  ...base, video_id: 'm1', type: 'movie', title: 'Coraje', series_title: '', season_number: null, episode_number: null,
  duration_seconds: 700, video_url: 'https://ok.ru/video/1', embed_url: 'https://ok.ru/videoembed/1',
}
const chapter = (n: number, start: number, end: number): CatalogRow => ({
  ...base, video_id: 'f9', type: 'episode', title: `Ep ${n}`, series_title: 'Saint Seiya', season_number: 1, episode_number: n,
  chapter_start_seconds: start, chapter_end_seconds: end, duration_seconds: end - start,
  video_url: 'https://ok.ru/video/9', embed_url: 'https://ok.ru/videoembed/9',
})
const SITE = 'https://tv.test/'

const webview = () => screen.getByTestId('player-webview')
const post = (message: object) =>
  act(() => webview().props.onMessage({ nativeEvent: { data: JSON.stringify(message) } }))
const embed = (data: object) => post({ kind: 'embed', data })
const injected = () => mockInject.mock.calls.map(([script]) => script as string)

beforeEach(() => {
  setKeyValueStore(memoryStore())
  mockInject.mockClear()
})

describe('PlayerView', () => {
  it('loads the embed in the host page on the site origin, resuming the saved position', async () => {
    writeProgress('m1', { time: 120, duration: 700 })
    await render(<PlayerView row={movie} siteUrl={SITE} onClose={jest.fn()} />)
    expect(webview().props.source.baseUrl).toBe(SITE)
    expect(webview().props.source.html).toContain('src="https://ok.ru/videoembed/1?autoplay=1&amp;fromTime=117"')
    expect(webview().props.mediaPlaybackRequiresUserAction).toBe(false)
    expect(webview().props.setSupportMultipleWindows).toBe(false)
    expect(webview().props.onShouldStartLoadWithRequest({ url: 'https://ads.example/', isTopFrame: true })).toBe(false)
  })

  it('never sandboxes the embed: vidlove refuses to play sandboxed ("This site broke the player")', async () => {
    const tmdb: CatalogRow = {
      ...movie, video_id: 'tmdb-tv-1396-s1e1', type: 'episode', season_number: 1, episode_number: 1, external: true,
      embed_url: 'https://player.vidlove.cc/embed/tv/1396/1/1', video_url: 'https://player.vidlove.cc/embed/tv/1396/1/1',
    }
    await render(<PlayerView row={tmdb} siteUrl={SITE} onClose={jest.fn()} />)
    expect(webview().props.source.html).toContain('src="https://player.vidlove.cc/embed/tv/1396/1/1?')
    expect(webview().props.source.html).not.toContain('sandbox')
  })

  it('saves progress from the embed and on leaving with Back', async () => {
    const onClose = jest.fn()
    await render(<PlayerView row={movie} siteUrl={SITE} onClose={onClose} />)
    await embed({ event: 'timeupdate', time: 200, duration: 700 })
    await embed({ event: 'timeupdate', time: 204, duration: 700 })
    await act(() => { mockRemote.back!() })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(readProgress('m1')?.time).toBe(204)
  })

  it('seeks and pauses from the remote', async () => {
    await render(<PlayerView row={movie} siteUrl={SITE} onClose={jest.fn()} />)
    await embed({ event: 'timeupdate', time: 100, duration: 700 })
    await act(() => mockRemote.key!('right'))
    await act(() => mockRemote.key!('playPause'))
    expect(injected()).toEqual([
      'window.go10Command({"action":"seek","time":110}); true;',
      'window.go10Command({"action":"pause"}); true;',
    ])
  })

  it('Select opens the bar; Back closes it before leaving', async () => {
    const onClose = jest.fn()
    await render(<PlayerView row={chapter(1, 0, 600)} siteUrl={SITE} onClose={onClose} onNext={jest.fn()} />)
    expect(screen.queryByRole('button', { name: 'Volver' })).toBeNull()
    await act(() => mockRemote.key!('select'))
    expect(screen.getByRole('button', { name: 'Volver' })).toBeTruthy()
    expect(screen.getByText('Saint Seiya')).toBeTruthy()
    expect(screen.getByText('T1 · E1')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Pausar o reproducir' }).props.hasTVPreferredFocus).toBe(true)
    await act(() => { mockRemote.back!() })
    expect(screen.queryByRole('button', { name: 'Volver' })).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
    await act(() => { mockRemote.back!() })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('auto-advances when the episode ends', async () => {
    const onNext = jest.fn()
    await render(<PlayerView row={movie} siteUrl={SITE} onClose={jest.fn()} onNext={onNext} />)
    await embed({ event: 'ended', time: 700 })
    expect(onNext).toHaveBeenCalledTimes(1)
    expect(readProgress('m1')?.watched).toBe(true)
  })

  it('a chapter of the same file seeks instead of reloading', async () => {
    const { rerender } = await render(<PlayerView row={chapter(1, 0, 600)} siteUrl={SITE} onClose={jest.fn()} />)
    const html = webview().props.source.html
    await rerender(<PlayerView row={chapter(2, 600, 1200)} siteUrl={SITE} onClose={jest.fn()} />)
    expect(webview().props.source.html).toBe(html)
    expect(injected()).toEqual(['window.go10Command({"action":"seek","time":600}); true;'])
  })

  it('another file reloads the embed', async () => {
    const { rerender } = await render(<PlayerView row={chapter(1, 0, 600)} siteUrl={SITE} onClose={jest.fn()} />)
    await rerender(<PlayerView row={movie} siteUrl={SITE} onClose={jest.fn()} />)
    expect(webview().props.source.html).toContain('https://ok.ru/videoembed/1?autoplay=1')
    expect(injected()).toEqual([])
  })

  describe('when the embed never loads', () => {
    // RNTL 14's async render and act settle through setImmediate/queueMicrotask; freezing them hangs.
    beforeEach(() => jest.useFakeTimers({ doNotFake: ['setImmediate', 'queueMicrotask', 'nextTick'] }))
    afterEach(() => jest.useRealTimers())

    it('reconnects after 8 s, then offers the fallback link', async () => {
      const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
      await render(<PlayerView row={movie} siteUrl={SITE} onClose={jest.fn()} />)
      await act(() => { jest.advanceTimersByTime(8000) })
      expect(screen.getByText('Reconectando…')).toBeTruthy()
      for (const backoff of [1000, 2000, 3000]) {
        await act(() => { jest.advanceTimersByTime(backoff) })
        await act(() => { jest.advanceTimersByTime(8000) })
      }
      expect(screen.getByText('No se pudo reproducir aquí.')).toBeTruthy()
      await fireEvent.press(screen.getByRole('link', { name: 'Abrir en ok.ru' }))
      expect(openURL).toHaveBeenCalledWith('https://ok.ru/video/1')
    })

    it('does not time out once the iframe has loaded', async () => {
      await render(<PlayerView row={movie} siteUrl={SITE} onClose={jest.fn()} />)
      await post({ kind: 'loaded' })
      await act(() => { jest.advanceTimersByTime(9000) })
      expect(screen.queryByText('Reconectando…')).toBeNull()
    })
  })
})
