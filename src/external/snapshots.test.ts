import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listSnapshots, readSnapshot, saveSnapshot, SNAPSHOT_LIMIT } from './snapshots'
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
