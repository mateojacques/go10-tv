import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { installWebPlatform } from './platform'
import { installTizenPlatform } from './platformTizen'

installWebPlatform()
installTizenPlatform()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="go-grain" aria-hidden="true" />
    <App />
  </StrictMode>,
)
