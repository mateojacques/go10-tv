import { act, render, screen } from '@testing-library/react-native'
import { AppState } from 'react-native'
import { resolveLineup } from '@go10/core/tv/lineup'
import { scheduleAt } from '@go10/core/tv/schedule'
import { collectionOf, showTitle } from '@go10/core/tv/testing'
import { LiveVideo } from './LiveVideo'

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

const EPOCH = Date.parse('2026-10-01T00:00:00Z')
// Ten-minute episodes, each its own file: every boundary loads a new file.
const titles = [showTitle('coraje', 10, 600), showTitle('dexter', 10, 600)]
const lineup = resolveLineup(
  { epoch: '2026-10-01T00:00:00Z', defaultChannel: 'cn', channels: [{ id: 'cn', number: 1, collection: 'cn' }] },
  [collectionOf('cn', ['coraje', 'dexter'])],
  titles,
)!
const channel = lineup.channels[0]
const SITE = 'https://tv.test/'

const webview = () => screen.getByTestId('live-webview')
const host = (message: object) => act(() => webview().props.onMessage({ nativeEvent: { data: JSON.stringify(message) } }))
const injected = () => mockInject.mock.calls.map(([script]) => script as string).join('\n')
const advance = (ms: number) => act(() => jest.advanceTimersByTime(ms))
/** One timeout and every backoff: each stage's timer is set by the previous stage's render, so step through them. */
const exhaustRetries = async () => {
  for (let i = 0; i < 7; i++) await advance(8000)
}

beforeEach(() => {
  jest.useFakeTimers({ now: EPOCH + 90_000 })
  mockInject.mockClear()
})
afterEach(() => jest.useRealTimers())

const renderLive = (props: Partial<Parameters<typeof LiveVideo>[0]> = {}) =>
  render(<LiveVideo channel={channel} epochMs={lineup.epochMs} siteUrl={SITE} soundOn {...props} />)

describe('LiveVideo', () => {
  it('joins the live second, cropped, on the site origin', async () => {
    await renderLive()
    const { current, offset } = scheduleAt(channel.plan, lineup.epochMs, Date.now(), 0)
    expect(webview().props.source.baseUrl).toBe(SITE)
    expect(webview().props.source.html).toContain(`fromTime=${Math.floor(current.unit.start + offset)}`)
    expect(webview().props.source.html).toContain('top:-64px')
    expect(webview().props.mediaPlaybackRequiresUserAction).toBe(false)
  })

  it('asks for play and sound once loaded, and mutes when sound goes off', async () => {
    await renderLive()
    await host({ kind: 'loaded' })
    expect(injected()).toContain('"action":"play"')
    expect(injected()).toContain('"action":"unmute"')
    expect(injected()).toContain('"action":"volume","value":1')
    mockInject.mockClear()
    await screen.rerender(<LiveVideo channel={channel} epochMs={lineup.epochMs} siteUrl={SITE} soundOn={false} />)
    expect(injected()).toContain('"action":"mute"')
  })

  it('retries a load that times out, rejoining live', async () => {
    await renderLive()
    const first = webview().props.source.html
    await advance(8000)
    expect(screen.getByText('Reconectando…')).toBeTruthy()
    await advance(1000) // the first backoff
    expect(webview().props.source.html).not.toBe(first) // nine seconds later: a later fromTime
  })

  it('gives up after the last retry: "Señal interrumpida" with the next program', async () => {
    const onFailedChange = jest.fn()
    await renderLive({ onFailedChange })
    await exhaustRetries()
    expect(screen.getByText('Señal interrumpida')).toBeTruthy()
    expect(screen.getByText(/^Volvemos con .+ a las \d\d:\d\d$/)).toBeTruthy()
    expect(screen.queryByTestId('live-webview')).toBeNull()
    expect(onFailedChange).toHaveBeenLastCalledWith(true)
  })

  it('retunes at the boundary after giving up', async () => {
    const onFailedChange = jest.fn()
    await renderLive({ onFailedChange })
    await exhaustRetries()
    const { current } = scheduleAt(channel.plan, lineup.epochMs, Date.now(), 0)
    await advance(current.endsAt - Date.now() + 1)
    expect(screen.getByTestId('live-webview')).toBeTruthy()
    expect(onFailedChange).toHaveBeenLastCalledWith(false)
  })

  it('loads the next file at the program boundary', async () => {
    await renderLive()
    await host({ kind: 'loaded' })
    const before = webview().props.source.html
    const { current, next } = scheduleAt(channel.plan, lineup.epochMs, Date.now(), 1)
    await advance(current.endsAt - Date.now() + 1)
    expect(webview().props.source.html).not.toBe(before)
    expect(webview().props.source.html).toContain(next[0].unit.row.embed_url)
  })

  it('rejoins live when the app comes back', async () => {
    const listeners: Array<(state: string) => void> = []
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, fn) => {
      listeners.push(fn as (state: string) => void)
      return { remove: jest.fn() } as never
    })
    await renderLive()
    await host({ kind: 'loaded' })
    const before = webview().props.source.html
    // Asleep for half an hour: timers don't run while backgrounded, the clock does.
    jest.setSystemTime(Date.now() + 30 * 60_000)
    await act(() => listeners.forEach((fn) => fn('active')))
    expect(webview().props.source.html).not.toBe(before)
    jest.restoreAllMocks()
  })

  it('reports a stall when loaded but not moving, and clears it when the time moves', async () => {
    const onStalledChange = jest.fn()
    await renderLive({ onStalledChange })
    await host({ kind: 'loaded' })
    await advance(5000)
    expect(onStalledChange).toHaveBeenLastCalledWith(true)
    await host({ kind: 'embed', data: { event: 'timeupdate', time: 95, duration: 600 } })
    expect(onStalledChange).toHaveBeenLastCalledWith(false)
  })

  it('covers a file that ended early with "A continuación"', async () => {
    await renderLive()
    await host({ kind: 'loaded' })
    await host({ kind: 'embed', data: { event: 'ended', time: 600 } })
    expect(screen.getByText(/^A continuación: .+ a las \d\d:\d\d$/)).toBeTruthy()
  })
})
