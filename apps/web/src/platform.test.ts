import { afterEach, describe, expect, it, vi } from 'vitest'
import { externalTitlesEnabled } from '@go10/core/external/config'
import { readProgress, writeProgress } from '@go10/core/progress/progressStore'
import { installWebPlatform } from './platform'

afterEach(() => {
  vi.unstubAllEnvs()
  localStorage.clear()
})

describe('installWebPlatform', () => {
  it('keeps watch progress in localStorage, under the keys the web app always used', () => {
    installWebPlatform()
    writeProgress('v1', { time: 100, duration: 1000 })
    expect(JSON.parse(localStorage.getItem('go10:progress:v1')!).time).toBe(100)
    expect(readProgress('v1')?.time).toBe(100)
  })

  it('reads the external-titles switch from the Vite env on every call', () => {
    installWebPlatform()
    expect(externalTitlesEnabled()).toBe(false)
    vi.stubEnv('VITE_EXTERNAL_TITLES', 'on')
    vi.stubEnv('VITE_TMDB_TOKEN', 'tok')
    expect(externalTitlesEnabled()).toBe(true)
  })
})
