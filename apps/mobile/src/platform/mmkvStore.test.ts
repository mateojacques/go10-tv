import { readProgress, writeProgress } from '@go10/core/progress/progressStore'
import { keyValueStore, setKeyValueStore } from '@go10/core/ports/keyValueStore'
import { mmkvStore, type MMKVLike } from './mmkvStore'

function fakeMMKV(): MMKVLike & { values: Map<string, string> } {
  const values = new Map<string, string>()
  return {
    values,
    getString: (key) => values.get(key),
    set: (key, value) => void values.set(key, value),
    remove: (key) => values.delete(key),
    getAllKeys: () => [...values.keys()],
  }
}

describe('mmkvStore', () => {
  it('maps the KeyValueStore port onto MMKV', () => {
    const mmkv = fakeMMKV()
    const store = mmkvStore(mmkv)
    store.setItem('a', '1')
    expect(store.getItem('a')).toBe('1')
    expect(store.getItem('missing')).toBeNull()
    expect(store.keys()).toEqual(['a'])
    store.removeItem('a')
    expect(mmkv.values.size).toBe(0)
  })

  it('keeps watch progress under the same keys the web app uses', () => {
    const previous = keyValueStore()
    const mmkv = fakeMMKV()
    setKeyValueStore(mmkvStore(mmkv))
    try {
      writeProgress('v1', { time: 100, duration: 1000 })
      expect(JSON.parse(mmkv.values.get('go10:progress:v1')!).time).toBe(100)
      expect(readProgress('v1')?.time).toBe(100)
    } finally {
      setKeyValueStore(previous)
    }
  })
})
