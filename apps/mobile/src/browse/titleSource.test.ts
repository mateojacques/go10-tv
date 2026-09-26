import type { Title } from '@go10/core/types'
import type { CatalogState } from '../data/catalogStore'
import { titleSource } from './titleSource'

const catalogTitle = { key: 'coraje' } as Title
const tmdbTitle = { key: 'tmdb-movie-155', external: true } as Title
const ready: CatalogState = { status: 'ready', data: { rows: [], collections: [], titles: [catalogTitle] } }

describe('titleSource', () => {
  it('waits for the catalog, and has nothing without one', () => {
    expect(titleSource({ status: 'loading' }, 'coraje', { status: 'idle' }, true)).toEqual({ status: 'loading' })
    expect(titleSource({ status: 'error' }, 'coraje', { status: 'idle' }, true)).toEqual({ status: 'missing' })
  })

  it('resolves catalog keys from the catalog alone', () => {
    expect(titleSource(ready, 'coraje', { status: 'idle' }, true)).toEqual({ status: 'ready', titles: [catalogTitle] })
  })

  it('adds a loaded TMDB title to what routes can resolve', () => {
    expect(titleSource(ready, 'tmdb-movie-155', { status: 'ready', title: tmdbTitle }, true))
      .toEqual({ status: 'ready', titles: [catalogTitle, tmdbTitle] })
  })

  it('reports TMDB loading, failing and not knowing the title', () => {
    expect(titleSource(ready, 'tmdb-movie-155', { status: 'loading' }, true)).toEqual({ status: 'loading' })
    expect(titleSource(ready, 'tmdb-movie-155', { status: 'error' }, true)).toEqual({ status: 'error' })
    expect(titleSource(ready, 'tmdb-movie-155', { status: 'not-found' }, true)).toEqual({ status: 'missing' })
  })

  it('treats a TMDB key as unknown while external titles are off', () => {
    expect(titleSource(ready, 'tmdb-movie-155', { status: 'idle' }, false)).toEqual({ status: 'ready', titles: [catalogTitle] })
  })
})
