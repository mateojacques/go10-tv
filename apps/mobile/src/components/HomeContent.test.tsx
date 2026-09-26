import { render, screen } from '@testing-library/react-native'
import { HomeContent } from './HomeContent'

describe('HomeContent', () => {
  it('shows a spinner while loading', async () => {
    await render(<HomeContent state={{ status: 'loading' }} onRetry={jest.fn()} imageBase="https://tv.test/" />)
    expect(screen.getByLabelText('Cargando catálogo')).toBeTruthy()
  })

  it('shows the offline screen on error', async () => {
    await render(<HomeContent state={{ status: 'error' }} onRetry={jest.fn()} imageBase="https://tv.test/" />)
    expect(screen.getByText('Sin conexión')).toBeTruthy()
  })

  it('shows the titles when ready', async () => {
    const data = { rows: [], collections: [], titles: [] }
    await render(<HomeContent state={{ status: 'ready', data }} onRetry={jest.fn()} imageBase="https://tv.test/" />)
    expect(screen.getByText('0 títulos')).toBeTruthy()
  })
})
