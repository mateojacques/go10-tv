import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { useState } from 'react'
import { memoryStore, setKeyValueStore } from '@go10/core/ports/keyValueStore'
import { readLastChannel, resolveLineup } from '@go10/core/tv/lineup'
import { collectionOf, movieTitle, showTitle } from '@go10/core/tv/testing'
import { STRIP_IDLE_MS, TvScreenView, ZAP_SETTLE_MS } from './TvScreenView'

jest.mock('react-native-webview', () => {
  const React = require('react')
  const { View } = require('react-native')
  const WebView = React.forwardRef((props: object, ref: unknown) => {
    React.useImperativeHandle(ref, () => ({ injectJavaScript: jest.fn() }))
    return React.createElement(View, props)
  })
  return { WebView }
})
jest.mock('../platform/playerChrome', () => ({ usePlayerChrome: jest.fn() }))
const mockRemote: { key?: (key: string) => void; back?: () => boolean } = {}
jest.mock('../platform/remote', () => ({
  useRemoteKeys: (onKey: (key: string) => void) => {
    mockRemote.key = onKey
  },
  useBackPress: (onBack: () => boolean) => {
    mockRemote.back = onBack
  },
}))

const EPOCH = Date.parse('2026-10-01T00:00:00Z')
const lineup = resolveLineup(
  {
    epoch: '2026-10-01T00:00:00Z',
    defaultChannel: 'a',
    channels: [
      { id: 'a', number: 1, collection: 'a' },
      { id: 'b', number: 2, collection: 'b' },
      { id: 'c', number: 3, collection: 'c' },
    ],
  },
  [collectionOf('a', ['s1']), collectionOf('b', ['m1']), collectionOf('c', ['s2'])],
  [showTitle('s1', 6, 600), movieTitle('m1', 5400), showTitle('s2', 6, 900)],
)!
const byId = (id: string) => lineup.channels.find((c) => c.id === id)!

function Harness({ initial, onBack = jest.fn() }: { initial: string; onBack?: () => void }) {
  const [id, setId] = useState(initial)
  return <TvScreenView lineup={lineup} channel={byId(id)} siteUrl="https://tv.test/" imageBase="https://tv.test/" onZap={setId} onBack={onBack} />
}

const press = (key: string) => act(() => mockRemote.key!(key))
const advance = (ms: number) => act(() => jest.advanceTimersByTime(ms))
const webviews = () => screen.queryAllByTestId('live-webview')
const strip = () => screen.queryByLabelText('Canales')

beforeEach(() => {
  jest.useFakeTimers({ now: EPOCH + 60_000 })
  setKeyValueStore(memoryStore())
})
afterEach(() => jest.useRealTimers())

describe('TvScreenView', () => {
  it('plays the channel at once on arrival, with nothing over the picture', async () => {
    await render(<Harness initial="a" />)
    expect(webviews()).toHaveLength(1)
    expect(screen.queryByTestId('tv-flash')).toBeNull()
    expect(strip()).toBeNull()
    expect(readLastChannel()).toBe('a')
  })

  it('Down zaps to the next channel, black with its number until it settles', async () => {
    await render(<Harness initial="a" />)
    await press('down')
    expect(webviews()).toHaveLength(0)
    expect(screen.getByTestId('tv-flash')).toHaveTextContent('2')
    await advance(ZAP_SETTLE_MS)
    expect(webviews()).toHaveLength(1)
    expect(screen.queryByTestId('tv-flash')).toBeNull()
    expect(readLastChannel()).toBe('b')
  })

  it('holding Down loads only where it stops', async () => {
    await render(<Harness initial="a" />)
    await press('down')
    await advance(ZAP_SETTLE_MS - 100)
    await press('down')
    await advance(ZAP_SETTLE_MS - 100)
    expect(webviews()).toHaveLength(0)
    expect(readLastChannel()).toBe('a')
    await advance(100)
    expect(webviews()).toHaveLength(1)
    expect(readLastChannel()).toBe('c')
  })

  it('Up from the first channel wraps to the last; CH+ and CH− zap too', async () => {
    await render(<Harness initial="a" />)
    await press('up')
    expect(screen.getByTestId('tv-flash')).toHaveTextContent('3')
    await press('channelUp')
    expect(screen.getByTestId('tv-flash')).toHaveTextContent('1')
    await press('channelDown')
    expect(screen.getByTestId('tv-flash')).toHaveTextContent('3')
  })

  it('media keys do nothing', async () => {
    await render(<Harness initial="a" />)
    await press('playPause')
    await press('fastForward')
    expect(webviews()).toHaveLength(1)
    expect(strip()).toBeNull()
  })

  it('Left/Right reveal the strip on the playing channel; it hides after 6 s idle', async () => {
    await render(<Harness initial="b" />)
    await press('right')
    expect(strip()).toBeTruthy()
    expect(screen.getByRole('button', { selected: true }).props.accessibilityLabel).toMatch(/^2 /)
    await advance(STRIP_IDLE_MS - 1000)
    await press('right') // activity keeps it open
    await advance(STRIP_IDLE_MS - 1000)
    expect(strip()).toBeTruthy()
    await advance(1000)
    expect(strip()).toBeNull()
  })

  it('OK over the bare picture does nothing', async () => {
    await render(<Harness initial="a" />)
    await press('select')
    expect(strip()).toBeNull()
  })

  it('a tile tunes its channel; the playing channel’s tile hides the strip', async () => {
    await render(<Harness initial="a" />)
    await press('right')
    await fireEvent.press(screen.getByLabelText(/^1 /))
    expect(strip()).toBeNull()
    await press('right')
    await fireEvent.press(screen.getByLabelText(/^3 /))
    await advance(ZAP_SETTLE_MS)
    expect(readLastChannel()).toBe('c')
  })

  it('shows the program and what comes next in the bar', async () => {
    await render(<Harness initial="a" />)
    await press('right')
    expect(screen.getByText(/^A continuación: .+ · \d\d:\d\d$/)).toBeTruthy()
  })

  it('Back closes the strip first, then leaves', async () => {
    const onBack = jest.fn()
    await render(<Harness initial="a" onBack={onBack} />)
    await press('right')
    let consumed = false
    await act(() => {
      consumed = mockRemote.back!()
    })
    expect(consumed).toBe(true)
    expect(onBack).not.toHaveBeenCalled()
    expect(strip()).toBeNull()
    await act(() => {
      mockRemote.back!()
    })
    expect(onBack).toHaveBeenCalled()
  })

  it('touch: a tap toggles the strip, a vertical swipe zaps', async () => {
    await render(<Harness initial="a" />)
    const shield = screen.getByTestId('tv-shield')
    await fireEvent(shield, 'touchStart', { nativeEvent: { pageX: 100, pageY: 300 } })
    await fireEvent(shield, 'touchEnd', { nativeEvent: { pageX: 100, pageY: 300 } })
    expect(strip()).toBeTruthy()
    await fireEvent(shield, 'touchStart', { nativeEvent: { pageX: 100, pageY: 300 } })
    await fireEvent(shield, 'touchEnd', { nativeEvent: { pageX: 100, pageY: 200 } }) // swipe up: next channel
    expect(screen.getByTestId('tv-flash')).toHaveTextContent('2')
  })

  it('a dead channel keeps the strip open, so the way out is a zap', async () => {
    await render(<Harness initial="a" />)
    for (let i = 0; i < 7; i++) await advance(8000)
    expect(screen.getByText('Señal interrumpida')).toBeTruthy()
    expect(strip()).toBeTruthy()
    await advance(STRIP_IDLE_MS)
    expect(strip()).toBeTruthy()
  })
})
