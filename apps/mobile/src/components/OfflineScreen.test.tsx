import { render, screen, userEvent } from '@testing-library/react-native'
import { OfflineScreen } from './OfflineScreen'

describe('OfflineScreen', () => {
  it('says there is no connection and retries on Reintentar', async () => {
    const onRetry = jest.fn()
    await render(<OfflineScreen onRetry={onRetry} />)
    expect(screen.getByText('Sin conexión')).toBeTruthy()
    await userEvent.setup().press(screen.getByRole('button', { name: 'Reintentar' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
