import { setExternalConfigSource } from '@go10/core/external/config'
import { setKeyValueStore, webStorageStore } from '@go10/core/ports/keyValueStore'
import { configureYoutube } from '@go10/core/player/providers/youtube'

/**
 * Wires core to the browser: localStorage for progress and snapshots, Vite's
 * env for the external-titles switch, and the page's origin for YouTube (a
 * file:// page, packaged Tizen, embeds through the site's relay instead).
 */
export function installWebPlatform(): void {
  setKeyValueStore(webStorageStore(() => localStorage))
  setExternalConfigSource(() => ({
    externalTitles: import.meta.env.VITE_EXTERNAL_TITLES,
    tmdbToken: import.meta.env.VITE_TMDB_TOKEN,
  }))
  configureYoutube({
    pageOrigin: typeof location !== 'undefined' && /^https?:$/.test(location.protocol) ? location.origin : null,
    relayUrl: import.meta.env.VITE_YT_RELAY || null,
  })
}
