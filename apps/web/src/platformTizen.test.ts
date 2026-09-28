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

  it('prevents the default on the original Back keydown', () => {
    vi.stubGlobal('tizen', { tvinputdevice: { registerKey: vi.fn() } })
    installTizenPlatform()

    const backEvent = new KeyboardEvent('keydown', { cancelable: true })
    Object.defineProperty(backEvent, 'keyCode', { value: 10009 })
    window.dispatchEvent(backEvent)

    expect(backEvent.defaultPrevented).toBe(true)
  })

  it('still forwards the Back key even if registerKey itself throws', () => {
    // Some Tizen versions/privilege configurations reject registerKey with a
    // WebAPIException; the app must not blank-screen at startup over it, and
    // the key should still be forwarded if the platform delivers it anyway.
    const registerKey = vi.fn(() => {
      throw new Error('WebAPIException: NotSupportedError')
    })
    vi.stubGlobal('tizen', { tvinputdevice: { registerKey } })

    expect(() => installTizenPlatform()).not.toThrow()

    const onEscape = vi.fn()
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') onEscape()
    })

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
