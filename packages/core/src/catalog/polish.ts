import type { CatalogRow, Title } from '../types'
import { resolveArt, type HeroArtIndex } from '../hero/art'

/**
 * How finished a title looks on Home: more to watch, sharper video, real art,
 * audio in the audience's Spanish. Home ranks its rows by this, so the best
 * of each category leads instead of whatever was uploaded last.
 */

const QUALITY: Record<string, number> = {
  '4K': 1, '2K': 0.85, '1440p': 0.85, '1080p': 0.7, HD: 0.55, '720p': 0.5, '480p': 0.25, '360p': 0.1,
}
const UNKNOWN_QUALITY = 0.4

/** Latino dubs are what the audience asks for; original audio with subtitles is the fallback. */
function audio(row: Pick<CatalogRow, 'language' | 'subtitled'>): number {
  if (row.subtitled) return 0.35
  switch (row.language) {
    case 'Español Latino': return 1
    case 'Español': return 0.8
    case 'Mudo': return 0.5
    default: return 0.3
  }
}

const average = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length

/** 0..~1.3: a show grows with its episodes (log scale) and seasons; a feature film sits near a 15-episode show. */
function content(title: Title): number {
  if (title.kind === 'show') {
    const episodes = Math.max(1, title.seasons.length)
    const seasons = new Set(title.seasons.map((s) => s.season_number ?? 1)).size
    return Math.min(1, Math.log2(1 + episodes) / Math.log2(101)) + 0.1 * Math.min(Math.max(seasons - 1, 0), 3)
  }
  if (title.durationSeconds >= 60 * 60) return 0.6
  if (title.durationSeconds >= 40 * 60) return 0.45
  return 0.25
}

export function polishScore(title: Title, heroArt: HeroArtIndex = {}): number {
  // Shows are scored over every episode, so one stray 480p upload doesn't sink a 1080p series.
  const rows: Pick<CatalogRow, 'quality' | 'language' | 'subtitled'>[] = title.seasons.length > 0 ? title.seasons : [title]
  const quality = average(rows.map((r) => QUALITY[r.quality] ?? UNKNOWN_QUALITY))
  const sound = average(rows.map(audio))
  // Catalog thumbnails are 368px wide; picks under assets/ are downloaded at 720px.
  const art = (resolveArt(title.key, heroArt) ? 1 : 0) + (title.thumbnail.startsWith('assets/') ? 0.4 : 0)
  const metadata = ((title.year !== null ? 1 : 0) + (title.genre ? 1 : 0)) / 2
  const popularity = Math.min(1, Math.log10(1 + title.views) / 6)
  return 1.2 * content(title) + quality + art + 0.8 * sound + 0.3 * metadata + 0.4 * popularity
}

const SEQUEL = /\s+(\d+|ii|iii|iv|v|vi)$/

/** "Dragon Ball Z: La batalla de los dioses" → "dragon ball z"; "Peter Pan 2" → "peter pan". */
function baseName(name: string): string {
  const head = name.toLowerCase().replace(/[™®]/g, '').split(/\s*(?::|\s[-–]\s|\(|\[)/)[0]
  return head.replace(/[¡!¿?.,'"]/g, '').replace(/\s+/g, ' ').trim().replace(SEQUEL, '')
}

/** A base shorter than this never absorbs others: "el" or "up" would swallow unrelated titles. */
const MIN_ROOT = 4

/**
 * Title key → franchise, so Home shows one Tom y Jerry per row instead of
 * thirteen. A title joins the shortest other base its name starts with, word
 * for word: "Tom y Jerry y Robin Hood" and "Dragon Ball Z" fold into "tom y
 * jerry" and "dragon ball" when those exist in the catalog.
 */
export function franchiseKeys(titles: Title[]): Map<string, string> {
  const bases = new Map(titles.map((t) => [t.key, baseName(t.title)]))
  const roots = [...new Set(bases.values())].filter((b) => b.length >= MIN_ROOT).sort((a, b) => a.length - b.length)
  const rootOf = new Map<string, string>()
  const franchise = new Map<string, string>()
  for (const [key, base] of bases) {
    let root = rootOf.get(base)
    if (root === undefined) {
      root = roots.find((r) => base === r || base.startsWith(`${r} `)) ?? base
      rootOf.set(base, root)
    }
    franchise.set(key, root || key)
  }
  return franchise
}
