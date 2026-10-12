import { fireEvent, render, screen } from '@testing-library/react-native'
import { initialTvControls } from '@go10/core/player/tvControls'
import { TvPlayerOverlay } from './TvPlayerOverlay'

const props = (over = {}) => ({
  title: 'Saint Seiya', position: 'T1 · E2', controls: { ...initialTvControls, mode: 'open' as const },
  timeline: { time: 650, start: 600, end: 1200 }, playing: true, canToggle: true, hasPrev: true, hasNext: false,
  caps: {}, toast: null, dispatch: jest.fn(), onTogglePlay: jest.fn(), onPrev: jest.fn(), onNext: jest.fn(), onSetting: jest.fn(),
  ...over,
})
const quality = { options: [{ value: 'sd', label: '480p' }, { value: 'hd', label: '720p' }], current: 'hd', source: 'okru', frame: 'f' }

it('renders nothing while hidden without a toast', async () => {
  await render(<TvPlayerOverlay {...props({ controls: initialTvControls })} />)
  expect(screen.toJSON()).toBeNull()
})

it('shows the seek toast while hidden', async () => {
  await render(<TvPlayerOverlay {...props({ controls: initialTvControls, toast: { target: 660, at: 0 } })} />)
  expect(screen.getByText('1:00 / 10:00')).toBeTruthy() // chapter-relative: 660-600 of 1200-600
})

it('shows title, chapter-relative clock and only the buttons that apply', async () => {
  await render(<TvPlayerOverlay {...props({ caps: { quality } })} />)
  expect(screen.getByText('Saint Seiya')).toBeTruthy()
  expect(screen.getByText('0:50 / 10:00')).toBeTruthy()
  expect(screen.getByLabelText('Pausar')).toBeTruthy()
  expect(screen.getByLabelText('Episodio anterior')).toBeTruthy()
  expect(screen.queryByLabelText('Episodio siguiente')).toBeNull()
  expect(screen.getByLabelText('Calidad: 720p')).toBeTruthy()
  expect(screen.queryByLabelText(/^Subtítulos/)).toBeNull()
  expect(screen.getByLabelText('Modo puntero')).toBeTruthy()
})

it('shows the scrub marker time while scrubbing', async () => {
  await render(<TvPlayerOverlay {...props({ controls: { ...initialTvControls, mode: 'scrubbing', scrub: { target: 900, start: 600, end: 1200 } } })} />)
  expect(screen.getByText('5:00 / 10:00')).toBeTruthy()
})

it('reports scrub focus, press and blur, and opens settings and pointer', async () => {
  const p = props({ caps: { quality } })
  await render(<TvPlayerOverlay {...p} />)
  await fireEvent(screen.getByLabelText('Línea de tiempo'), 'focus')
  expect(p.dispatch).toHaveBeenCalledWith({ type: 'scrubFocus', timeline: p.timeline })
  await fireEvent.press(screen.getByLabelText('Línea de tiempo'))
  expect(p.dispatch).toHaveBeenCalledWith({ type: 'scrubPress', timeline: p.timeline })
  await fireEvent(screen.getByLabelText('Línea de tiempo'), 'blur')
  expect(p.dispatch).toHaveBeenCalledWith({ type: 'scrubBlur' })
  await fireEvent.press(screen.getByLabelText('Calidad: 720p'))
  expect(p.onSetting).toHaveBeenCalledWith('quality')
  await fireEvent.press(screen.getByLabelText('Modo puntero'))
  expect(p.dispatch).toHaveBeenCalledWith({ type: 'pointer' })
})

it('shows "—" for the total while the duration is unknown', async () => {
  await render(<TvPlayerOverlay {...props({ timeline: { time: 30, start: 0, end: null } })} />)
  expect(screen.getByText('0:30 / —')).toBeTruthy()
})

it('hides while pointing or showing diagnostics', async () => {
  await render(<TvPlayerOverlay {...props({ controls: { ...initialTvControls, mode: 'pointer' } })} />)
  expect(screen.toJSON()).toBeNull()
})
