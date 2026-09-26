import { beforeEach } from 'vitest'
import { setInputMode } from '../focus/inputMode'

// Most suites exercise the remote-driven grid, so they start as a TV would.
// Pointer-mode behaviour is tested explicitly where it matters.
beforeEach(() => setInputMode('keys'))
