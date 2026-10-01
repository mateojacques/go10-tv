import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { TvProvider, useTv, type TvApi } from './TvProvider'
import { TvLayer } from './TvLayer'
import { buildChannelPlan } from '@go10/core/tv/plan'
import { collectionOf, movieTitle } from '@go10/core/tv/testing'
import type { Channel, Lineup } from '@go10/core/tv/types'
import { writeLastChannel } from '@go10/core/tv/lineup'

const EPOCH = Date.UTC(2026, 9, 1)
const titles = [movieTitle('m1', 3000), movieTitle('m2', 3000), movieTitle('m3', 3000)]
const channelOf = (id: string, number: number, key: string): Channel => {
  const collection = collectionOf(id, [key])
  return { id, number, name: id.toUpperCase(), collection, plan: buildChannelPlan({ id, number, collection: id }, collection, titles) }
}
const lineup: Lineup = { epochMs: EPOCH, defaultChannel: 'b', channels: [channelOf('a', 1, 'm1'), channelOf('b', 2, 'm2'), channelOf('c', 3, 'm3')] }

let api: TvApi
function Grab() {
  api = useTv()
  return null
}
const onOpen = vi.fn()
function renderLayer() {
  render(
    <TvProvider lineup={lineup}>
      <Grab />
      <TvLayer onOpen={onOpen} />
    </TvProvider>,
  )
}
const slots = () => [...document.querySelectorAll<HTMLElement>('.go-tvslot')].map((el) => [el.dataset.channel, el.className.replace('go-tvslot go-tvslot--', '')])

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(EPOCH + 1000)
  localStorage.clear()
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('fine'), addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  onOpen.mockReset()
})

