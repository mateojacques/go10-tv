import { describe, expect, it } from 'vitest'
import { clockLabel, programLabel, progressOf } from './describe'
import { catalogRow } from './testing'
import type { Unit } from './types'

const unit = (overrides: Parameters<typeof catalogRow>[0]): Unit => ({ row: catalogRow(overrides), key: 'k', start: 0, length: 600 })

describe('programLabel', () => {
  it('names a movie by its title', () => {
    expect(programLabel(unit({ type: 'movie', title: 'Mulán' }))).toBe('Mulán')
  })
  it('names an episode by series and position', () => {
    expect(programLabel(unit({ type: 'episode', series_title: 'Coraje', season_number: 2, episode_number: 5 }))).toBe('Coraje · T2 · E5')
  })
  it('names a whole-season video by series and season', () => {
    expect(programLabel(unit({ type: 'season', series_title: 'Love, Death & Robots', season_number: 1, season_label: 'Volumen 1' }))).toBe('Love, Death & Robots · Volumen 1')
  })
})

describe('clockLabel', () => {
  it('formats local HH:MM', () => {
    const d = new Date(2026, 9, 1, 9, 5)
    expect(clockLabel(d.getTime())).toBe('09:05')
  })
})

describe('progressOf', () => {
  it('is the fraction of the unit aired, clamped', () => {
    const u = unit({})
    const airing = { unit: u, titleKey: 't', startsAt: 0, endsAt: 600_000 }
    expect(progressOf({ current: airing, offset: 150, next: [] })).toBe(0.25)
    expect(progressOf({ current: airing, offset: 900, next: [] })).toBe(1)
  })
})
