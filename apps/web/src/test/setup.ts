import { beforeEach } from 'vitest'
import { resetHeroPickForTests } from '@go10/core/hero/pickHero'
import { resetHeroArtForTests } from '../catalog/useHeroArt'
import { setInputMode } from '../focus/inputMode'
import { installWebPlatform } from '../platform'

installWebPlatform()

// Most suites exercise the remote-driven grid, so they start as a TV would.
// Pointer-mode behaviour is tested explicitly where it matters.
beforeEach(() => setInputMode('keys'))

// The hero pick and its sidecar are per page load; each test is a fresh page.
beforeEach(() => {
  resetHeroPickForTests()
  resetHeroArtForTests()
})
