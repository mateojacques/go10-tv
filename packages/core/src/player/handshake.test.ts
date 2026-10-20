import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HANDSHAKE_INTERVAL_MS, HANDSHAKE_MAX_TRIES, startHandshake } from './handshake'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('startHandshake', () => {
  it('sends at once, then every interval until stopped', () => {
    const sent: unknown[] = []
    const handshake = startHandshake('hello', (m) => sent.push(m))
    expect(sent).toEqual(['hello'])
    vi.advanceTimersByTime(HANDSHAKE_INTERVAL_MS * 2)
    expect(sent).toHaveLength(3)
    handshake.stop()
    vi.advanceTimersByTime(HANDSHAKE_INTERVAL_MS * 10)
    expect(sent).toHaveLength(3)
  })

  it('gives up after the last try', () => {
    const sent: unknown[] = []
    startHandshake('hello', (m) => sent.push(m))
    vi.advanceTimersByTime(HANDSHAKE_INTERVAL_MS * 100)
    expect(sent).toHaveLength(HANDSHAKE_MAX_TRIES)
  })
})
