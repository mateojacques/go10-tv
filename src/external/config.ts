/**
 * Build-time switch for external titles (TMDB search + vidlove playback).
 * Off unless `VITE_EXTERNAL_TITLES=on` *and* a TMDB token is set; off, the
 * app is exactly the catalog-only app. Read per call so tests can stub it.
 */
export function externalTitlesEnabled(): boolean {
  return import.meta.env.VITE_EXTERNAL_TITLES === 'on' && Boolean(import.meta.env.VITE_TMDB_TOKEN)
}

/** TMDB v4 read-access token. Ships in the bundle: read-only by design. */
export function tmdbToken(): string {
  return import.meta.env.VITE_TMDB_TOKEN ?? ''
}
