import type { Collection, CollectionFile } from './types'
import { validateCollection } from './validateCollection'

/**
 * Split out from the glob so it can be tested with fixtures. A structurally
 * malformed file is left out of `collections` (with a warning) so one bad
 * hand edit can't crash Home; `files` keeps it for `collections.data.test.ts`,
 * which validates everything, including keys and assets.
 */
export function fromModules(modules: Record<string, unknown>): {
  files: CollectionFile[]
  collections: Collection[]
} {
  const files = Object.entries(modules)
    .map(([path, raw]) => ({ fileName: path.slice(path.lastIndexOf('/') + 1), raw }))
    .sort((a, b) => a.fileName.localeCompare(b.fileName))
  const collections = files
    .filter((file) => {
      const errors = validateCollection(file, {})
      if (errors.length > 0) console.warn(`Skipping collection: ${errors.join('; ')}`)
      return errors.length === 0
    })
    .map((file) => file.raw as Collection)
    .sort((a, b) => a.order - b.order)
  return { files, collections }
}

const loaded = fromModules(
  import.meta.glob<unknown>('../../../../data/collections/*.json', { eager: true, import: 'default' }),
)

/** Every collection file as written, for validation. */
export const COLLECTION_FILES = loaded.files

/** Every collection, in Home tile order. */
export const COLLECTIONS = loaded.collections