describe('TvProvider + TvLayer', () => {
  it('preloads the default channel staged, then shows it full when watched', () => {
    renderLayer()
    act(() => api.preload())
    expect(slots()).toEqual([['b', 'staged']])
    const frame = document.querySelector('.go-tvslot_frame')
    act(() => api.setScreen('tv'))
    act(() => api.watch('b'))
    expect(slots()).toEqual([['b', 'full']])
    expect(document.querySelector('.go-tvslot_frame')).toBe(frame) // same iframe: no reload
  })

  it('preloads the last channel watched when there is one', () => {
    writeLastChannel('c')
    renderLayer()
    act(() => api.preload())
    expect(slots()).toEqual([['c', 'staged']])
  })

  it('does not replace a channel that is already loaded', () => {
    renderLayer()
    act(() => {
      api.setScreen('tv')
      api.watch('a')
    })
    act(() => api.preload('c'))
    expect(slots()).toEqual([['a', 'full']])
  })

  it('keeps one main slot through rapid zapping', () => {
    renderLayer()
    act(() => api.setScreen('tv'))
    for (const id of ['a', 'b', 'c', 'a', 'b']) act(() => api.watch(id))
    expect(slots()).toEqual([['b', 'full']])
    expect(document.querySelectorAll('iframe')).toHaveLength(1)
  })

  it('promotes the preview to main on watch, reusing its iframe', () => {
    renderLayer()
    act(() => {
      api.setScreen('tv')
      api.watch('a')
    })
    act(() => api.previewAt('c', { top: 0, left: 0, width: 300, height: 169 }))
    expect(slots()).toEqual([['a', 'full'], ['c', 'tile']])
    const previewFrame = document.querySelector('[data-channel="c"] iframe')
    act(() => api.watch('c'))
    expect(slots()).toEqual([['c', 'full']])
    expect(document.querySelector('[data-channel="c"] iframe')).toBe(previewFrame)
    expect(api.promoted).toBe(true)
  })

  it('replaces the preview when another tile is hovered, and drops it on endPreview', () => {
    renderLayer()
    act(() => {
      api.setScreen('tv')
      api.watch('a')
    })
    act(() => api.previewAt('b', { top: 0, left: 0, width: 1, height: 1 }))
    act(() => api.previewAt('c', { top: 0, left: 0, width: 1, height: 1 }))
    expect(slots()).toEqual([['a', 'full'], ['c', 'tile']])
    act(() => api.endPreview())
    expect(slots()).toEqual([['a', 'full']])
  })

  it('never previews the channel already on main, or on a touch screen', () => {
    renderLayer()
    act(() => {
      api.setScreen('tv')
      api.watch('a')
    })
    act(() => api.previewAt('a', { top: 0, left: 0, width: 1, height: 1 }))
    expect(slots()).toEqual([['a', 'full']])
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('coarse'), addEventListener() {}, removeEventListener() {} }))
    act(() => api.previewAt('b', { top: 0, left: 0, width: 1, height: 1 }))
    expect(slots()).toEqual([['a', 'full']])
  })

  it('shrinks to a mini-player away from the TV screen, which reopens it or closes', () => {
    renderLayer()
    act(() => {
      api.setScreen('tv')
      api.watch('a')
    })
    act(() => api.setScreen('away'))
    expect(slots()).toEqual([['a', 'mini']])
    fireEvent.click(screen.getByRole('button', { name: 'Volver a A en TV' }))
    expect(onOpen).toHaveBeenCalledWith('a')
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar TV' }))
    expect(slots()).toEqual([])
  })

  it('keeps a merely preloaded channel hidden away from the TV screen', () => {
    renderLayer()
    act(() => api.preload())
    act(() => api.setScreen('away'))
    expect(slots()).toEqual([['b', 'staged']])
    expect(screen.queryByRole('button', { name: /Volver a/ })).toBeNull()
  })

  it('remembers the channel watched', () => {
    renderLayer()
    act(() => api.watch('c'))
    expect(localStorage.getItem('go10:tvLastChannel')).toBe('c')
  })

  it('tells a loaded main embed to play once the viewer has opened TV', () => {
    renderLayer()
    act(() => api.preload('a'))
    const frame = document.querySelector('iframe') as HTMLIFrameElement
    const post = vi.spyOn(frame.contentWindow!, 'postMessage')
    fireEvent.load(frame)
    expect(post).not.toHaveBeenCalled() // staged, not activated: hands off
    act(() => {
      api.setScreen('tv')
      api.watch('a')
    })
    expect(post).toHaveBeenCalledWith({ action: 'play' }, 'https://ok.ru')
  })

  it('drops a preload nobody followed up on after 20 s, unless the intent is renewed', () => {
    renderLayer()
    act(() => api.preload('a'))
    act(() => vi.advanceTimersByTime(15_000))
    act(() => api.preload('a')) // hovered again: still wanted
    act(() => vi.advanceTimersByTime(15_000))
    expect(slots()).toEqual([['a', 'staged']])
    act(() => vi.advanceTimersByTime(5_000))
    expect(slots()).toEqual([])
  })

  it('never drops a channel the viewer opened', () => {
    renderLayer()
    act(() => api.preload('a'))
    act(() => {
      api.setScreen('tv')
      api.watch('a')
    })
    act(() => api.setScreen('away'))
    act(() => vi.advanceTimersByTime(60_000))
    expect(slots()).toEqual([['a', 'mini']])
  })

  describe('sound', () => {
    const UNMUTE = [{ action: 'unmute' }, 'https://ok.ru']
    const VOLUME_UP = [{ action: 'volume', value: 1 }, 'https://ok.ru']
    const MUTE = [{ action: 'mute' }, 'https://ok.ru']

    function watchLoaded(id: string) {
      act(() => {
        api.setScreen('tv')
        api.watch(id)
      })
      const frame = document.querySelector(`[data-channel="${id}"] iframe`) as HTMLIFrameElement
      const post = vi.spyOn(frame.contentWindow!, 'postMessage')
      fireEvent.load(frame)
      return post
    }

    it('turns the sound on for the channel being watched, once loaded', () => {
      renderLayer()
      const post = watchLoaded('a')
      expect(post).toHaveBeenCalledWith(...UNMUTE)
      expect(post).toHaveBeenCalledWith(...VOLUME_UP)
      expect(api.soundOn).toBe(true)
    })

    it('turns the sound back on with every gesture on the TV screen', () => {
      renderLayer()
      const post = watchLoaded('a')
      post.mockClear()
      act(() => api.nudgeSound())
      expect(post).toHaveBeenCalledWith(...UNMUTE)
    })

    it('mutes and unmutes on request, and gestures then leave it muted', () => {
      renderLayer()
      const post = watchLoaded('a')
      act(() => api.setSound(false))
      expect(post).toHaveBeenLastCalledWith(...MUTE)
      post.mockClear()
      act(() => api.nudgeSound())
      expect(post).not.toHaveBeenCalled()
      act(() => api.setSound(true))
      expect(post).toHaveBeenCalledWith(...UNMUTE)
    })

    it('mutes a preview once loaded, and unmutes it when promoted', () => {
      renderLayer()
      watchLoaded('a')
      act(() => api.previewAt('c', { top: 0, left: 0, width: 1, height: 1 }))
      const frame = document.querySelector('[data-channel="c"] iframe') as HTMLIFrameElement
      const post = vi.spyOn(frame.contentWindow!, 'postMessage')
      fireEvent.load(frame)
      expect(post).toHaveBeenCalledWith(...MUTE)
      expect(post).not.toHaveBeenCalledWith(...UNMUTE)
      act(() => api.watch('c'))
      expect(post).toHaveBeenCalledWith(...UNMUTE)
    })
  })
})
