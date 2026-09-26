import type { FetchText } from './httpText'
import { memoryTextCache, type TextCache } from './textCache'
import { createCatalogStore, parseCatalog, parseCollections } from './catalogStore'

const BASE = 'https://tv.test/'
const HEADER = 'catalog_index,video_id,type,title,title_raw,series_id,series_title,season_number,season_label,episode_number,chapter_start_seconds,chapter_end_seconds,year,studio,source,genre,genre_secondary,quality,language,subtitled,duration_raw,duration_seconds,views,thumbnail,video_url,embed_url'
const row = (i: number, id: string, title: string) =>
  `${i},${id},movie,${title},${title},,,,,,,,2001,Pixar,Animax,Animación,,1080p,Español,false,1:30:00,5400,10,catalogo_files/${id}.webp,https://ok.ru/video/${id},https://ok.ru/videoembed/${id}`
const csv = (...titles: string[]) => [HEADER, ...titles.map((t, i) => row(i, String(100 + i), t))].join('\n')
const collection = (id: string, order: number) => ({ id, name: id, order, logo: `assets/collections/${id}/logo.svg`, tile: { color: '#000000' }, titles: ['100'] })
const HTML = '<!doctype html><html><head><title>GO10 TV</title></head><body><div id="root"></div></body></html>'

type Resource = { body: string; etag?: string } | 'down'

/** A fake site: answers 304 when the ETag matches, throws when a resource is 'down'. */
function site(resources: Record<string, Resource>) {
  const calls: { path: string; etag: string | null }[] = []
  const fetchText: FetchText = async (url, etag) => {
    const path = url.replace(BASE, '')
    calls.push({ path, etag })
    const resource = resources[path] ?? 'down'
    if (resource === 'down') throw new Error('offline')
    if (resource.etag && etag === resource.etag) return { status: 304 }
    return { status: 200, body: resource.body, etag: resource.etag ?? null }
  }
  return { fetchText, calls, resources }
}

const CATALOG = 'data/catalog.csv'
const COLLECTIONS = 'data/collections/index.json'
const titlesOf = (store: ReturnType<typeof createCatalogStore>) => {
  const state = store.getState()
  return state.status === 'ready' ? state.data.titles.map((t) => t.title) : state.status
}

function primed(cache: TextCache, catalog: string, etag = '"c1"') {
  cache.write('catalog.csv', { body: catalog, etag })
  cache.write('collections.json', { body: JSON.stringify([collection('pixar', 1)]), etag: '"k1"' })
  return cache
}

describe('parseCatalog', () => {
  it('parses a real catalog', () => {
    expect(parseCatalog(csv('A', 'B'))?.map((r) => r.video_id)).toEqual(['100', '101'])
  })

  it('rejects anything that is not the catalog', () => {
    expect(parseCatalog(HTML)).toBeNull()
    expect(parseCatalog('')).toBeNull()
    expect(parseCatalog(HEADER)).toBeNull()
  })
})

describe('parseCollections', () => {
  beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => {}))
  afterEach(() => jest.restoreAllMocks())

  it('keeps valid collections in order and drops invalid ones', () => {
    const json = JSON.stringify([collection('pixar', 2), { id: 'broken' }, collection('disney', 1)])
    expect(parseCollections(json)?.map((c) => c.id)).toEqual(['disney', 'pixar'])
  })

  it('rejects anything that is not a JSON array', () => {
    expect(parseCollections(HTML)).toBeNull()
    expect(parseCollections('{"id":"x"}')).toBeNull()
  })
})

