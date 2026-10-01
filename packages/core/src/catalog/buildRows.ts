import type { Title } from '../types'
import type { HeroArtIndex } from '../hero/art'
import { franchiseKeys, polishScore } from './polish'
import { hash01 } from '../lib/hash'

/** Rows are capped so a 907-title catalog still scrolls smoothly on a TV. */
export const ROW_LIMIT = 20

/** A genre needs this many titles before it earns its own row. */
const GENRE_MIN = 12

/** A category row with fewer titles than this reads as a stub, so it's left out. */
const CATEGORY_MIN = 4

/** Each earlier appearance costs a title this much score: repeats only fill rows that run short. */
const REPEAT_PENALTY = 2
/** The same, per earlier appearance of the title's franchise. */
const FRANCHISE_PENALTY = 0.6
/** Launch-to-launch shuffle among titles of similar polish. */
const JITTER = 0.8

export interface CatalogRowGroup {
  id: string
  label: string
  titles: Title[]
}

export interface BuildRowsOptions {
  /** Hero art sidecar: titles with a backdrop rank higher. */
  heroArt?: HeroArtIndex
  /** Keys already featured above the rows (the hero), treated as shown once. */
  featured?: string[]
  /** Varies the rows between launches; fixed per process by default. */
  seed?: number
}

const STUDIOS = ['Disney', 'Pixar', 'Cartoon N.', 'WarnerBros', 'DC', '20th Television']
const DECADES = [1980, 1990, 2000, 2010, 2020]

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúñü]+/g, '-')
    .replace(/^-|-$/g, '')

let launchSeed: number | null = null

/** Picked on first use and kept, so Home looks the same every time it's revisited this launch. */
function defaultSeed(): number {
  launchSeed ??= Math.floor(Math.random() * 2 ** 32)
  return launchSeed
}

export function buildRows(titles: Title[], options: BuildRowsOptions = {}): CatalogRowGroup[] {
  const { heroArt = {}, featured = [], seed = defaultSeed() } = options
  const franchise = franchiseKeys(titles)
  const score = new Map(titles.map((t) => [t.key, polishScore(t, heroArt) + JITTER * (hash01(seed, t.key) - 0.5)]))
  const shown = new Map<string, number>()
  const franchiseShown = new Map<string, number>()
  const bump = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1)
  for (const key of featured) {
    bump(shown, key)
    const f = franchise.get(key)
    if (f) bump(franchiseShown, f)
  }

  const groups: CatalogRowGroup[] = []

  /** Takes titles in the given order, one per franchise, and records them as shown. */
  const emit = (id: string, label: string, ordered: Title[], min: number) => {
    const used = new Set<string>()
    const picked: Title[] = []
    for (const title of ordered) {
      const f = franchise.get(title.key) ?? title.key
      if (used.has(f)) continue
      used.add(f)
      picked.push(title)
      if (picked.length === ROW_LIMIT) break
    }
    if (picked.length < min) return
    for (const title of picked) {
      bump(shown, title.key)
      bump(franchiseShown, franchise.get(title.key) ?? title.key)
    }
    groups.push({ id, label, titles: picked })
  }

  /** The row's candidates, best polish first, with anything already on screen pushed back. */
  const ranked = (candidates: Title[]) => {
    const effective = (t: Title) =>
      score.get(t.key)! -
      REPEAT_PENALTY * (shown.get(t.key) ?? 0) -
      FRANCHISE_PENALTY * (franchiseShown.get(franchise.get(t.key) ?? t.key) ?? 0)
    return candidates
      .map((t) => ({ t, s: effective(t) }))
      .sort((a, b) => b.s - a.s || a.t.catalogIndex - b.t.catalogIndex)
      .map(({ t }) => t)
  }

  const add = (id: string, label: string, candidates: Title[], min = CATEGORY_MIN) => emit(id, label, ranked(candidates), min)

  // Newest first, as uploaded: the only row that ignores polish.
  emit('recientes', 'Recién añadidos', titles, 1)
  add('destacados', 'Destacados', titles, 1)
  add('series', 'Series', titles.filter((t) => t.kind === 'show'), 1)
  add('peliculas', 'Películas', titles.filter((t) => t.kind === 'movie'))
  add('4k', 'En 4K', titles.filter((t) => t.quality === '4K'), 1)

  // A title counts toward both its primary and secondary genre. The catalog is
  // heavily animation, so secondaries are what give the home screen its variety.
  const byGenre = new Map<string, Title[]>()
  for (const title of titles) {
    for (const genre of [title.genre, title.genre_secondary]) {
      if (!genre) continue
      const bucket = byGenre.get(genre)
      if (bucket) bucket.push(title)
      else byGenre.set(genre, [title])
    }
  }

  // Category rows come in a different order each launch, so the same few
  // genres don't always claim the best titles and the top of the page.
  const categories: { id: string; label: string; titles: Title[] }[] = []
  for (const [genre, group] of byGenre) {
    if (group.length >= GENRE_MIN) categories.push({ id: `genero-${slug(genre)}`, label: genre, titles: group })
  }
  for (const studio of STUDIOS) {
    categories.push({ id: `studio-${slug(studio)}`, label: studio, titles: titles.filter((t) => t.studio === studio) })
  }
  for (const decade of DECADES) {
    categories.push({
      id: `decada-${decade}`,
      label: `Los ${decade}`,
      titles: titles.filter((t) => t.year !== null && t.year >= decade && t.year < decade + 10),
    })
  }
  categories.sort((a, b) => hash01(seed, a.id) - hash01(seed, b.id))
  for (const category of categories) add(category.id, category.label, category.titles)

  emit('populares', 'Más vistos', [...titles].sort((a, b) => b.views - a.views), 1)

  return groups
}
