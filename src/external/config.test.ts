import { afterEach, describe, expect, it, vi } from 'vitest'
import { externalTitlesEnabled, tmdbToken } from './config'

afterEach(() => vi.unstubAllEnvs())

describe('externalTitlesEnabled', () => {
  it('is off by default in tests', () => {
    expect(externalTitlesEnabled()).toBe(false)
  })

  it('is off without a token, even when switched on', () => {
    vi.stubEnv('VITE_EXTERNAL_TITLES', 'on')
    vi.stubEnv('VITE_TMDB_TOKEN', '')
    expect(externalTitlesEnabled()).toBe(false)
  })

  it('is off for any value other than "on"', () => {
    vi.stubEnv('VITE_TMDB_TOKEN', 'tok')
    for (const value of ['true', 'ON', '1', 'yes', '']) {
      vi.stubEnv('VITE_EXTERNAL_TITLES', value)
      expect(externalTitlesEnabled()).toBe(false)
    }
  })

  it('is on with the switch and a token', () => {
    vi.stubEnv('VITE_EXTERNAL_TITLES', 'on')
    vi.stubEnv('VITE_TMDB_TOKEN', 'tok')
    expect(externalTitlesEnabled()).toBe(true)
    expect(tmdbToken()).toBe('tok')
  })
})
