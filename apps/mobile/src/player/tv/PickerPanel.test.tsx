import { fireEvent, render, screen } from '@testing-library/react-native'
import { PickerPanel } from './PickerPanel'

const choice = { options: [{ value: 'sd', label: '480p' }, { value: 'hd', label: '720p' }], current: 'hd', source: 'okru', frame: 'f' }

it('lists the options with the current one checked and focused first', async () => {
  await render(<PickerPanel setting="quality" choice={choice} onPick={jest.fn()} />)
  expect(screen.getByText('Calidad')).toBeTruthy()
  expect(screen.getByLabelText('720p').props.accessibilityState).toMatchObject({ selected: true })
  expect(screen.getByLabelText('480p').props.accessibilityState).toMatchObject({ selected: false })
})

it('focuses the first option when none is current', async () => {
  await render(<PickerPanel setting="quality" choice={{ ...choice, current: null }} onPick={jest.fn()} />)
  expect(screen.getByLabelText('480p')).toBeTruthy()
})

it('picks an option', async () => {
  const onPick = jest.fn()
  await render(<PickerPanel setting="quality" choice={choice} onPick={onPick} />)
  await fireEvent.press(screen.getByLabelText('480p'))
  expect(onPick).toHaveBeenCalledWith('sd')
})
