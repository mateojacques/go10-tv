import type { Title } from '../types'
import { resolveArt, type HeroArt, type HeroArtIndex } from './art'

/** How the hero spreads across the catalog. Never shown to the user. */
export const HERO_BUCKETS = ['Animación', 'Drama', 'Terror', 'Infantil', 'Anime'] as const

export interface HeroSlide { title: Title; art: HeroArt | null }

function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
}

/**
 * One random title per bucket (by genre or genre_secondary), in shuffled
 * bucket order, preferring titles that have art. With no bucket matched, the
 * first title alone, so an odd catalog still has a hero.
 */
export function pickHero(titles: Title[], index: HeroArtIndex, random: () => number = Math.random): HeroSlide[] {
  const picked = new Set<string>()
  const slides: HeroSlide[] = []
  for (const bucket of shuffle([...HERO_BUCKETS], random)) {
    const candidates = titles.filter(
      (t) => !t.external && !picked.has(t.key) && (t.genre === bucket || t.genre_secondary === bucket),
    )
    if (candidates.length === 0) continue
    const withArt = candidates.filter((t) => resolveArt(t.key, index) !== null)
    const pool = withArt.length > 0 ? withArt : candidates
    const choice = pool[Math.floor(random() * pool.length)]
    picked.add(choice.key)
    slides.push({ title: choice, art: resolveArt(choice.key, index) })
  }
  if (slides.length === 0 && titles[0]) return [{ title: titles[0], art: resolveArt(titles[0].key, index) }]
  return slides
}

let launchPick: HeroSlide[] | null = null

/** The pick for this launch: made on the first call with titles, then fixed, so Home never reshuffles mid-session. */
export function pickHeroOnce(titles: Title[], index: HeroArtIndex): HeroSlide[] {
  if (launchPick === null && titles.length > 0) launchPick = pickHero(titles, index)
  return launchPick ?? []
}

export function resetHeroPickForTests(): void {
  launchPick = null
}
