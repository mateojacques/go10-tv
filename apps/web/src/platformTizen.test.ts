import { afterEach, describe, expect, it, vi } from 'vitest'
import { installTizenPlatform, exitAppIfTizen } from './platformTizen'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('installTizenPlatform', () => {
  it('does nothing outside a packaged Tizen app', () => {
    expect(() => installTizenPlatform()).not.toThrow()
  })

  it('registers the Back key and forwards it as an Escape keydown', () => {
    const registerKey = vi.fn()
    vi.stubGlobal('tizen', { tvinputdevice: { registerKey } })

    installTizenPlatform()
    expect(registerKey).toHaveBeenCalledWith('Back')

    const onEscape = vi.fn()
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') onEscape()
    })

    // Tizen's physical Back/Return button always reports keyCode 10009,
    // regardless of firmware version -- unlike `event.key`, which has
    // varied across Tizen releases.
    const backEvent = new KeyboardEvent('keydown', {})
    Object.defineProperty(backEvent, 'keyCode', { value: 10009 })
    window.dispatchEvent(backEvent)

    expect(onEscape).toHaveBeenCalled()
  })
})

describe('exitAppIfTizen', () => {
  it('does nothing outside a packaged Tizen app', () => {
    expect(() => exitAppIfTizen()).not.toThrow()
  })

  it('exits the current Tizen application', () => {
    const exit = vi.fn()
    vi.stubGlobal('tizen', { application: { getCurrentApplication: () => ({ exit }) } })

    exitAppIfTizen()
    expect(exit).toHaveBeenCalled()
  })
})
