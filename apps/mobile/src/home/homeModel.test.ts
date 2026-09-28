import type { Collection } from '@go10/core/collections/types'
import type { Title } from '@go10/core/types'
import { resetHeroPickForTests } from '@go10/core/hero/pickHero'
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
const data = (titles: Title[], collections: Collection[] = [], heroArt = {}) => ({ rows: [], titles, collections, heroArt })

beforeEach(() => resetHeroPickForTests())

describe('buildHome', () => {
  it('picks hero slides across the genre buckets, preferring art', () => {
    const titles = [title('d', { genre: 'Drama' }), title('t', { genre: 'Terror' }), title('t2', { genre: 'Terror' })]
    const home = buildHome(data(titles, [], { t2: { tmdb: 'movie/1', backdrop: '/t2.jpg' } }))!
    expect(home.slides.map((s) => s.title.key).sort()).toEqual(['d', 't2'])
    expect(home.slides.find((s) => s.title.key === 't2')!.art?.large).toBe('https://image.tmdb.org/t/p/w1280/t2.jpg')
  })

  it('keeps the launch pick when a refreshed catalog arrives', () => {
    const first = buildHome(data([title('d', { genre: 'Drama' })]))!
    const refreshed = buildHome(data([title('x', { genre: 'Drama' }), title('d', { genre: 'Drama' })]))!
    expect(refreshed.slides).toBe(first.slides)
    expect(refreshed.titles.map((t) => t.key)).toEqual(['x', 'd'])
  })

  it('features the first title when no bucket matches', () => {
    expect(buildHome(data([title('a'), title('b')]))!.slides.map((s) => s.title.key)).toEqual(['a'])
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

  it('keeps every title, for Seguir viendo', () => {
    const d = data([title('a'), title('b')])
    expect(buildHome(d)!.titles).toBe(d.titles)
  })
})
