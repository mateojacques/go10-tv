import type { Title } from '../types'

/** Rows are capped so a 907-title catalog still scrolls smoothly on a TV. */
export const ROW_LIMIT = 20

/** A genre needs this many titles before it earns its own row. */
const GENRE_MIN = 12

export interface CatalogRowGroup {
  id: string
  label: string
  titles: Title[]
}

const STUDIOS = ['Disney', 'Pixar', 'Cartoon N.', 'WarnerBros', 'DC', '20th Television']
const DECADES = [1980, 1990, 2000, 2010, 2020]

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúñü]+/g, '-')
    .replace(/^-|-$/g, '')

export function buildRows(titles: Title[]): CatalogRowGroup[] {
  const groups: CatalogRowGroup[] = []

  const add = (id: string, label: string, selected: Title[]) => {
    if (selected.length > 0) {
      groups.push({ id, label, titles: selected.slice(0, ROW_LIMIT) })
    }
  }

  add('recientes', 'Recién añadidos', titles)
  add('series', 'Series', titles.filter((t) => t.kind === 'show'))
  add('4k', 'En 4K', titles.filter((t) => t.quality === '4K'))

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

  const genreRows = [...byGenre.entries()]
    .filter(([, group]) => group.length >= GENRE_MIN)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))

  for (const [genre, group] of genreRows) {
    add(`genero-${slug(genre)}`, genre, group)
  }

  for (const studio of STUDIOS) {
    add(`studio-${slug(studio)}`, studio, titles.filter((t) => t.studio === studio))
  }

  for (const decade of DECADES) {
    add(
      `decada-${decade}`,
      `Los ${decade}`,
      titles.filter((t) => t.year !== null && t.year >= decade && t.year < decade + 10),
    )
  }

  add('populares', 'Más vistos', [...titles].sort((a, b) => b.views - a.views))

  return groups
}
