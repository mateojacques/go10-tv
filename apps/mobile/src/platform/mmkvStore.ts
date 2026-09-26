import type { KeyValueStore } from '@go10/core/ports/keyValueStore'

/** The slice of react-native-mmkv v4's `MMKV` the store uses (a fake in tests). */
export interface MMKVLike {
  getString(key: string): string | undefined
  set(key: string, value: string): void
  remove(key: string): boolean
  getAllKeys(): string[]
}

/** Core's KeyValueStore over MMKV: synchronous, like localStorage on the web. */
export function mmkvStore(mmkv: MMKVLike): KeyValueStore {
  return {
    getItem: (key) => mmkv.getString(key) ?? null,
    setItem: (key, value) => mmkv.set(key, value),
    removeItem: (key) => {
      mmkv.remove(key)
    },
    keys: () => mmkv.getAllKeys(),
  }
}
