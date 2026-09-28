import { afterEach, describe, expect, it, vi } from 'vitest'
import { installTizenPlatform, exitAppIfTizen, fixTizenViewport } from './platformTizen'

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

describe('fixTizenViewport', () => {
  afterEach(() => {
    document.querySelectorAll('meta[name="viewport"]').forEach((meta) => meta.remove())
  })

  it('does nothing outside a packaged Tizen app', () => {
    expect(() => fixTizenViewport()).not.toThrow()
  })

  it('forces a fixed 1920x1080 viewport, overriding device-width', () => {
    // device-width reports far narrower than 1920 on this engine (verified
    // on real hardware: it triggers this app's max-width:720px mobile
    // layout on an actual 1920x1080 TV), breaking every vw/vh-relative
    // size in the app, not just that one breakpoint.
    const meta = document.createElement('meta')
    meta.setAttribute('name', 'viewport')
    meta.setAttribute('content', 'width=device-width, initial-scale=1.0')
    document.head.appendChild(meta)
    vi.stubGlobal('tizen', {})

    fixTizenViewport()

    expect(document.querySelector('meta[name="viewport"]')?.getAttribute('content')).toBe(
      'width=1920, height=1080, initial-scale=1.0, user-scalable=no',
    )
  })

  it('creates the meta tag if none exists', () => {
    vi.stubGlobal('tizen', {})

    fixTizenViewport()

    expect(document.querySelector('meta[name="viewport"]')?.getAttribute('content')).toBe(
      'width=1920, height=1080, initial-scale=1.0, user-scalable=no',
    )
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
