import { buildTitles, parseCatalogCsv } from '@go10/core/catalog/loadCatalog'
import { fromModules } from '@go10/core/collections/fromModules'
import type { Collection } from '@go10/core/collections/types'
import { parseHeroArt, type HeroArtIndex } from '@go10/core/hero/art'
import { validateChannelsTop } from '@go10/core/tv/validateChannels'
import type { CatalogRow, Title } from '@go10/core/types'
import type { FetchText } from './httpText'
import type { CachedText, TextCache } from './textCache'

export interface CatalogData {
  rows: CatalogRow[]
  titles: Title[]
  collections: Collection[]
  /** Hero backdrops (scripts/fetch_hero_art.py); {} when missing. */
  heroArt: HeroArtIndex
  /** data/channels.json as published (resolveLineup validates the entries); null when the site has none. */
  channels: unknown | null
}

export type CatalogState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: CatalogData }

export interface CatalogStore {
  getState(): CatalogState
  subscribe(listener: () => void): () => void
  /** Show the cache at once (if any), then revalidate against the site. */
  start(): Promise<void>
  /** The "Reintentar" action: the same as start. */
  retry(): Promise<void>
  /** Swap in data a background refresh found. Called when Home comes into view. */
  applyPending(): void
}

interface Deps {
  fetchText: FetchText
  cache: TextCache
  siteBase: string
}

/** The catalog, or null for anything that isn't one (an HTML fallback page, a truncated download). */
export function parseCatalog(csv: string): CatalogRow[] | null {
  try {
    const rows = parseCatalogCsv(csv)
    return rows.length > 0 && rows.every((row) => typeof row.video_id === 'string' && row.video_id !== '') ? rows : null
  } catch {
    return null
  }
}

/** Valid collections in tile order (invalid entries dropped), or null when it isn't a JSON array. */
export function parseCollections(json: string): Collection[] | null {
  try {
    const raw: unknown = JSON.parse(json)
    if (!Array.isArray(raw)) return null
    // The index has no file names; a collection's id is its file name, so validation still checks it.
    const modules = Object.fromEntries(raw.map((c, i) => [`${(c as { id?: unknown } | null)?.id ?? `#${i}`}.json`, c]))
    return fromModules(modules).collections
  } catch {
    return null
  }
}

/** A channels file whose top level is sound, or null (an HTML fallback page, a truncated download). */
export function parseChannels(json: string): unknown | null {
  try {
    const raw: unknown = JSON.parse(json)
    return validateChannelsTop(raw).length === 0 ? raw : null
  } catch {
    return null
  }
}

interface Resource<T> {
  name: string
  path: string
  parse(text: string): T | null
}

const CATALOG: Resource<CatalogRow[]> = { name: 'catalog.csv', path: 'data/catalog.csv', parse: parseCatalog }
const COLLECTIONS: Resource<Collection[]> = { name: 'collections.json', path: 'data/collections/index.json', parse: parseCollections }
const HERO_ART: Resource<HeroArtIndex> = { name: 'hero_art.json', path: 'data/hero_art.json', parse: parseHeroArt }
const CHANNELS: Resource<unknown> = { name: 'channels.json', path: 'data/channels.json', parse: parseChannels }

export function createCatalogStore(deps: Deps): CatalogStore {
  let state: CatalogState = { status: 'loading' }
  let pending: CatalogData | null = null
  let inFlight: Promise<void> | null = null
  const listeners = new Set<() => void>()

  function set(next: CatalogState): void {
    state = next
    listeners.forEach((listener) => listener())
  }

  function readCache(name: string): CachedText | null {
    try {
      return deps.cache.read(name)
    } catch {
      return null
    }
  }

  /** The cached value, only if it still parses: a corrupt body is no cache at all. */
  function cached<T>(resource: Resource<T>): { entry: CachedText; value: T } | null {
    const entry = readCache(resource.name)
    const value = entry ? resource.parse(entry.body) : null
    return entry && value !== null ? { entry, value } : null
  }

  /** A fresh value from the site, or null (unchanged, unreachable, or not the right kind of file). */
  async function refresh<T>(resource: Resource<T>): Promise<T | null> {
    try {
      // Only a cache that parses may revalidate: its ETag must not pin a corrupt body with 304s.
      const etag = cached(resource)?.entry.etag ?? null
      const result = await deps.fetchText(deps.siteBase + resource.path, etag)
      if (result.status !== 200) return null
      const value = resource.parse(result.body)
      if (value === null) return null
      try {
        deps.cache.write(resource.name, { body: result.body, etag: result.etag })
      } catch {
        // Disk full or unwritable: still show what we just downloaded.
      }
      return value
    } catch {
      return null
    }
  }

  async function load(): Promise<void> {
    const rows = cached(CATALOG)?.value ?? null
    // Read on its own: a valid collections cache must survive a missing or corrupt catalog
    // cache, since its ETag is still sent and a 304 would otherwise leave no collections.
    const cachedCollections = cached(COLLECTIONS)?.value ?? []
    const cachedHeroArt = cached(HERO_ART)?.value ?? {}
    const cachedChannels = cached(CHANNELS)?.value ?? null
    const current: CatalogData | null = rows
      ? { rows, titles: buildTitles(rows), collections: cachedCollections, heroArt: cachedHeroArt, channels: cachedChannels }
      : null
    set(current ? { status: 'ready', data: current } : { status: 'loading' })

    const [freshRows, freshCollections, freshHeroArt, freshChannels] = await Promise.all([
      refresh(CATALOG),
      refresh(COLLECTIONS),
      refresh(HERO_ART),
      refresh(CHANNELS),
    ])
    const nextRows = freshRows ?? current?.rows ?? null
    if (!nextRows) {
      set({ status: 'error' })
      return
    }
    if (!freshRows && !freshCollections && !freshHeroArt && freshChannels === null) return // unchanged (or unreachable) with a cache showing
    const next: CatalogData = {
      rows: nextRows,
      titles: freshRows ? buildTitles(freshRows) : current!.titles,
      collections: freshCollections ?? cachedCollections,
      heroArt: freshHeroArt ?? cachedHeroArt,
      channels: freshChannels ?? cachedChannels,
    }
    if (current) pending = next
    else set({ status: 'ready', data: next })
  }

  function start(): Promise<void> {
    inFlight ??= load().finally(() => {
      inFlight = null
    })
    return inFlight
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    start,
    retry: start,
    applyPending() {
      if (!pending || state.status !== 'ready') return
      const data = pending
      pending = null
      set({ status: 'ready', data })
    },
  }
}
