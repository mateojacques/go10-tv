const mockDisk = new Map<string, string>()

jest.mock('expo-file-system', () => {
  class File {
    uri: string
    constructor(dir: { uri: string }, name: string) {
      this.uri = `${dir.uri}/${name}`
    }
    get exists() {
      return mockDisk.has(this.uri)
    }
    create() {
      mockDisk.set(this.uri, '')
    }
    write(text: string) {
      if (!mockDisk.has(this.uri)) throw new Error('write to missing file')
      mockDisk.set(this.uri, text)
    }
    textSync() {
      return mockDisk.get(this.uri) ?? ''
    }
  }
  return { File, Paths: { document: { uri: 'doc' } } }
})

import { fileTextCache } from './fileTextCache'

beforeEach(() => mockDisk.clear())

describe('fileTextCache', () => {
  it('reads back what it wrote, with its ETag', () => {
    const cache = fileTextCache()
    expect(cache.read('catalog.csv')).toBeNull()
    cache.write('catalog.csv', { body: 'a,b', etag: '"v1"' })
    expect(cache.read('catalog.csv')).toEqual({ body: 'a,b', etag: '"v1"' })
  })

  it('stores a missing ETag as none', () => {
    const cache = fileTextCache()
    cache.write('catalog.csv', { body: 'a,b', etag: null })
    expect(cache.read('catalog.csv')).toEqual({ body: 'a,b', etag: null })
  })

  it('never pairs a new body with an old ETag if a write stops halfway', () => {
    const cache = fileTextCache()
    cache.write('catalog.csv', { body: 'old', etag: '"v1"' })
    mockDisk.set('doc/catalog.csv', 'new')      // the body was written...
    mockDisk.set('doc/catalog.csv.etag', '')    // ...after the ETag was cleared, then the app died
    expect(cache.read('catalog.csv')).toEqual({ body: 'new', etag: null })
  })
})