describe('catalogStore', () => {
  beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => {}))
  afterEach(() => jest.restoreAllMocks())

  it('first launch online: loads, shows the catalog and caches it', async () => {
    const { fetchText } = site({ [CATALOG]: { body: csv('A', 'B'), etag: '"c1"' }, [COLLECTIONS]: { body: JSON.stringify([collection('pixar', 1)]) } })
    const cache = memoryTextCache()
    const store = createCatalogStore({ fetchText, cache, siteBase: BASE })
    const started = store.start()
    expect(store.getState()).toEqual({ status: 'loading' })
    await started
    expect(titlesOf(store)).toEqual(['A', 'B'])
    const state = store.getState()
    expect(state.status === 'ready' && state.data.collections.map((c) => c.id)).toEqual(['pixar'])
    expect(cache.read('catalog.csv')).toEqual({ body: csv('A', 'B'), etag: '"c1"' })
  })

  it('first launch offline: shows the error, and Reintentar recovers once the site answers', async () => {
    const server = site({})
    const store = createCatalogStore({ fetchText: server.fetchText, cache: memoryTextCache(), siteBase: BASE })
    await store.start()
    expect(store.getState()).toEqual({ status: 'error' })
    server.resources[CATALOG] = { body: csv('A') }
    await store.retry()
    expect(titlesOf(store)).toEqual(['A'])
  })

  it('with a cache: shows it at once, before the network answers', async () => {
    const { fetchText } = site({ [CATALOG]: { body: csv('A'), etag: '"c1"' } })
    const store = createCatalogStore({ fetchText, cache: primed(memoryTextCache(), csv('A')), siteBase: BASE })
    const started = store.start()
    expect(titlesOf(store)).toEqual(['A'])
    await started
    expect(titlesOf(store)).toEqual(['A'])
  })

  it('revalidates with the cached ETag and changes nothing on a 304', async () => {
    const server = site({ [CATALOG]: { body: csv('A'), etag: '"c1"' }, [COLLECTIONS]: { body: '[]', etag: '"k1"' } })
    const store = createCatalogStore({ fetchText: server.fetchText, cache: primed(memoryTextCache(), csv('A')), siteBase: BASE })
    await store.start()
    expect(server.calls).toEqual(expect.arrayContaining([{ path: CATALOG, etag: '"c1"' }, { path: COLLECTIONS, etag: '"k1"' }]))
    store.applyPending()
    expect(titlesOf(store)).toEqual(['A'])
  })

  it('applies an update only when asked, so the screen never reshuffles mid-browse', async () => {
    const { fetchText } = site({ [CATALOG]: { body: csv('A', 'New'), etag: '"c2"' } })
    const store = createCatalogStore({ fetchText, cache: primed(memoryTextCache(), csv('A')), siteBase: BASE })
    const seen: string[][] = []
    store.subscribe(() => {
      const t = titlesOf(store)
      if (Array.isArray(t)) seen.push(t)
    })
    await store.start()
    expect(titlesOf(store)).toEqual(['A'])
    store.applyPending()
    expect(titlesOf(store)).toEqual(['A', 'New'])
    store.applyPending()
    expect(seen.at(-1)).toEqual(['A', 'New'])
  })

  it('keeps the cache when the site answers HTML instead of CSV (SPA fallback), and does not cache the HTML', async () => {
    const { fetchText } = site({ [CATALOG]: { body: HTML } })
    const cache = primed(memoryTextCache(), csv('A'))
    const store = createCatalogStore({ fetchText, cache, siteBase: BASE })
    await store.start()
    store.applyPending()
    expect(titlesOf(store)).toEqual(['A'])
    expect(cache.read('catalog.csv')?.body).toBe(csv('A'))
  })

  it('shows the error, not an empty list, when the first answer is HTML', async () => {
    const { fetchText } = site({ [CATALOG]: { body: HTML } })
    const store = createCatalogStore({ fetchText, cache: memoryTextCache(), siteBase: BASE })
    await store.start()
    expect(store.getState()).toEqual({ status: 'error' })
  })

  it('treats a corrupt cache as no cache, and refetches without its ETag so a 304 cannot lock it in', async () => {
    const server = site({ [CATALOG]: { body: csv('A'), etag: '"c1"' } })
    const cache = memoryTextCache()
    cache.write('catalog.csv', { body: 'catalog_index,video_id\n0,', etag: '"c1"' })
    const store = createCatalogStore({ fetchText: server.fetchText, cache, siteBase: BASE })
    await store.start()
    expect(server.calls.find((c) => c.path === CATALOG)?.etag).toBeNull()
    expect(titlesOf(store)).toEqual(['A'])
  })

  it('still shows fresh data when writing the cache fails (storage full)', async () => {
    const { fetchText } = site({ [CATALOG]: { body: csv('A') } })
    const cache: TextCache = { read: () => null, write: () => { throw new Error('ENOSPC') } }
    const store = createCatalogStore({ fetchText, cache, siteBase: BASE })
    await store.start()
    expect(titlesOf(store)).toEqual(['A'])
  })

  it('shows the catalog without collections when only the collections are unreachable', async () => {
    const { fetchText } = site({ [CATALOG]: { body: csv('A') } })
    const store = createCatalogStore({ fetchText, cache: memoryTextCache(), siteBase: BASE })
    await store.start()
    const state = store.getState()
    expect(state.status === 'ready' && state.data.collections).toEqual([])
  })

  it('keeps cached collections when the fresh index is not JSON', async () => {
    const { fetchText } = site({ [CATALOG]: { body: csv('A', 'B'), etag: '"c2"' }, [COLLECTIONS]: { body: HTML } })
    const store = createCatalogStore({ fetchText, cache: primed(memoryTextCache(), csv('A')), siteBase: BASE })
    await store.start()
    store.applyPending()
    const state = store.getState()
    expect(state.status === 'ready' && state.data.collections.map((c) => c.id)).toEqual(['pixar'])
    expect(titlesOf(store)).toEqual(['A', 'B'])
  })

  it('runs one load at a time', async () => {
    const server = site({ [CATALOG]: { body: csv('A') } })
    const store = createCatalogStore({ fetchText: server.fetchText, cache: memoryTextCache(), siteBase: BASE })
    await Promise.all([store.start(), store.retry()])
    expect(server.calls.filter((c) => c.path === CATALOG)).toHaveLength(1)
  })
})
