import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  readProgress,
  writeProgress,
  markWatched,
  listProgress,
  resumeFromTime,
  isWatchedAt,
  MIN_START_SECONDS,
} from './progressStore'

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('progressStore', () => {
  it('returns null when nothing has been stored', () => {
    expect(readProgress('1')).toBeNull()
  })

  it('round-trips a position, stamping updatedAt', () => {
    writeProgress('1', { time: 120, duration: 700 }, 5000)
    expect(readProgress('1')).toEqual({ time: 120, duration: 700, updatedAt: 5000, watched: false })
  })

  it('ignores positions before the minimum start, so an accidental open is not "started"', () => {
    writeProgress('1', { time: MIN_START_SECONDS - 1, duration: 700 })
    expect(readProgress('1')).toBeNull()
  })

  it('keeps an existing entry when a later position is below the minimum start', () => {
    writeProgress('1', { time: 300, duration: 700 }, 1000)
    writeProgress('1', { time: 2, duration: 700 }, 2000)
    expect(readProgress('1')?.time).toBe(300)
  })

  it('marks as watched in the final stretch of the video', () => {
    writeProgress('1', { time: 680, duration: 700 })
    expect(readProgress('1')?.watched).toBe(true)
  })

  it('un-watches a rewatch once it is back in progress', () => {
    markWatched('1', 700)
    writeProgress('1', { time: 120, duration: 700 })
    expect(readProgress('1')?.watched).toBe(false)
  })

  it('markWatched stores a watched entry at the end', () => {
    markWatched('1', 700, 9000)
    expect(readProgress('1')).toEqual({ time: 700, duration: 700, updatedAt: 9000, watched: true })
  })

  it('returns null for malformed stored data instead of throwing', () => {
    localStorage.setItem('go10:progress:1', 'not json')
    expect(readProgress('1')).toBeNull()
    localStorage.setItem('go10:progress:2', JSON.stringify({ time: 'x' }))
    expect(readProgress('2')).toBeNull()
  })

  it('degrades silently when storage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(() => writeProgress('1', { time: 120, duration: 700 })).not.toThrow()
    expect(readProgress('1')).toBeNull()
    expect(listProgress()).toEqual({})
  })

  it('lists every stored entry keyed by video id, skipping unrelated keys', () => {
    writeProgress('1', { time: 120, duration: 700 }, 1)
    writeProgress('2', { time: 200, duration: 700 }, 2)
    localStorage.setItem('something-else', 'x')
    expect(Object.keys(listProgress()).sort()).toEqual(['1', '2'])
  })
})

describe('isWatchedAt', () => {
  it('uses a 60s tail for long videos', () => {
    expect(isWatchedAt(639, 700)).toBe(false)
    expect(isWatchedAt(641, 700)).toBe(true)
  })

  it('uses 95% for short videos', () => {
    expect(isWatchedAt(280, 300)).toBe(false)
    expect(isWatchedAt(286, 300)).toBe(true)
  })

  it('is never watched with an unknown duration', () => {
    expect(isWatchedAt(5000, 0)).toBe(false)
  })
})

describe('resumeFromTime', () => {
  it('rewinds a few seconds from the saved position', () => {
    expect(resumeFromTime({ time: 120.7, duration: 700, updatedAt: 0, watched: false })).toBe(117)
  })

  it('starts over for watched or missing entries', () => {
    expect(resumeFromTime(null)).toBeNull()
    expect(resumeFromTime({ time: 690, duration: 700, updatedAt: 0, watched: true })).toBeNull()
  })
})
