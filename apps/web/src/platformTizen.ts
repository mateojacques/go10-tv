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
  // Listen unconditionally, before registering: the dev shell loads the app
  // from a LAN URL, where the `tizen` global isn't injected but the Back key
  // still arrives. 10009 means nothing on any other platform. Listening
  // first also covers Tizen versions/privilege configurations that reject
  // registerKey with a WebAPIException but deliver the key anyway -- either
  // way startup must not blank-screen over a rejected registration.
  window.addEventListener('keydown', (event) => {
    if (event.keyCode === TIZEN_BACK_KEYCODE) {
      event.preventDefault()
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    }
  })

  if (typeof tizen === 'undefined') return
  try {
    tizen.tvinputdevice.registerKey('Back')
  } catch {
    // Not fatal -- see the comment above.
  }
}

/**
 * Forces a fixed 1920x1080 logical viewport, overriding `width=device-width`
 * -- verified on real hardware (Samsung 2020 T5300, Tizen 5.5) that
 * device-width computes far narrower than the TV's actual 1920x1080 panel,
 * triggering this app's max-width:720px mobile layout and breaking every
 * other vw/vh-relative size in the app. A no-op outside a packaged Tizen
 * app.
 */
export function fixTizenViewport(): void {
  if (typeof tizen === 'undefined') return
  let meta = document.querySelector('meta[name="viewport"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute('name', 'viewport')
    document.head.appendChild(meta)
  }
  meta.setAttribute('content', 'width=1920, height=1080, initial-scale=1.0, user-scalable=no')
}

/**
 * Exits the app -- called from App.tsx's back() when there's nowhere left to
 * navigate to (the Home route). A no-op outside a packaged Tizen app.
 */
export function exitAppIfTizen(): void {
  if (typeof tizen === 'undefined') return
  tizen.application.getCurrentApplication().exit()
}
