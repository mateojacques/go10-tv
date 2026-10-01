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
const data = (titles: Title[], collections: Collection[] = [], heroArt = {}) => ({ rows: [], titles, collections, heroArt, channels: null })

beforeEach(() => resetHeroPickForTests())

describe('buildHome', () => {
  it('picks hero slides across the genre buckets, only titles with art', () => {
    const titles = [title('d', { genre: 'Drama' }), title('t', { genre: 'Terror' }), title('t2', { genre: 'Terror' })]
    const home = buildHome(data(titles, [], { t2: { tmdb: 'movie/1', backdrop: '/t2.jpg' } }))!
    expect(home.slides.map((s) => s.title.key)).toEqual(['t2'])
    expect(home.slides.find((s) => s.title.key === 't2')!.art?.large).toBe('https://image.tmdb.org/t/p/w1280/t2.jpg')
  })

  it('keeps the launch pick when a refreshed catalog arrives', () => {
    const art = { d: { tmdb: 'movie/1', backdrop: '/d.jpg' }, x: { tmdb: 'movie/2', backdrop: '/x.jpg' } }
    const first = buildHome(data([title('d', { genre: 'Drama' })], [], art))!
    const refreshed = buildHome(data([title('x', { genre: 'Drama' }), title('d', { genre: 'Drama' })], [], art))!
    expect(refreshed.slides).toBe(first.slides)
    expect(refreshed.titles.map((t) => t.key)).toEqual(['x', 'd'])
  })

  it('has no hero slides when no title has art', () => {
    expect(buildHome(data([title('a', { genre: 'Drama' }), title('b')]))!.slides).toEqual([])
  })

  it('gets a hero once art arrives with a later refresh', () => {
    const titles = [title('d', { genre: 'Drama' })]
    expect(buildHome(data(titles))!.slides).toEqual([])
    expect(buildHome(data(titles, [], { d: { tmdb: 'movie/1', backdrop: '/d.jpg' } }))!.slides.map((s) => s.title.key)).toEqual(['d'])
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
