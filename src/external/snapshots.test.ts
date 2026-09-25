import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listSnapshots, readSnapshot, saveSnapshot, SNAPSHOT_BUDGET_CHARS, SNAPSHOT_LIMIT } from './snapshots'
import { mapMovie } from './tmdb/map'

const movie = (id: number) => mapMovie({ id, title: `Movie ${id}`, backdrop_path: '/x.jpg' })

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('snapshots', () => {
  it('round-trips a title', () => {
    saveSnapshot(movie(1))
    expect(readSnapshot('tmdb-movie-1')).toEqual(movie(1))
  })

  it('lists newest first', () => {
    saveSnapshot(movie(1), 100)
    saveSnapshot(movie(2), 200)
    expect(listSnapshots().map((t) => t.key)).toEqual(['tmdb-movie-2', 'tmdb-movie-1'])
  })

  it(`keeps only the newest ${SNAPSHOT_LIMIT}`, () => {
    for (let i = 0; i < SNAPSHOT_LIMIT + 2; i++) saveSnapshot(movie(i), i)
    expect(listSnapshots()).toHaveLength(SNAPSHOT_LIMIT)
    expect(readSnapshot('tmdb-movie-0')).toBeNull()
    expect(readSnapshot('tmdb-movie-1')).toBeNull()
    expect(readSnapshot('tmdb-movie-2')).not.toBeNull()
  })

  it('keeps snapshots within a size budget, so progress always has room', () => {
    const big = (id: number) => ({ ...movie(id), title: 'x'.repeat(Math.ceil(SNAPSHOT_BUDGET_CHARS / 2.5)) })
    saveSnapshot(big(1), 1)
    saveSnapshot(big(2), 2)
    saveSnapshot(big(3), 3)
    expect(listSnapshots().map((t) => t.key)).toEqual(['tmdb-movie-3', 'tmdb-movie-2'])
  })

  it('makes room and retries when storage is full', () => {
    saveSnapshot(movie(1), 1)
    saveSnapshot(movie(2), 2)
    const setItem = Storage.prototype.setItem
    let failures = 0
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === 'go10:tmdb-title:tmdb-movie-3' && failures++ === 0) throw new DOMException('full', 'QuotaExceededError')
      setItem.call(this, key, value)
    })
    saveSnapshot(movie(3), 3)
    expect(listSnapshots().map((t) => t.key)).toEqual(['tmdb-movie-3', 'tmdb-movie-2'])
  })

  it('ignores corrupt entries', () => {
    localStorage.setItem('go10:tmdb-title:tmdb-movie-9', '{nope')
    localStorage.setItem('go10:tmdb-title:tmdb-movie-8', JSON.stringify({ savedAt: 1, title: { key: 3 } }))
    expect(listSnapshots()).toEqual([])
    expect(readSnapshot('tmdb-movie-9')).toBeNull()
  })

  it('never throws when storage does', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => saveSnapshot(movie(1))).not.toThrow()
  })
})
