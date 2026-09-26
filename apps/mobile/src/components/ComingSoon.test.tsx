import { render, screen } from '@testing-library/react-native'
import { ComingSoon } from './ComingSoon'

describe('ComingSoon', () => {
  it('names what was opened and what is coming', async () => {
    await render(<ComingSoon heading="Hora de Aventura" note="La ficha del título llega en la próxima versión." />)
    expect(screen.getByRole('header', { name: 'Hora de Aventura' })).toBeTruthy()
    expect(screen.getByText('La ficha del título llega en la próxima versión.')).toBeTruthy()
  })
})
