import { describe, expect, it } from 'vitest'
import type { CatalogRow, Title } from '../types'
import type { Progress } from './progressStore'
import { continueCardProgress, playMeta, rowStatus } from './describe'
import type { ContinueItem } from './titleProgress'

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

describe('continueCardProgress', () => {
  const show = { kind: 'show' } as Title
  const movieRow = { ...row, type: 'movie' } as CatalogRow
  const item = (progress: ContinueItem['progress']): ContinueItem => ({ title: show, progress })

  it('shows the played share and what is left of the episode in progress', () => {
    expect(continueCardProgress(item({ row, mode: 'resume', progress: p(720), updatedAt: 1 })))
      .toEqual({ fraction: 0.5, label: 'T1 · E2 · Quedan 12 min' })
    expect(continueCardProgress(item({ row: movieRow, mode: 'resume', progress: p(720), updatedAt: 1 })))
      .toEqual({ fraction: 0.5, label: 'Quedan 12 min' })
  })

  it('names the next episode, with no bar, once the last one was finished', () => {
    expect(continueCardProgress(item({ row, mode: 'next', progress: null, updatedAt: 1 })))
      .toEqual({ fraction: 0, label: 'Siguiente: T1 · E2' })
  })
})
