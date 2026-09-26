/**
 * Build-time switch for external titles (TMDB search + vidlove playback).
 * Off unless the switch is `on` *and* a TMDB token is set; off, the app is
 * exactly the catalog-only app. Each app installs where the values come
 * from (web: Vite env; mobile: Expo config). Read per call so tests can stub it.
 */
export interface ExternalConfigValues {
  externalTitles: string | undefined
  tmdbToken: string | undefined
}

let source: () => ExternalConfigValues = () => ({ externalTitles: undefined, tmdbToken: undefined })

export function setExternalConfigSource(next: () => ExternalConfigValues): void {
  source = next
}

export function externalTitlesEnabled(): boolean {
  const { externalTitles, tmdbToken } = source()
  return externalTitles === 'on' && Boolean(tmdbToken)
}

/** TMDB v4 read-access token. Ships in the bundle: read-only by design. */
export function tmdbToken(): string {
  return source().tmdbToken ?? ''
}
