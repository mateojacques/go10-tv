import { act, renderHook } from '@testing-library/react-native'
import { installBridge } from './embedBridge'
import { INSTALL_TIMEOUT_MS, SET_TIMEOUT_MS, useEmbedBridge } from './useEmbedBridge'

jest.mock('./embedBridge', () => ({ installBridge: jest.fn() }))
const install = installBridge as jest.Mock
const inject = jest.fn()
const webRef = { current: { injectJavaScript: inject } }

beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
})
afterEach(() => jest.useRealTimers())

const mount = (enabled = true) =>
  renderHook((p: { token: number }) => useEmbedBridge({ enabled, webRef, viewTag: () => 5, reloadToken: p.token }), {
    initialProps: { token: 0 },
  })
const speed = { options: [{ value: '1', label: 'Normal' }, { value: '2', label: '2×' }], current: '1' }

it('is ready at once and off when disabled (phone)', async () => {
  const { result } = await mount(false)
  expect(result.current).toMatchObject({ ready: true, status: 'off' })
  expect(install).not.toHaveBeenCalled()
})

it('waits for the install before the page may load', async () => {
  let resolve!: (r: string) => void
  install.mockReturnValue(new Promise((r) => { resolve = r }))
  const { result } = await mount()
  expect(result.current).toMatchObject({ ready: false, status: 'pending' })
  await act(async () => resolve('installed'))
  expect(result.current).toMatchObject({ ready: true, status: 'installed' })
  expect(install).toHaveBeenCalledWith(5, expect.stringContaining('__go10Bridge'), expect.arrayContaining(['https://ok.ru']))
})

it('loads the video even when the bridge is unsupported', async () => {
  install.mockResolvedValueOnce('unsupported')
  const { result } = await mount()
  await act(async () => {})
  expect(result.current).toMatchObject({ ready: true, status: 'unsupported' })
})

it('loads the video even when the bridge never answers', async () => {
  install.mockReturnValueOnce(new Promise(() => {}))
  const { result } = await mount()
  await act(async () => { jest.advanceTimersByTime(INSTALL_TIMEOUT_MS) })
  expect(result.current).toMatchObject({ ready: true, status: 'timeout' })
})

it('installs again for a new WebView', async () => {
  install.mockResolvedValue('installed')
  const { rerender } = await mount()
  await act(async () => {})
  await rerender({ token: 1 })
  await act(async () => {})
  expect(install).toHaveBeenCalledTimes(2)
})

it('merges caps reports and sends a set to the reporting frame', async () => {
  install.mockResolvedValue('installed')
  const { result } = await mount()
  await act(async () => {})
  const quality = { options: [{ value: 'sd', label: '480p' }, { value: 'hd', label: '720p' }], current: 'hd' }
  await act(() => result.current.handle({ go10Bridge: 'caps', source: 'okru', frame: 'f1', caps: { quality } }))
  expect(result.current.caps.quality).toMatchObject({ current: 'hd', source: 'okru', frame: 'f1' })

  let done!: Promise<boolean>
  await act(() => { done = result.current.set('quality', 'sd') })
  expect(inject).toHaveBeenCalledWith(
    'window.go10Bridge({"go10Bridge":"set","id":1,"source":"okru","frame":"f1","setting":"quality","value":"sd"}); true;',
  )
  await act(() => result.current.handle({ go10Bridge: 'result', id: 1, ok: true }))
  await expect(done).resolves.toBe(true)
})

it('a set for an absent setting resolves false at once', async () => {
  install.mockResolvedValue('installed')
  const { result } = await mount()
  await act(async () => {})
  await expect(result.current.set('audio', 'x')).resolves.toBe(false)
  expect(inject).not.toHaveBeenCalled()
})

it('a set with no answer resolves false after 3 s', async () => {
  install.mockResolvedValue('installed')
  const { result } = await mount()
  await act(async () => {})
  await act(() => result.current.handle({ go10Bridge: 'caps', source: 'html5', frame: 'f', caps: { speed } }))
  let done!: Promise<boolean>
  await act(() => { done = result.current.set('speed', '2') })
  await act(async () => { jest.advanceTimersByTime(SET_TIMEOUT_MS) })
  await expect(done).resolves.toBe(false)
})

it('forgets the old page\'s settings when the WebView reloads', async () => {
  install.mockResolvedValue('installed')
  const { result, rerender } = await mount()
  await act(async () => {})
  await act(() => result.current.handle({ go10Bridge: 'caps', source: 'html5', frame: 'f', caps: { speed } }))
  await rerender({ token: 1 })
  await act(async () => {})
  expect(result.current.caps).toEqual({})
})

it('logs install status, caps and results for diagnostics', async () => {
  install.mockResolvedValue('installed')
  const { result } = await mount()
  await act(async () => {})
  expect(result.current.log.at(-1)?.text).toBe('instalación: installed')
  await act(() => result.current.handle({ go10Bridge: 'caps', source: 'html5', frame: 'f', caps: { speed } }))
  expect(result.current.log.at(-1)?.text).toBe('caps html5: speed')
})
