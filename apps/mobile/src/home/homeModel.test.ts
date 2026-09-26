import type { Collection } from '@go10/core/collections/types'
import type { Title } from '@go10/core/types'
import { FEATURED_SERIES_ID } from '@go10/core/featured'
import { buildHome } from './homeModel'

function title(key: string, overrides: Partial<Title> = {}): Title {
  return {
    key, kind: 'movie', title: key, year: 2001, studio: '', source: '', genre: '', genre_secondary: '',
    quality: '1080p', language: 'Español', subtitled: false, thumbnail: `catalogo_files/${key}.webp`, views: 0,
    durationSeconds: 5400, catalogIndex: 0, seasons: [], ...overrides,
  }
}
const collection = (id: string, titles: string[]): Collection => ({
  id, name: id, order: 1, logo: `assets/collections/${id}/logo.svg`, tile: { color: '#000000' }, titles,
})
const data = (titles: Title[], collections: Collection[] = []) => ({ rows: [], titles, collections })

describe('buildHome', () => {
  it('features the promo title with its key art', () => {
    const home = buildHome(data([title('a'), title(FEATURED_SERIES_ID, { kind: 'show' })]))!
    expect(home.featured.key).toBe(FEATURED_SERIES_ID)
    expect(home.featuredArt?.large).toMatch(/spidey-hero-1920\.webp$/)
  })

  it('falls back to the first title, without key art, when the promo title is gone', () => {
    const home = buildHome(data([title('a'), title('b')]))!
    expect(home.featured.key).toBe('a')
    expect(home.featuredArt).toBeNull()
  })

  it('builds the same rows as the web Home', () => {
    const home = buildHome(data([title('a'), title('b', { kind: 'show' })]))!
    expect(home.rows.map((r) => r.id)).toEqual(expect.arrayContaining(['recientes', 'series', 'populares']))
  })

  it('hides collections that resolve to no titles, keeping the order of the rest', () => {
    const home = buildHome(data([title('a')], [collection('x', ['gone']), collection('y', ['a'])]))!
    expect(home.strip.map((c) => c.id)).toEqual(['y'])
  })

  it('is null for an empty catalog', () => {
    expect(buildHome(data([]))).toBeNull()
  })
})
