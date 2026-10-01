import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { FocusProvider } from '../focus/FocusProvider'
import { TvProvider, useTv, type TvApi } from './TvProvider'
import { TvScreen } from './TvScreen'
import { TvLayer } from './TvLayer'
import { buildChannelPlan } from '@go10/core/tv/plan'
import { collectionOf, movieTitle, showTitle } from '@go10/core/tv/testing'
import type { Channel, Lineup } from '@go10/core/tv/types'

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
const onBack = vi.fn()

function tree(channel: Channel) {
  return (
    <TvProvider lineup={lineup}>
      <Grab />
      <FocusProvider onBack={onBack}>
        <TvScreen channel={channel} onZap={onZap} onOpenTitle={onOpenTitle} onBack={onBack} />
      </FocusProvider>
      <TvLayer onOpen={() => {}} />
    </TvProvider>
  )
}
const renderScreen = (channel = lineup.channels[0]) => render(tree(channel))
const press = (key: string) => fireEvent.keyDown(window, { key })
const strip = () => screen.getByRole('navigation', { name: 'Canales' })

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(EPOCH + 60_000)
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('fine'), addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  for (const fn of [onZap, onOpenTitle, onBack]) fn.mockReset()
})

describe('TvScreen', () => {
  it('watches its channel on the TV screen', () => {
    renderScreen()
    expect(api.mainChannel).toBe('cn')
    expect(api.modeOf(api.slots[0])).toBe('full')
  })

  it("shows what's on now and next", () => {
    renderScreen()
    const now = screen.getByRole('region', { name: 'TV en vivo' }).querySelector('.go-tv_now')!
    expect(now.textContent).toContain('coraje · T1 · E1')
    expect(now.textContent).toMatch(/A continuación: .+ · \d\d:\d\d/)
  })

  it('opens the program\'s title from "Ver ficha"', () => {
    renderScreen()
    fireEvent.click(screen.getByRole('button', { name: 'Ver ficha' }))
    expect(onOpenTitle).toHaveBeenCalledWith('coraje')
  })

  it('lists every channel in the strip, current one marked', () => {
    renderScreen()
    const tiles = strip().querySelectorAll('[role="button"]')
    expect(tiles).toHaveLength(3)
    expect(tiles[0].getAttribute('aria-current')).toBe('true')
  })

  it('opens the strip on arrival and collapses it after 6 s without input, never removing it', () => {
    renderScreen()
    expect(strip().classList.contains('is-open')).toBe(true)
    act(() => vi.advanceTimersByTime(6000))
    expect(strip().classList.contains('is-open')).toBe(false)
    fireEvent.pointerMove(screen.getByRole('region', { name: 'TV en vivo' }))
    expect(strip().classList.contains('is-open')).toBe(true)
  })

  it('zaps with Up/Down and PageUp/PageDown, wrapping', () => {
    renderScreen()
    press('ArrowDown')
    press('PageDown')
    press('ArrowUp')
    press('PageUp')
    expect(onZap.mock.calls.map((c) => c[0])).toEqual(['dis', 'dis', 'dw', 'dw'])
  })

  it('jumps by channel number', () => {
    renderScreen()
    press('3')
    press('9')
    expect(onZap.mock.calls).toEqual([['dw']])
  })

  it('zaps with the remote\'s CH+ and CH− (Tizen keyCodes)', () => {
    renderScreen()
    fireEvent.keyDown(window, { key: 'Unidentified', keyCode: 427 })
    fireEvent.keyDown(window, { key: 'Unidentified', keyCode: 428 })
    expect(onZap.mock.calls.map((c) => c[0])).toEqual(['dis', 'dw'])
  })

  it('opens the program\'s title from the Info key', () => {
    renderScreen()
    fireEvent.keyDown(window, { key: 'Unidentified', keyCode: 457 })
    expect(onOpenTitle).toHaveBeenCalledWith('coraje')
    expect(onZap).not.toHaveBeenCalled()
  })

  it('opens the program\'s title on OK over the channel already playing', () => {
    renderScreen()
    press('ArrowRight')
    press('ArrowLeft')
    press('Enter')
    expect(onOpenTitle).toHaveBeenCalledWith('coraje')
    expect(onZap).not.toHaveBeenCalled()
  })

  it('goes back to the last channel watched on PRE-CH', () => {
    const { rerender } = renderScreen()
    rerender(tree(lineup.channels[2]))
    fireEvent.keyDown(window, { key: 'Unidentified', keyCode: 10190 })
    expect(onZap).toHaveBeenCalledWith('cn')
  })

  it('opens the strip on the playing channel from the channel list key', () => {
    renderScreen()
    press('ArrowRight')
    act(() => vi.advanceTimersByTime(6000))
    expect(strip().classList.contains('is-open')).toBe(false)
    fireEvent.keyDown(window, { key: 'Unidentified', keyCode: 10073 })
    expect(strip().classList.contains('is-open')).toBe(true)
    press('Enter')
    expect(onOpenTitle).toHaveBeenCalledWith('coraje')
  })

  describe('two-digit channel numbers', () => {
    const many: Lineup = { ...lineup, channels: Array.from({ length: 12 }, (_, i) => channelOf(`c${i + 1}`, i + 1, ['shrek'])) }
    const renderMany = () =>
      render(
        <TvProvider lineup={many}>
          <FocusProvider onBack={onBack}>
            <TvScreen channel={many.channels[4]} onZap={onZap} onOpenTitle={onOpenTitle} onBack={onBack} />
          </FocusProvider>
        </TvProvider>,
      )
    const entry = () => document.querySelector('.go-tv_entry')

    it('waits for a second digit, showing the first', () => {
      renderMany()
      press('1')
      expect(onZap).not.toHaveBeenCalled()
      expect(entry()!.textContent).toBe('1–')
      press('2')
      expect(onZap).toHaveBeenCalledWith('c12')
      expect(entry()).toBeNull()
    })

    it('tunes the first digit alone after a pause', () => {
      renderMany()
      press('1')
      act(() => vi.advanceTimersByTime(1500))
      expect(onZap).toHaveBeenCalledWith('c1')
      expect(entry()).toBeNull()
    })

    it('tunes a digit no longer number starts with at once', () => {
      renderMany()
      press('7')
      expect(onZap).toHaveBeenCalledWith('c7')
    })

    it('ignores a number with no channel', () => {
      renderMany()
      press('1')
      press('9')
      expect(onZap).not.toHaveBeenCalled()
      expect(entry()).toBeNull()
    })
  })

  it('tunes a tile on Enter after moving along the strip', () => {
    renderScreen()
    press('ArrowRight')
    press('Enter')
    expect(onZap).toHaveBeenCalledWith('dis')
  })

  it('goes back on Escape', () => {
    renderScreen()
    press('Escape')
    expect(onBack).toHaveBeenCalled()
  })

  it('flashes the channel number on a zap', () => {
    const { rerender } = renderScreen()
    rerender(tree(lineup.channels[1]))
    expect(document.querySelector('.go-tv_flash')!.textContent).toBe('2')
    act(() => vi.advanceTimersByTime(400))
    expect(document.querySelector('.go-tv_flash')).toBeNull()
  })

  it('zaps on a vertical swipe of the shield and toggles the strip on a tap', () => {
    renderScreen()
    const shield = document.querySelector('.go-tv_shield')!
    act(() => vi.advanceTimersByTime(6000))
    fireEvent.pointerDown(shield, { clientX: 100, clientY: 400 })
    fireEvent.pointerUp(shield, { clientX: 100, clientY: 405 })
    expect(strip().classList.contains('is-open')).toBe(true)
    fireEvent.pointerDown(shield, { clientX: 100, clientY: 400 })
    fireEvent.pointerUp(shield, { clientX: 100, clientY: 250 })
    expect(onZap).toHaveBeenCalledWith('dis')
  })

  it('holds the strip open while the channel is down, inviting a zap', () => {
    renderScreen()
    for (const wait of [8000, 1000, 8000, 2000, 8000, 3000, 8000]) act(() => vi.advanceTimersByTime(wait))
    expect(screen.getByRole('status').textContent).toMatch(/^Señal interrumpida/)
    act(() => vi.advanceTimersByTime(10_000))
    expect(strip().classList.contains('is-open')).toBe(true)
  })

  describe('sound', () => {
    function loadedMain() {
      const frame = document.querySelector('[data-channel="cn"] iframe') as HTMLIFrameElement
      const post = vi.spyOn(frame.contentWindow!, 'postMessage')
      fireEvent.load(frame)
      post.mockClear()
      return post
    }

    it('has a sound button that mutes and unmutes', () => {
      renderScreen()
      fireEvent.click(screen.getByRole('button', { name: 'Silenciar' }))
      expect(api.soundOn).toBe(false)
      fireEvent.click(screen.getByRole('button', { name: 'Activar sonido' }))
      expect(api.soundOn).toBe(true)
    })

    it('toggles sound with M', () => {
      renderScreen()
      press('m')
      expect(api.soundOn).toBe(false)
      press('M')
      expect(api.soundOn).toBe(true)
    })

    it('asks the embed for sound again on a tap or a key', () => {
      renderScreen()
      const post = loadedMain()
      const shield = document.querySelector('.go-tv_shield')!
      fireEvent.pointerDown(shield, { clientX: 1, clientY: 1 })
      expect(post).toHaveBeenCalledWith({ action: 'unmute' }, 'https://ok.ru')
      post.mockClear()
      press('ArrowRight')
      expect(post).toHaveBeenCalledWith({ action: 'unmute' }, 'https://ok.ru')
    })
  })

  it('lets a tap through to the embed, with a hint, while autoplay is blocked', () => {
    renderScreen()
    const frame = document.querySelector('[data-channel="cn"] iframe') as HTMLIFrameElement
    fireEvent.load(frame)
    const shield = document.querySelector('.go-tv_shield')!
    expect(shield.classList.contains('is-pass-through')).toBe(false)
    act(() => vi.advanceTimersByTime(4000))
    expect(shield.classList.contains('is-pass-through')).toBe(true)
    expect(screen.getByText('Tocá para ver')).not.toBeNull()
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { event: 'timeupdate', time: 64, duration: 600 }, origin: 'https://ok.ru', source: frame.contentWindow }))
    })
    expect(shield.classList.contains('is-pass-through')).toBe(false)
    expect(screen.queryByText('Tocá para ver')).toBeNull()
  })
})
