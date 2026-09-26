import { afterEach, describe, expect, it } from 'vitest'
import { keyValueStore, memoryStore, setKeyValueStore, webStorageStore } from './keyValueStore'

afterEach(() => localStorage.clear())

describe('memoryStore', () => {
  it('stores, lists and removes values', () => {
    const store = memoryStore()
    store.setItem('a', '1')
    store.setItem('b', '2')
    expect(store.getItem('a')).toBe('1')
    expect(store.getItem('missing')).toBeNull()
    expect(store.keys().sort()).toEqual(['a', 'b'])
    store.removeItem('a')
    expect(store.keys()).toEqual(['b'])
  })

  it('lists keys as a snapshot, so removing while iterating is safe', () => {
    const store = memoryStore()
    for (const key of ['a', 'b', 'c']) store.setItem(key, key)
    for (const key of store.keys()) store.removeItem(key)
    expect(store.keys()).toEqual([])
  })
})

describe('webStorageStore', () => {
  it('delegates to the Web Storage it is given', () => {
    const store = webStorageStore(() => localStorage)
    store.setItem('k', 'v')
    expect(localStorage.getItem('k')).toBe('v')
    expect(store.getItem('k')).toBe('v')
    expect(store.keys()).toEqual(['k'])
    store.removeItem('k')
    expect(localStorage.getItem('k')).toBeNull()
  })

  it('lists keys as a snapshot, so removing while iterating is safe', () => {
    const store = webStorageStore(() => localStorage)
    for (const key of ['a', 'b', 'c']) store.setItem(key, key)
    for (const key of store.keys()) store.removeItem(key)
    expect(localStorage.length).toBe(0)
  })

  it('reaches for the storage on every call, so a storage that throws on access throws where callers catch', () => {
    const store = webStorageStore(() => {
      throw new Error('SecurityError')
    })
    expect(() => store.getItem('k')).toThrow('SecurityError')
    expect(() => store.setItem('k', 'v')).toThrow('SecurityError')
    expect(() => store.keys()).toThrow('SecurityError')
  })
})

describe('keyValueStore', () => {
  it('is the store last installed', () => {
    const previous = keyValueStore()
    const installed = memoryStore()
    setKeyValueStore(installed)
    expect(keyValueStore()).toBe(installed)
    setKeyValueStore(previous)
  })
})
