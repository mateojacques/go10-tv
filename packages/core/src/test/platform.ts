/// <reference types="vite/client" />
import { setExternalConfigSource } from '../external/config'
import { setKeyValueStore, webStorageStore } from '../ports/keyValueStore'

/** What core's tests run on: jsdom's localStorage, and Vitest's env (stubbable with vi.stubEnv). */
export function installTestPlatform(): void {
  setKeyValueStore(webStorageStore(() => localStorage))
  setExternalConfigSource(() => ({
    externalTitles: import.meta.env.VITE_EXTERNAL_TITLES,
    tmdbToken: import.meta.env.VITE_TMDB_TOKEN,
  }))
}
