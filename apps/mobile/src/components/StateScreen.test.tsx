import { render, screen, userEvent } from '@testing-library/react-native'
import { StateScreen } from './StateScreen'

describe('StateScreen', () => {
  it('shows a loading message with a spinner', async () => {
    await render(<StateScreen message="Cargando título…" />)
    expect(screen.getByText('GO10 TV')).toBeTruthy()
    expect(screen.getByText('Cargando título…')).toBeTruthy()
    expect(screen.getByLabelText('Cargando')).toBeTruthy()
  })

  it('offers a way back from an error, focused first on TV', async () => {
    const onBack = jest.fn()
    await render(<StateScreen message="No se pudo cargar el título." onBack={onBack} />)
    const back = screen.getByRole('button', { name: 'Volver' })
    expect(back.props.hasTVPreferredFocus).toBe(true)
    await userEvent.setup().press(back)
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(screen.queryByLabelText('Cargando')).toBeNull()
  })
})
