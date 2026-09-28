import { vi } from 'vitest'
import { buildTitles, parseCatalogCsv } from '@go10/core/catalog/loadCatalog'

/** A hero_art.json giving every title in `csv` a backdrop, so Home has a hero to show. */
export function heroArtFor(csv: string): string {
  const titles = buildTitles(parseCatalogCsv(csv))
  const items = Object.fromEntries(titles.map((t) => [t.key, { tmdb: `movie/${t.key}`, backdrop: `/${t.key}.jpg` }]))
  return JSON.stringify({ schema_version: 1, items })
}

/** The site's static files: the art sidecar for hero_art.json, the catalog for anything else. */
export function siteResponse(csv: string) {
  return async (input: RequestInfo | URL | string) => ({
    ok: true,
    text: async () => (String(input).endsWith('/data/hero_art.json') ? heroArtFor(csv) : csv),
  })
}

export const siteFetch = (csv: string) => vi.fn(siteResponse(csv))
