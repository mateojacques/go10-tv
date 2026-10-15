import { imageSrc } from '@go10/core/lib/imageSrc'

/**
 * Where the app's own art (catalog thumbnails, collection logos) is served
 * from. The site serves it itself (`/`); the Tizen build points at the site
 * instead (VITE_IMAGE_BASE in .env.tizen), so the TV package doesn't carry
 * hundreds of MB of thumbnails it can fetch like the Android app does.
 */
export function artBase(env: { VITE_IMAGE_BASE?: string } = import.meta.env): string {
  return env.VITE_IMAGE_BASE || '/'
}

/** A catalog/collection art path (or an absolute TMDB URL) -> its URL. */
export function artSrc(path: string, base = artBase()): string {
  return imageSrc(path, base)
}
