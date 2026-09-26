import { describe, expect, it } from 'vitest'
import type { CatalogRow, Title } from '../types'
import type { Progress } from './progressStore'
import { playMeta, rowStatus } from './describe'

const row = { type: 'episode', season_number: 1, episode_number: 2, duration_seconds: 1440 } as CatalogRow
const p = (time: number, watched = false): Progress => ({ time, duration: 1440, updatedAt: 1, watched })

describe('rowStatus', () => {
  it('is the duration, then Visto or what is left', () => {
    expect(rowStatus(row, undefined)).toBe('24 min')
    expect(rowStatus(row, p(1440, true))).toBe('24 min · Visto')
    expect(rowStatus(row, p(960))).toBe('24 min · Quedan 8 min')
  })

  it('drops the duration when unknown', () => {
    expect(rowStatus({ ...row, duration_seconds: 0 }, p(1440, true))).toBe('Visto')
  })
})

describe('playMeta', () => {
  const show = { kind: 'show' } as Title
  const movie = { kind: 'movie' } as Title

  it('names the episode and what is left of it', () => {
    expect(playMeta(show, row, p(960))).toBe('T1 · E2 · Quedan 8 min')
    expect(playMeta(show, row, null)).toBe('T1 · E2')
  })

  it('is empty for a movie not started', () => {
    expect(playMeta(movie, { ...row, type: 'movie' }, null)).toBe('')
    expect(playMeta(movie, { ...row, type: 'movie' }, p(960))).toBe('Quedan 8 min')
  })
})
