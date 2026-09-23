import { describe, it, expect } from 'vitest'
import { selectTitles } from './selectTitles'
import type { Title } from '../types'

function title(key: string, name: string, kind: Title['kind']): Title {
  return {
    key, kind, title: name, year: null, studio: '', genre: '', genre_secondary: '',
    quality: '', language: '', subtitled: false, thumbnail: '', views: 0,
    durationSeconds: 0, catalogIndex: 0, seasons: [],
  }
}

const TITLES = [
  title('toy', 'Toy Story', 'movie'),
  title('cast', 'Castlevania', 'show'),
  title('toy5', 'Toy Story 5', 'movie'),
  title('hora', 'Hora de Aventura', 'show'),
]
const keys = (r: { titles: Title[] }) => r.titles.map((t) => t.key)

describe('selectTitles', () => {
  it('browses a section in catalog order', () => {
    const result = selectTitles(TITLES, 'movie', '')
    expect(result.mode).toBe('browse')
    expect(keys(result)).toEqual(['toy', 'toy5'])
    expect(keys(selectTitles(TITLES, 'show', ''))).toEqual(['cast', 'hora'])
  })

  it('searches the whole catalog for section "all"', () => {
    const result = selectTitles(TITLES, 'all', 'castle')
    expect(result.mode).toBe('results')
    expect(keys(result)).toEqual(['cast'])
  })

  it('scopes a search to the section', () => {
    expect(keys(selectTitles(TITLES, 'show', 'toy'))).not.toContain('toy')
  })

  it('reports suggestions when nothing matches', () => {
    const result = selectTitles(TITLES, 'all', 'xqzvw')
    expect(result.mode).toBe('suggestions')
    expect(result.titles.length).toBeGreaterThan(0)
  })

  it('treats a whitespace- or punctuation-only query as a browse', () => {
    expect(selectTitles(TITLES, 'movie', '   ').mode).toBe('browse')
    expect(selectTitles(TITLES, 'movie', '!!!').mode).toBe('browse')
  })
})
