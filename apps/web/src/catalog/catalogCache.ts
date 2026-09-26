import type { CatalogRow } from '@go10/core/types'

const CATALOG_CACHE_KEY = 'go10:catalog:v1'

interface CachedCatalog {
  rows: CatalogRow[]
  builtAt: number
}

export function readCachedCatalog(): CatalogRow[] | null {
  try {
    const raw = sessionStorage.getItem(CATALOG_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedCatalog
    return Array.isArray(parsed.rows) ? parsed.rows : null
  } catch {
    return null
  }
}

/** Best-effort: if storage is unavailable, this just costs a re-fetch next load. */
export function writeCachedCatalog(rows: CatalogRow[]): void {
  try {
    const payload: CachedCatalog = { rows, builtAt: Date.now() }
    sessionStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(payload))
  } catch {
    // ignore — private mode, quota exceeded, or storage disabled
  }
}
