import { describe, expect, it } from 'vitest'
import { mergeSearch } from './mergeSearch'
import type { Title } from '../types'
import type { TmdbSearchState } from './mergeSearch'

const t = (key: string) => ({ key, title: key }) as Title
const catalog = [t('c1'), t('c2')]
const tmdb = (status: TmdbSearchState['status'], titles: Title[] = []): TmdbSearchState => ({ status, titles })

describe('mergeSearch', () => {
  it('leaves browsing and switched-off searches alone', () => {
    expect(mergeSearch({ titles: catalog, mode: 'browse' }, tmdb('off'))).toEqual({ titles: catalog, mode: 'browse', external: false })
    expect(mergeSearch({ titles: catalog, mode: 'results' }, tmdb('off'))).toEqual({ titles: catalog, mode: 'results', external: false })
  })

  it('appends TMDB hits after catalog matches', () => {
    expect(mergeSearch({ titles: catalog, mode: 'results' }, tmdb('done', [t('x')]))).toEqual({
      titles: [...catalog, t('x')], mode: 'results', external: true,
    })
  })

  it('keeps catalog matches alone while TMDB is pending or failed', () => {
    expect(mergeSearch({ titles: catalog, mode: 'results' }, tmdb('pending')).titles).toEqual(catalog)
    expect(mergeSearch({ titles: catalog, mode: 'results' }, tmdb('failed')).titles).toEqual(catalog)
  })

  it('waits instead of flashing suggestions', () => {
    expect(mergeSearch({ titles: catalog, mode: 'suggestions' }, tmdb('pending'))).toEqual({ titles: [], mode: 'searching', external: false })
  })

  it('shows TMDB hits as results when the catalog had none', () => {
    expect(mergeSearch({ titles: catalog, mode: 'suggestions' }, tmdb('done', [t('x')]))).toEqual({ titles: [t('x')], mode: 'results', external: true })
  })

  it('falls back to suggestions when TMDB is empty or failed', () => {
    expect(mergeSearch({ titles: catalog, mode: 'suggestions' }, tmdb('done'))).toEqual({ titles: catalog, mode: 'suggestions', external: false })
    expect(mergeSearch({ titles: catalog, mode: 'suggestions' }, tmdb('failed'))).toEqual({ titles: catalog, mode: 'suggestions', external: false })
  })
})
