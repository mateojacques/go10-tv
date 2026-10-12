import { describe, it, expect } from 'vitest'
import { formatDuration, formatViews, formatClock } from './format'

describe('formatDuration', () => {
  it('formats hours and minutes', () => {
    expect(formatDuration(14909)).toBe('4 h 8 min')
  })

  it('formats minutes only when under an hour', () => {
    expect(formatDuration(750)).toBe('12 min')
  })

  it('truncates rather than rounding up a part-minute', () => {
    // 750s is 12.5 min: rounding would read "13 min" for a 12-minute video.
    expect(formatDuration(779)).toBe('12 min')
    expect(formatDuration(7199)).toBe('1 h 59 min')
  })

  it('handles an exact hour', () => {
    expect(formatDuration(3600)).toBe('1 h 0 min')
  })

  it('handles zero and missing durations', () => {
    expect(formatDuration(0)).toBe('')
  })
})

describe('formatViews', () => {
  it('groups thousands the Spanish way', () => {
    // es-ES sets minimumGroupingDigits=2, so grouping starts at five digits:
    // 1444 stays "1444" while 14444 becomes "14.444". This is correct Spanish,
    // not a missing separator.
    expect(formatViews(1444)).toBe('1444 vistas')
    expect(formatViews(14444)).toBe('14.444 vistas')
    expect(formatViews(1444444)).toBe('1.444.444 vistas')
  })

  it('uses the singular for one', () => {
    expect(formatViews(1)).toBe('1 vista')
  })

  it('handles zero', () => {
    expect(formatViews(0)).toBe('0 vistas')
  })
})

describe('formatClock', () => {
  it('shows m:ss, or h:mm:ss from an hour', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(75.9)).toBe('1:15')
    expect(formatClock(3725)).toBe('1:02:05')
    expect(formatClock(-3)).toBe('0:00')
  })
})
