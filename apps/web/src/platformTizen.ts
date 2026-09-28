/** Tizen's Web Device API, present only inside a packaged Tizen Web App. */
declare const tizen:
  | {
      tvinputdevice: { registerKey: (key: string) => void }
      application: { getCurrentApplication: () => { exit: () => void } }
    }
  | undefined

/** Tizen's own code for the physical Back/Return remote button, stable across every Tizen version. */
const TIZEN_BACK_KEYCODE = 10009

/**
 * Registers the physical Back/Return remote button -- Tizen doesn't deliver
 * it to the page at all otherwise -- and forwards it as the same synthetic
 * Escape keydown a real keyboard's Escape already produces, so
 * FocusProvider's existing Escape handling needs no changes. A no-op outside
 * a packaged Tizen app (web, mobile-web, tests).
 */
export function installTizenPlatform(): void {
  if (typeof tizen === 'undefined') return

  // Listen before registering: some Tizen versions/privilege configurations
  // reject registerKey with a WebAPIException, but the key can still arrive
  // if the platform delivers it anyway, and either way startup must not
  // blank-screen over a rejected registration.
  window.addEventListener('keydown', (event) => {
    if (event.keyCode === TIZEN_BACK_KEYCODE) {
      event.preventDefault()
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    }
  })

  try {
    tizen.tvinputdevice.registerKey('Back')
  } catch {
    // Not fatal -- see the comment above.
  }
}

/**
 * Exits the app -- called from App.tsx's back() when there's nowhere left to
 * navigate to (the Home route). A no-op outside a packaged Tizen app.
 */
export function exitAppIfTizen(): void {
  if (typeof tizen === 'undefined') return
  tizen.application.getCurrentApplication().exit()
}
