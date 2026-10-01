import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { TvSlot } from './TvSlot'
import { buildChannelPlan } from '@go10/core/tv/plan'
import { scheduleAt } from '@go10/core/tv/schedule'
import { collectionOf, movieTitle, showTitle } from '@go10/core/tv/testing'
import type { Channel } from '@go10/core/tv/types'

const EPOCH = Date.UTC(2026, 9, 1)
const titles = [showTitle('a', 3, 600), movieTitle('m', 3000)]
const collection = collectionOf('cn', ['a', 'm'])
const channel: Channel = {
  id: 'cn', number: 1, name: 'CN', collection,
  plan: buildChannelPlan({ id: 'cn', number: 1, collection: 'cn' }, collection, titles),
}

const frame = () => document.querySelector('.go-tvslot_frame') as HTMLIFrameElement | null

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(EPOCH + 61_000)
})
afterEach(() => vi.useRealTimers())

describe('TvSlot', () => {
  it('loads the live second of the channel', () => {
    render(<TvSlot channel={channel} epochMs={EPOCH} mode="full" />)
    const s = scheduleAt(channel.plan, EPOCH, EPOCH + 61_000)
    expect(frame()!.src).toBe(`${s.current.unit.row.embed_url}?autoplay=1&fromTime=61`)
    expect(document.querySelector('.go-tvslot--full')).not.toBeNull()
  })

  it('retries a load that never finishes, rejoining live each time', () => {
    render(<TvSlot channel={channel} epochMs={EPOCH} mode="full" />)
    act(() => vi.advanceTimersByTime(8000))
    expect(screen.getByRole('status').textContent).toBe('Reconectando…')
    act(() => vi.advanceTimersByTime(1000))
    expect(frame()!.src).toMatch(/fromTime=70$/)
  })

  it('shows "Señal interrumpida" with the next program after the last retry, and retunes at the boundary', () => {
    render(<TvSlot channel={channel} epochMs={EPOCH} mode="full" />)
    // 4 timeouts (initial + 3 retries) with 1 s, 2 s, 3 s backoff between them.
    for (const wait of [8000, 1000, 8000, 2000, 8000, 3000, 8000]) act(() => vi.advanceTimersByTime(wait))
    expect(screen.getByRole('status').textContent).toMatch(/^Señal interrumpida/)
    expect(screen.getByRole('status').textContent).toMatch(/Volvemos con .+ a las \d\d:\d\d/)
    expect(frame()).toBeNull()
    // Fake timers move Date.now() along with the timers they fire.
    const s = scheduleAt(channel.plan, EPOCH, Date.now())
    act(() => vi.advanceTimersByTime(s.current.endsAt - Date.now() + 1))
    expect(frame()).not.toBeNull()
  })

  it('gives a preview one retry, then shows the program thumbnail', () => {
    render(<TvSlot channel={channel} epochMs={EPOCH} mode="tile" preview rect={{ top: 1, left: 2, width: 300, height: 169 }} />)
    for (const wait of [8000, 1000, 8000]) act(() => vi.advanceTimersByTime(wait))
    expect(frame()).toBeNull()
    expect(document.querySelector('.go-tvslot_thumb')).not.toBeNull()
  })

  it('stays ready once the frame loads', () => {
    render(<TvSlot channel={channel} epochMs={EPOCH} mode="full" />)
    fireEvent.load(frame()!)
    act(() => vi.advanceTimersByTime(20_000))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('moves to the next program at the boundary', () => {
    render(<TvSlot channel={channel} epochMs={EPOCH} mode="full" />)
    fireEvent.load(frame()!)
    const first = scheduleAt(channel.plan, EPOCH, Date.now())
    act(() => vi.advanceTimersByTime(first.current.endsAt - Date.now()))
    const next = scheduleAt(channel.plan, EPOCH, first.current.endsAt)
    expect(frame()!.src.startsWith(next.current.unit.row.embed_url)).toBe(true)
  })

  it('places a tile-mode slot on the given rectangle', () => {
    render(<TvSlot channel={channel} epochMs={EPOCH} mode="tile" preview rect={{ top: 10, left: 20, width: 300, height: 169 }} />)
    const root = document.querySelector('.go-tvslot') as HTMLElement
    expect([root.style.top, root.style.left, root.style.width, root.style.height]).toEqual(['10px', '20px', '300px', '169px'])
  })

  it('exposes a handle that posts to the embed', () => {
    let handle: { post(m: unknown): void } | null = null
    render(<TvSlot channel={channel} epochMs={EPOCH} mode="full" bind={(h) => (handle = h)} />)
    const post = vi.spyOn(frame()!.contentWindow!, 'postMessage')
    handle!.post({ action: 'play' })
    expect(post).toHaveBeenCalledWith({ action: 'play' }, 'https://ok.ru')
  })

  it("reports once per load when the embed's player first speaks", () => {
    const onReady = vi.fn()
    render(<TvSlot channel={channel} epochMs={EPOCH} mode="full" onReady={onReady} />)
    const say = () =>
      act(() => {
        window.dispatchEvent(new MessageEvent('message', { data: { event: 'timeupdate', time: 61, duration: 600 }, origin: 'https://ok.ru', source: frame()!.contentWindow }))
      })
    fireEvent.load(frame()!)
    expect(onReady).not.toHaveBeenCalled()
    say()
    say()
    expect(onReady).toHaveBeenCalledTimes(1)
  })

  it('keeps the embed out of the tab order, so keys never reach its controls', () => {
    render(<TvSlot channel={channel} epochMs={EPOCH} mode="full" />)
    expect(frame()!.tabIndex).toBe(-1)
  })

  it('reports a stall when nothing plays 4 s after loading, and clears it once playback starts', () => {
    const onStalledChange = vi.fn()
    render(<TvSlot channel={channel} epochMs={EPOCH} mode="full" onStalledChange={onStalledChange} />)
    fireEvent.load(frame()!)
    act(() => vi.advanceTimersByTime(3999))
    expect(onStalledChange).not.toHaveBeenLastCalledWith(true)
    act(() => vi.advanceTimersByTime(1))
    expect(onStalledChange).toHaveBeenLastCalledWith(true)
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { event: 'timeupdate', time: 70, duration: 600 }, origin: 'https://ok.ru', source: frame()!.contentWindow }))
    })
    expect(onStalledChange).toHaveBeenLastCalledWith(false)
  })

  it('does not report a stall when playback starts in time', () => {
    const onStalledChange = vi.fn()
    render(<TvSlot channel={channel} epochMs={EPOCH} mode="full" onStalledChange={onStalledChange} />)
    fireEvent.load(frame()!)
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { event: 'timeupdate', time: 62, duration: 600 }, origin: 'https://ok.ru', source: frame()!.contentWindow }))
    })
    act(() => vi.advanceTimersByTime(10_000))
    expect(onStalledChange).not.toHaveBeenCalledWith(true)
  })
})
