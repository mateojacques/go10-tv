import type { Collection, CollectionFile } from './types'

/**
 * Split out from the glob so it can be tested with fixtures. `collections` is
 * an unchecked cast: `collections.data.test.ts` validates every file.
 */
export function fromModules(modules: Record<string, unknown>): {
  files: CollectionFile[]
  collections: Collection[]
} {
  const files = Object.entries(modules)
    .map(([path, raw]) => ({ fileName: path.slice(path.lastIndexOf('/') + 1), raw }))
    .sort((a, b) => a.fileName.localeCompare(b.fileName))
  const collections = files.map((file) => file.raw as Collection).sort((a, b) => a.order - b.order)
  return { files, collections }
}

const loaded = fromModules(
  import.meta.glob<unknown>('../../data/collections/*.json', { eager: true, import: 'default' }),
)

/** Every collection file as written, for validation. */
export const COLLECTION_FILES = loaded.files

/** Every collection, in Home tile order. */
export const COLLECTIONS = loaded.collections
