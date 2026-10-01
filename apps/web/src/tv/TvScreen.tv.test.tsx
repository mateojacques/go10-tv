import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { FocusProvider } from '../focus/FocusProvider'
import { TvProvider, useTv, type TvApi } from './TvProvider'
import { TvScreen, ZAP_SETTLE_MS } from './TvScreen'
import { TvLayer } from './TvLayer'
import { buildChannelPlan } from '@go10/core/tv/plan'
import { collectionOf, movieTitle, showTitle } from '@go10/core/tv/testing'
import type { Channel, Lineup } from '@go10/core/tv/types'

// A TV: one embed at a time.
vi.mock('./leanTv', () => ({ leanTv: () => true }))

const EPOCH = Date.UTC(2026, 9, 1)
const titles = [showTitle('coraje', 4, 600), movieTitle('mulan', 5280), movieTitle('shrek', 5400)]
const channelOf = (id: string, number: number, keys: string[]): Channel => {
  const collection = collectionOf(id, keys)
  return { id, number, name: id.toUpperCase(), collection, plan: buildChannelPlan({ id, number, collection: id }, collection, titles) }
}
const lineup: Lineup = {
  epochMs: EPOCH, defaultChannel: 'cn',
  channels: [channelOf('cn', 1, ['coraje']), channelOf('dis', 2, ['mulan']), channelOf('dw', 3, ['shrek'])],
}

let api: TvApi
function Grab() {
  api = useTv()
  return null
}
const onZap = vi.fn()
const onOpenTitle = vi.fn()

function tree(channel: Channel) {
  return (
    <TvProvider lineup={lineup}>
      <Grab />
      <FocusProvider onBack={() => {}}>
        <TvScreen channel={channel} onZap={onZap} onOpenTitle={onOpenTitle} onBack={() => {}} />
      </FocusProvider>
      <TvLayer onOpen={() => {}} />
    </TvProvider>
  )
}
const press = (key: string) => fireEvent.keyDown(window, { key })
const everLoaded = new Set<string>()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(EPOCH + 60_000)
  everLoaded.clear()
})
afterEach(() => {
  vi.useRealTimers()
  onZap.mockReset()
  onOpenTitle.mockReset()
})

describe('TvScreen on a TV', () => {
  it('tunes in at once on arrival', () => {
    render(tree(lineup.channels[0]))
    expect(api.mainChannel).toBe('cn')
  })

  it('has no sound button: the TV\'s own volume keys rule', () => {
    render(tree(lineup.channels[0]))
    expect(screen.queryByRole('button', { name: 'Silenciar' })).toBeNull()
  })

  it('lets a zap settle before loading it, dropping the old channel meanwhile', () => {
    const { rerender } = render(tree(lineup.channels[0]))
    rerender(tree(lineup.channels[1]))
    expect(api.mainChannel).toBeNull()
    expect(document.querySelector('.go-tv_flash')!.textContent).toBe('2')
    act(() => vi.advanceTimersByTime(ZAP_SETTLE_MS))
    expect(api.mainChannel).toBe('dis')
    expect(document.querySelector('.go-tv_flash')).toBeNull()
  })

  it('loads only where a run of quick zaps ends', () => {
    const { rerender } = render(tree(lineup.channels[0]))
    const seen = () => document.querySelectorAll('.go-tvslot').forEach((el) => everLoaded.add(el.getAttribute('data-channel')!))
    rerender(tree(lineup.channels[1]))
    seen()
    act(() => vi.advanceTimersByTime(ZAP_SETTLE_MS - 100))
    seen()
    rerender(tree(lineup.channels[2]))
    seen()
    act(() => vi.advanceTimersByTime(ZAP_SETTLE_MS))
    seen()
    expect(api.mainChannel).toBe('dw')
    expect(everLoaded.has('dis')).toBe(false)
  })

  it('remembers the channel last watched, not one zapped through, for PRE-CH', () => {
    const { rerender } = render(tree(lineup.channels[0]))
    rerender(tree(lineup.channels[1]))
    rerender(tree(lineup.channels[2]))
    act(() => vi.advanceTimersByTime(ZAP_SETTLE_MS))
    fireEvent.keyDown(window, { key: 'Unidentified', keyCode: 10190 })
    expect(onZap).toHaveBeenCalledWith('cn')
  })

  it('asks for OK, not a tap, when the channel stalls, and OK asks the embed to play', () => {
    render(tree(lineup.channels[0]))
    const frame = document.querySelector('[data-channel="cn"] iframe') as HTMLIFrameElement
    const post = vi.spyOn(frame.contentWindow!, 'postMessage')
    fireEvent.load(frame)
    act(() => vi.advanceTimersByTime(4000))
    expect(screen.getByText('Pulsá OK para ver')).not.toBeNull()
    post.mockClear()
    press('ArrowRight')
    press('ArrowLeft')
    press('Enter')
    expect(post).toHaveBeenCalledWith({ action: 'play' }, 'https://ok.ru')
    expect(onOpenTitle).not.toHaveBeenCalled()
  })

  it('takes focus back from the embed, so the remote keeps reaching the app', () => {
    render(tree(lineup.channels[0]))
    press('ArrowRight')
    const tile = document.querySelector('.go-chtile.is-focused') as HTMLElement
    expect(document.activeElement).toBe(tile)
    // The embed taking focus surfaces as this window blurring.
    const frame = document.querySelector('[data-channel="cn"] iframe') as HTMLIFrameElement
    frame.tabIndex = 0
    frame.focus()
    fireEvent.blur(window)
    act(() => vi.advanceTimersByTime(0))
    expect(document.activeElement).toBe(tile)
  })
})
