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
 * bucket order. Only titles with art are featured: a bucket without any is
 * left out, and with no art at all there is no hero.
 */
export function pickHero(titles: Title[], index: HeroArtIndex, random: () => number = Math.random): HeroSlide[] {
  const picked = new Set<string>()
  const slides: HeroSlide[] = []
  for (const bucket of shuffle([...HERO_BUCKETS], random)) {
    const pool = titles.filter(
      (t) =>
        !t.external &&
        !picked.has(t.key) &&
        (t.genre === bucket || t.genre_secondary === bucket) &&
        resolveArt(t.key, index) !== null,
    )
    if (pool.length === 0) continue
    const choice = pool[Math.floor(random() * pool.length)]
    picked.add(choice.key)
    slides.push({ title: choice, art: resolveArt(choice.key, index) })
  }
  return slides
}

let launchPick: HeroSlide[] | null = null

/**
 * The pick for this launch: made on the first call that yields slides, then
 * fixed, so Home never reshuffles mid-session. An empty pick (no catalog, or
 * no art yet) is not kept: art arriving later still gets a hero.
 */
export function pickHeroOnce(titles: Title[], index: HeroArtIndex): HeroSlide[] {
  if (launchPick === null) {
    const slides = pickHero(titles, index)
    if (slides.length === 0) return slides
    launchPick = slides
  }
  return launchPick
}

export function resetHeroPickForTests(): void {
  launchPick = null
}
