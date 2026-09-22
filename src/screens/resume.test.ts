import { describe, it, expect, beforeEach } from 'vitest'
import { markResumeStart, readResumeFromTime, clearResume, RESUME_MAX_AGE_MS } from './resume'

beforeEach(() => {
  localStorage.clear()
})

describe('resume', () => {
  it('returns null when nothing has been marked', () => {
    expect(readResumeFromTime('1')).toBeNull()
  })

  it('returns 0 immediately after marking (nothing to rewind past yet)', () => {
    markResumeStart('1', 1000)
    expect(readResumeFromTime('1', 1000)).toBe(0)
  })

  it('returns elapsed seconds minus the rewind buffer', () => {
    markResumeStart('1', 0)
    expect(readResumeFromTime('1', 30_000)).toBe(25) // 30s elapsed - 5s rewind
  })

  it('returns null once the entry is older than the max age', () => {
    markResumeStart('1', 0)
    expect(readResumeFromTime('1', RESUME_MAX_AGE_MS + 1000)).toBeNull()
  })

  it('returns null after clearResume', () => {
    markResumeStart('1', 0)
    clearResume('1')
    expect(readResumeFromTime('1', 1000)).toBeNull()
  })

  it('returns null for malformed stored data instead of throwing', () => {
    localStorage.setItem('go10:resume:1', 'not json')
    expect(readResumeFromTime('1')).toBeNull()
  })

  it('keys entries per video id', () => {
    markResumeStart('1', 0)
    expect(readResumeFromTime('2', 30_000)).toBeNull()
  })
})
