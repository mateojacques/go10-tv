/**
 * Hero art: local key art (full resolution, hand-made) beats a TMDB backdrop
 * (from the offline sidecar, scripts/fetch_hero_art.py), which beats none —
 * the blurred-thumbnail hero. Catalog thumbnails are only 368x210.
 */

export interface HeroArt { small: string; large: string }

/** apps/web/public/data/hero_art.json → items. */
export type HeroArtIndex = Record<string, { tmdb: string; backdrop: string }>

export const LOCAL_ART: Record<string, HeroArt> = {
  'spidey-y-sus-sorprendentes-amigos': {
    small: 'assets/spidey/spidey-hero-960.webp',
    large: 'assets/spidey/spidey-hero-1920.webp',
  },
}

const TMDB_IMAGES = 'https://image.tmdb.org/t/p'

/** The sidecar's items, or null for anything that isn't one (an HTML fallback page, a truncated download). */
export function parseHeroArt(json: string): HeroArtIndex | null {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null
  const { schema_version, items } = raw as { schema_version?: unknown; items?: unknown }
  if (schema_version !== 1 || typeof items !== 'object' || items === null || Array.isArray(items)) return null
  const index: HeroArtIndex = {}
  for (const [key, entry] of Object.entries(items)) {
    const { tmdb, backdrop } = (entry ?? {}) as { tmdb?: unknown; backdrop?: unknown }
    if (typeof backdrop === 'string' && backdrop !== '' && typeof tmdb === 'string') index[key] = { tmdb, backdrop }
  }
  return index
}

export function resolveArt(key: string, index: HeroArtIndex): HeroArt | null {
  const local = LOCAL_ART[key]
  if (local) return local
  const entry = index[key]
  return entry ? { small: `${TMDB_IMAGES}/w780${entry.backdrop}`, large: `${TMDB_IMAGES}/w1280${entry.backdrop}` } : null
}
