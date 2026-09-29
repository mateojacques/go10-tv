import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Bundled rather than from Google Fonts: the TV app starts offline-fast from
// its own package, and the Latin subset covers Spanish.
import '@fontsource/bricolage-grotesque/latin-400.css'
import '@fontsource/bricolage-grotesque/latin-600.css'
import '@fontsource/bricolage-grotesque/latin-700.css'
import '@fontsource/bricolage-grotesque/latin-800.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import '@fontsource/ibm-plex-mono/latin-600.css'
import App from './App'
import { installWebPlatform } from './platform'
import { installTizenPlatform, fixTizenViewport } from './platformTizen'
import { isTvDevice } from './focus/inputMode'

// TV hardware can't afford the desktop's blurs, blends and filter
// transitions; `go-tv` switches the stylesheets to their lite variants.
if (isTvDevice()) document.documentElement.classList.add('go-tv')

fixTizenViewport()
installWebPlatform()
installTizenPlatform()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* A full-screen blend layer: every repaint beneath it re-blends the whole panel. */}
    {!isTvDevice() && <div className="go-grain" aria-hidden="true" />}
    <App />
  </StrictMode>,
)
