import { render, screen, userEvent } from '@testing-library/react-native'
import { Navbar } from './Navbar'

describe('Navbar', () => {
  it('opens the sections and search, marking the one on screen', async () => {
    const onSection = jest.fn()
    const onSearch = jest.fn()
    const onHome = jest.fn()
    await render(<Navbar section="movie" onHome={onHome} onSection={onSection} onSearch={onSearch} />)
    expect(screen.getByRole('button', { name: 'Películas' }).props.accessibilityState).toMatchObject({ selected: true })
    expect(screen.getByRole('button', { name: 'Series' }).props.accessibilityState).toMatchObject({ selected: false })
    const user = userEvent.setup()
    await user.press(screen.getByRole('button', { name: 'Series' }))
    await user.press(screen.getByRole('button', { name: 'Buscar' }))
    await user.press(screen.getByRole('button', { name: 'Ir al inicio' }))
    expect(onSection).toHaveBeenCalledWith('show')
    expect(onSearch).toHaveBeenCalledTimes(1)
    expect(onHome).toHaveBeenCalledTimes(1)
  })

  it('pressing the section already on screen does nothing', async () => {
    const onSection = jest.fn()
    await render(<Navbar section="movie" onSection={onSection} onSearch={jest.fn()} />)
    await userEvent.setup().press(screen.getByRole('button', { name: 'Películas' }))
    expect(onSection).not.toHaveBeenCalled()
  })

  it('on Home the wordmark is not a button', async () => {
    await render(<Navbar section="all" onSection={jest.fn()} onSearch={jest.fn()} />)
    expect(screen.queryByRole('button', { name: 'Ir al inicio' })).toBeNull()
    expect(screen.getByText('GO10 TV')).toBeTruthy()
  })
})
