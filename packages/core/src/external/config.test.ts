import { afterEach, describe, expect, it, vi } from 'vitest'
import { externalTitlesEnabled, setExternalConfigSource, tmdbToken } from './config'
import { installTestPlatform } from '../test/platform'

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

describe('setExternalConfigSource', () => {
  it('reads the switch and token from the installed source on every call', () => {
    let token = 'first'
    setExternalConfigSource(() => ({ externalTitles: 'on', tmdbToken: token }))
    try {
      expect(externalTitlesEnabled()).toBe(true)
      token = 'second'
      expect(tmdbToken()).toBe('second')
    } finally {
      installTestPlatform()
    }
  })
})
