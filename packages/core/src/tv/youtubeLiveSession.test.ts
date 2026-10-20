import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createYoutubeLiveSession } from './youtubeLiveSession'
import { RESUME_INTERVAL_MS } from './liveSession'
import type { LiveChannel } from './types'

const channel: LiveChannel = {
  kind: 'live', id: 'aj', number: 301, name: 'Al Jazeera', group: 'live',
  source: { videoId: 'gCNeDWCI0vo' }, logo: null, thumbnail: null,
}
const HANDSHAKE = '{"event":"listening","id":1,"channel":"widget"}'
const info = (fields: Record<string, number>) => JSON.stringify({ event: 'infoDelivery', info: fields })
const command = (func: string, args: unknown[] = []) => JSON.stringify({ event: 'command', func, args })

let clock = 0
function setup() {
  const sent: unknown[] = []
  const session = createYoutubeLiveSession({ channel, send: (c) => sent.push(c), now: () => clock })
  return { session, sent }
}

beforeEach(() => {
  vi.useFakeTimers()
  clock = 1_000_000
})
afterEach(() => vi.useRealTimers())

describe('createYoutubeLiveSession', () => {
  it('tunes to the live edge, muted so autoplay is never refused, every time', () => {
    const { session } = setup()
    const src = session.tune()
    expect(src).toBe('https://www.youtube-nocookie.com/embed/gCNeDWCI0vo?enablejsapi=1&autoplay=1&playsinline=1&rel=0&mute=1')
    expect(session.tune()).toBe(src)
  })

  it('always reloads to rejoin, and has no program', () => {
    const { session } = setup()
    session.tune()
    expect(session.sync()).toBe('load')
    expect(session.current()).toBeNull()
    expect(session.finishedEarly()).toBe(false)
  })

  it('handshakes on attach until the embed speaks', () => {
    const { session, sent } = setup()
    session.attach()
    vi.advanceTimersByTime(250)
    expect(sent).toEqual([HANDSHAKE, HANDSHAKE])
    session.handle(info({ currentTime: 7116396, playerState: 1 }))
    vi.advanceTimersByTime(2000)
    expect(sent).toHaveLength(2)
  })

  it('plays again when paused, at most every few seconds', () => {
    const { session, sent } = setup()
    session.handle(info({ playerState: 2 }))
    session.handle(info({ playerState: 2 }))
    expect(sent).toEqual([command('playVideo')])
    clock += RESUME_INTERVAL_MS
    session.handle(info({ playerState: 2 }))
    expect(sent).toHaveLength(2)
  })

  it('speaks YouTube for play, sound and position', () => {
    const { session } = setup()
    expect(session.origin).toBe('https://www.youtube-nocookie.com')
    expect(session.playMessage).toBe(command('playVideo'))
    expect(session.soundMessages(true)).toEqual([command('unMute'), command('setVolume', [100])])
    expect(session.soundMessages(false)).toEqual([command('mute')])
    expect(session.parseTime(info({ currentTime: 7116396.9 }))).toBe(7116396.9)
    expect(session.parseTime(info({ playerState: 3 }))).toBeNull()
  })
})
