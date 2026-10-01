import { useSyncExternalStore } from 'react'

/** Safari before 16.4 (iPads included) only has the prefixed API. */
type WebkitDocument = Document & {
  webkitFullscreenEnabled?: boolean
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => void
}
type WebkitElement = HTMLElement & { webkitRequestFullscreen?: () => void }

const doc = () => document as WebkitDocument

/** False on an iPhone: its Safari lets only a <video> go fullscreen, never a page. */
export function canFullscreen(): boolean {
  return Boolean(doc().fullscreenEnabled || doc().webkitFullscreenEnabled)
}

function isFullscreen(): boolean {
  return Boolean(doc().fullscreenElement || doc().webkitFullscreenElement)
}

export function toggleFullscreen(): void {
  if (isFullscreen()) {
    if (doc().exitFullscreen) doc().exitFullscreen().catch(() => {})
    else doc().webkitExitFullscreen?.()
    return
  }
  const root = document.documentElement as WebkitElement
  if (root.requestFullscreen) root.requestFullscreen().catch(() => {})
  else root.webkitRequestFullscreen?.()
}

function subscribe(listener: () => void) {
  document.addEventListener('fullscreenchange', listener)
  document.addEventListener('webkitfullscreenchange', listener)
  return () => {
    document.removeEventListener('fullscreenchange', listener)
    document.removeEventListener('webkitfullscreenchange', listener)
  }
}

/** Whether the page is fullscreen now, Esc and the system's own gestures included. */
export function useFullscreen(): boolean {
  return useSyncExternalStore(subscribe, isFullscreen)
}
