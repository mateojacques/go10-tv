import { setExternalConfigSource } from '@go10/core/external/config'
import { setKeyValueStore, webStorageStore } from '@go10/core/ports/keyValueStore'

/** Wires core to the browser: localStorage for progress and snapshots, Vite's env for the external-titles switch. */
export function installWebPlatform(): void {
  setKeyValueStore(webStorageStore(() => localStorage))
  setExternalConfigSource(() => ({
    externalTitles: import.meta.env.VITE_EXTERNAL_TITLES,
    tmdbToken: import.meta.env.VITE_TMDB_TOKEN,
  }))
}
