import { fromModules } from '@go10/core/collections/fromModules'

const loaded = fromModules(
  import.meta.glob<unknown>('../../../../data/collections/*.json', { eager: true, import: 'default' }),
)

/** Every collection file as written, for validation. */
export const COLLECTION_FILES = loaded.files

/** Every collection, in Home tile order. */
export const COLLECTIONS = loaded.collections
