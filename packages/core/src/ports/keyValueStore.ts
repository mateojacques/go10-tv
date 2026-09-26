/**
 * Where core keeps small persistent values (watch progress, TMDB snapshots).
 * Synchronous on purpose, so the code using it stays synchronous: the web
 * app backs it with localStorage, the mobile app with MMKV. Any method may
 * throw (storage disabled, quota exceeded); callers treat storage as
 * best-effort and catch.
 */
export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  /** Every key, as a snapshot: removing items while iterating it is safe. */
  keys(): string[]
}

/** The part of the Web Storage API the web adapter uses. */
export interface StorageLike {
  readonly length: number
  key(index: number): string | null
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function memoryStore(): KeyValueStore {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
    removeItem: (key) => {
      values.delete(key)
    },
    keys: () => [...values.keys()],
  }
}

/**
 * `getStorage` runs on every call rather than once: merely touching
 * `localStorage` can throw (blocked site data), and that has to surface
 * inside the caller's try/catch, never at startup.
 */
export function webStorageStore(getStorage: () => StorageLike): KeyValueStore {
  return {
    getItem: (key) => getStorage().getItem(key),
    setItem: (key, value) => getStorage().setItem(key, value),
    removeItem: (key) => getStorage().removeItem(key),
    keys: () => {
      const storage = getStorage()
      const keys: string[] = []
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i)
        if (key !== null) keys.push(key)
      }
      return keys
    },
  }
}

// Until an app installs its store, values live in memory for the session.
let current: KeyValueStore = memoryStore()

export function setKeyValueStore(store: KeyValueStore): void {
  current = store
}

export function keyValueStore(): KeyValueStore {
  return current
}
