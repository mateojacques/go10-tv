import { describe, it, expect } from 'vitest'
import { normalize, scoreTitle, search, MATCH_MIN, FALLBACK_COUNT } from './search'

const CATALOG = [
  'Castlevania',
  'Hora de Aventura',
  'Hora de Aventura: Con Fionna y Cake',
  'Spidey y sus Sorprendentes Amigos',
  'Yu-Gi-Oh!',
  'Spider-Man: A través del Spider-Verso',
  'Spider-Man: un nuevo universo',
  'Toy Story',
  'Toy Story 5',
  'El rey león',
  'Una película de huevos',
  'Goofy: La Película',
].map((title) => ({ title }))

const titlesOf = (query: string) => search(query, CATALOG).matches.map((t) => t.title)

describe('normalize', () => {
  it('lowercases, strips accents and collapses punctuation', () => {
    expect(normalize('  El Rey León!! ')).toBe('el rey leon')
    expect(normalize('Yu-Gi-Oh!')).toBe('yu gi oh')
    expect(normalize('Película')).toBe('pelicula')
  })

  it('returns an empty string for punctuation-only input', () => {
    expect(normalize('!!! --- ')).toBe('')
  })
})

describe('scoreTitle', () => {
  it('ranks title prefix > word prefix > substring > fuzzy', () => {
    const prefix = scoreTitle('toy', 'Toy Story')
    const wordPrefix = scoreTitle('story', 'Toy Story')
    const substring = scoreTitle('tory', 'Toy Story')
    const fuzzy = scoreTitle('tyo stroy', 'Toy Story')
    expect(prefix).toBeGreaterThan(wordPrefix)
    expect(wordPrefix).toBeGreaterThan(substring)
    expect(substring).toBeGreaterThan(fuzzy)
    expect(fuzzy).toBeGreaterThanOrEqual(MATCH_MIN)
  })

  it('ignores accents and case', () => {
    expect(scoreTitle('LEON', 'El rey león')).toBeGreaterThanOrEqual(0.9)
  })

  it('matches across removed spaces and hyphens', () => {
    expect(scoreTitle('yugioh', 'Yu-Gi-Oh!')).toBeGreaterThanOrEqual(0.9)
    expect(scoreTitle('spiderman', 'Spider-Man: un nuevo universo')).toBeGreaterThanOrEqual(0.9)
  })

  it('returns 0 for an empty or punctuation-only query', () => {
    expect(scoreTitle('', 'Toy Story')).toBe(0)
    expect(scoreTitle('!!', 'Toy Story')).toBe(0)
  })

  it('does not fuzzy-match tokens shorter than 3 characters', () => {
    expect(scoreTitle('xy', 'Toy Story')).toBe(0)
  })
})

describe('search', () => {
  it('tolerates typos', () => {
    expect(titlesOf('spidy')[0]).toBe('Spidey y sus Sorprendentes Amigos')
    expect(titlesOf('castelvania')[0]).toBe('Castlevania')
  })

  it('matches a partially typed, misspelled word', () => {
    expect(titlesOf('castelv')).toContain('Castlevania')
  })

  it('puts exact prefix matches first, then keeps catalog order on ties', () => {
    expect(titlesOf('toy')).toEqual(['Toy Story', 'Toy Story 5'])
  })

  it('matches every word of a multi-word query in any title position', () => {
    expect(titlesOf('pelicula')).toEqual(['Una película de huevos', 'Goofy: La Película'])
  })

  it('falls back to the closest titles when nothing matches', () => {
    const result = search('xqzvw', CATALOG)
    expect(result.fallback).toBe(true)
    expect(result.matches).toHaveLength(FALLBACK_COUNT)
  })

  it('reports fallback false when there are matches', () => {
    expect(search('toy', CATALOG).fallback).toBe(false)
  })
})
