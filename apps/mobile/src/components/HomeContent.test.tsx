import { render, screen } from '@testing-library/react-native'
import type { Title } from '@go10/core/types'
import { HomeContent } from './HomeContent'

const props = { progress: {}, onRetry: jest.fn(), imageBase: 'https://tv.test/', onSelectTitle: jest.fn(), onPlayTitle: jest.fn(), onSelectCollection: jest.fn(), onOpenSection: jest.fn(), onSearch: jest.fn() }
const title: Title = {
  key: 'a', kind: 'movie', title: 'Coraje', year: 2001, studio: '', source: '', genre: '', genre_secondary: '',
  quality: '', language: '', subtitled: false, thumbnail: '', views: 0, durationSeconds: 0, catalogIndex: 0, seasons: [],
}

describe('HomeContent', () => {
  it('shows a spinner while loading', async () => {
    await render(<HomeContent state={{ status: 'loading' }} {...props} />)
    expect(screen.getByLabelText('Cargando catálogo')).toBeTruthy()
  })

  it('shows the offline screen on error', async () => {
    await render(<HomeContent state={{ status: 'error' }} {...props} />)
    expect(screen.getByText('Sin conexión')).toBeTruthy()
  })

  it('shows Home when ready', async () => {
    await render(<HomeContent state={{ status: 'ready', data: { rows: [], collections: [], titles: [title] } }} {...props} />)
    expect(screen.getByRole('header', { name: 'Coraje' })).toBeTruthy()
  })

  it('says the catalog is empty instead of showing a blank Home', async () => {
    await render(<HomeContent state={{ status: 'ready', data: { rows: [], collections: [], titles: [] } }} {...props} />)
    expect(screen.getByText('El catálogo está vacío.')).toBeTruthy()
  })
})
