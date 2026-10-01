import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { FocusProvider } from '../focus/FocusProvider'
import { ChannelTile } from './ChannelTile'
import { useLiveNow } from './useLiveNow'
import { TvProvider, useTv, type TvApi } from './TvProvider'
import { buildChannelPlan } from '@go10/core/tv/plan'
import { scheduleAt } from '@go10/core/tv/schedule'
import { collectionOf, movieTitle, showTitle } from '@go10/core/tv/testing'
import type { Channel, Lineup } from '@go10/core/tv/types'

const EPOCH = Date.UTC(2026, 9, 1)
const collection = collectionOf('cn', ['coraje'])
const channel: Channel = {
  id: 'cn', number: 1, name: 'Cartoon Network', collection,
  plan: buildChannelPlan({ id: 'cn', number: 1, collection: 'cn' }, collection, [showTitle('coraje', 4, 600)]),
}
const otherCollection = collectionOf('jx', ['mulan'])
const other: Channel = {
  id: 'jx', number: 2, name: 'Jetix', collection: otherCollection,
  plan: buildChannelPlan({ id: 'jx', number: 2, collection: 'jx' }, otherCollection, [movieTitle('mulan', 5280)]),
}
const lineup: Lineup = { epochMs: EPOCH, defaultChannel: 'cn', channels: [channel, other] }

let api: TvApi
function Grab() {
  api = useTv()
  return null
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(EPOCH + 150_000)
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('fine'), addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function renderTile(onSelect = vi.fn()) {
  render(
    <TvProvider lineup={lineup}>
      <Grab />
      <FocusProvider onBack={() => {}}>
        <ChannelTile channel={channel} schedule={scheduleAt(channel.plan, EPOCH, Date.now())} row={0} col={0} scope="tv" onSelect={onSelect} />
      </FocusProvider>
    </TvProvider>,
  )
  return onSelect
}

describe('ChannelTile', () => {
  it("shows the channel and what's on, with its progress", () => {
    renderTile()
    const tile = screen.getByRole('button', { name: '1 Cartoon Network: coraje · T1 · E1' })
    expect(tile.querySelector('.go-chtile_progress i')!.getAttribute('style')).toContain('width: 25%')
  })

  it('selects on Enter and click', () => {
    const onSelect = renderTile()
    fireEvent.keyDown(window, { key: 'Enter' })
    fireEvent.click(screen.getByRole('button'))
    expect(onSelect).toHaveBeenCalledTimes(2)
  })

  it('preloads its channel on pointer enter when nothing is loaded yet', () => {
    renderTile()
    fireEvent.pointerEnter(screen.getByRole('button'))
    expect(api.slots.map((s) => [s.channelId, s.role])).toEqual([['cn', 'main']])
  })

  it('previews another channel after resting 600 ms, and ends it on pointer leave', () => {
    renderTile()
    act(() => api.watch('jx')) // something else is on main
    const tile = screen.getByRole('button')
    fireEvent.pointerEnter(tile)
    act(() => vi.advanceTimersByTime(599))
    expect(api.slots.filter((s) => s.role === 'preview')).toEqual([])
    act(() => vi.advanceTimersByTime(1))
    expect(api.slots.filter((s) => s.role === 'preview').map((s) => s.channelId)).toEqual(['cn'])
    fireEvent.pointerLeave(tile)
    expect(api.slots.filter((s) => s.role === 'preview')).toEqual([])
  })
})

describe('ChannelTile preview placement', () => {
  it('keeps the preview on its tile when the page scrolls or resizes', () => {
    let top = 100
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ top, left: 10, width: 200, height: 112, right: 210, bottom: top + 112, x: 10, y: top, toJSON() {} }) as DOMRect)
    renderTile()
    act(() => api.watch('jx'))
    fireEvent.pointerEnter(screen.getByRole('button'))
    act(() => vi.advanceTimersByTime(600))
    expect(api.previewRect?.top).toBe(100)
    top = 40
    act(() => {
      fireEvent.scroll(window)
    })
    expect(api.previewRect?.top).toBe(40)
    top = 70
    act(() => {
      fireEvent(window, new Event('resize'))
    })
    expect(api.previewRect?.top).toBe(70)
    vi.restoreAllMocks()
  })
})

describe('useLiveNow', () => {
  it('refreshes every 5 s and at the next boundary', () => {
    const { result } = renderHook(() => useLiveNow(lineup))
    const first = result.current.get('cn')!
    act(() => vi.advanceTimersByTime(5000))
    expect(result.current.get('cn')!.offset).toBe(first.offset + 5)
    act(() => vi.advanceTimersByTime(first.current.endsAt - Date.now()))
    expect(result.current.get('cn')!.current.unit.key).not.toBe(first.current.unit.key)
  })
})
