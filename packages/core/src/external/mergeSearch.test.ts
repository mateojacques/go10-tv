import { describe, expect, it } from 'vitest'
import { mergeSearch } from './mergeSearch'
import type { Title } from '../types'
import type { TmdbSearchState } from './mergeSearch'

const t = (key: string) => ({ key, title: key }) as Title
const catalog = [t('c1'), t('c2')]
const tmdb = (status: TmdbSearchState['status'], titles: Title[] = []): TmdbSearchState => ({ status, titles })

describe('mergeSearch', () => {
  it('leaves browsing and switched-off searches alone', () => {
    expect(mergeSearch({ titles: catalog, mode: 'browse' }, tmdb('off'), 'c')).toEqual({ titles: catalog, mode: 'browse', external: false })
    expect(mergeSearch({ titles: catalog, mode: 'results' }, tmdb('off'), 'c')).toEqual({ titles: catalog, mode: 'results', external: false })
  })

  it('adds TMDB hits after equally good catalog matches', () => {
    expect(mergeSearch({ titles: catalog, mode: 'results' }, tmdb('done', [t('x')]), 'c')).toEqual({
      titles: [...catalog, t('x')], mode: 'results', external: true,
    })
  })

  it('ranks a TMDB hit that matches the query better above catalog matches', () => {
    const loose = [t('La leyenda del dragón'), t('Odiseo y la sirena')]
    const shown = mergeSearch({ titles: loose, mode: 'results' }, tmdb('done', [t('Otra cosa'), t('La odisea')]), 'La odisea')
    expect(shown.titles.map((x) => x.title)).toEqual(['La odisea', 'Odiseo y la sirena', 'La leyenda del dragón', 'Otra cosa'])
  })

  it('keeps catalog matches alone while TMDB is pending or failed', () => {
    expect(mergeSearch({ titles: catalog, mode: 'results' }, tmdb('pending'), 'c').titles).toEqual(catalog)
    expect(mergeSearch({ titles: catalog, mode: 'results' }, tmdb('failed'), 'c').titles).toEqual(catalog)
  })

  it('waits instead of flashing suggestions', () => {
    expect(mergeSearch({ titles: catalog, mode: 'suggestions' }, tmdb('pending'), 'c')).toEqual({ titles: [], mode: 'searching', external: false })
  })

  it('shows TMDB hits as results when the catalog had none', () => {
    expect(mergeSearch({ titles: catalog, mode: 'suggestions' }, tmdb('done', [t('x')]), 'c')).toEqual({ titles: [t('x')], mode: 'results', external: true })
  })

  it('falls back to suggestions when TMDB is empty or failed', () => {
    expect(mergeSearch({ titles: catalog, mode: 'suggestions' }, tmdb('done'), 'c')).toEqual({ titles: catalog, mode: 'suggestions', external: false })
    expect(mergeSearch({ titles: catalog, mode: 'suggestions' }, tmdb('failed'), 'c')).toEqual({ titles: catalog, mode: 'suggestions', external: false })
  })
})
