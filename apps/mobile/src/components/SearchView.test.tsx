import { act, render, screen, userEvent } from '@testing-library/react-native'
import { useState } from 'react'
import type { Section } from '@go10/core/catalog/selectTitles'
import type { Title } from '@go10/core/types'
import { SearchView } from './SearchView'

const t = (key: string, title: string, kind: Title['kind'] = 'movie'): Title => ({
  key, kind, title, year: 2001, studio: '', source: '', genre: '', genre_secondary: '', quality: '', language: '',
  subtitled: false, thumbnail: '', views: 0, durationSeconds: 0, catalogIndex: 0, seasons: [],
})
const titles = [t('a', 'Coraje'), t('b', 'Dragon Ball', 'show'), t('c', 'Digimon', 'show')]

function Harness({ initialSection = 'all' as Section, onSelect = jest.fn(), onBack = jest.fn() }) {
  const [query, setQuery] = useState('')
  const [section, setSection] = useState<Section>(initialSection)
  return (
    <SearchView titles={titles} section={section} query={query} imageBase="https://tv.test/"
      onQueryChange={setQuery} onSectionChange={setSection} onSelect={onSelect} onBack={onBack} />
  )
}

beforeEach(() => jest.useFakeTimers({ doNotFake: ['setImmediate', 'queueMicrotask', 'nextTick'] }))
afterEach(() => jest.useRealTimers())

describe('SearchView', () => {
  it('results follow the typed query after a pause', async () => {
    await render(<Harness />)
    const input = screen.getByPlaceholderText('Buscar')
    expect(input.props.autoFocus).toBe(true)
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    await user.type(input, 'dragon')
    expect(input.props.value).toBe('dragon')
    await act(() => { jest.advanceTimersByTime(300) })
    expect(screen.getByRole('header', { name: /Resultados para "dragon"/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Dragon Ball' })).toBeTruthy()
  })

  it('scopes the search to a section from its chips', async () => {
    await render(<Harness initialSection="movie" />)
    expect(screen.getByPlaceholderText('Buscar en Películas')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Películas' }).props.accessibilityState).toMatchObject({ selected: true })
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    await user.press(screen.getByRole('button', { name: 'Series' }))
    expect(screen.getByPlaceholderText('Buscar en Series')).toBeTruthy()
    expect(screen.getByRole('header', { name: /Series/ })).toBeTruthy()
  })

  it('clears the query from its button', async () => {
    await render(<Harness />)
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    expect(screen.queryByRole('button', { name: 'Borrar búsqueda' })).toBeNull()
    await user.type(screen.getByPlaceholderText('Buscar'), 'digi')
    await user.press(screen.getByRole('button', { name: 'Borrar búsqueda' }))
    expect(screen.getByPlaceholderText('Buscar').props.value).toBe('')
  })

  it('opens a result, and has a touch back button', async () => {
    const onSelect = jest.fn()
    const onBack = jest.fn()
    await render(<Harness onSelect={onSelect} onBack={onBack} />)
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    await user.press(screen.getByRole('button', { name: 'Coraje' }))
    await user.press(screen.getByRole('button', { name: 'Volver' }))
    expect(onSelect).toHaveBeenCalledWith(titles[0])
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
