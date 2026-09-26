import { act, renderHook } from '@testing-library/react-native'
import { useDebounced } from './useDebounced'

// RNTL 14's async render and act settle through setImmediate/queueMicrotask; freezing them hangs.
beforeEach(() => jest.useFakeTimers({ doNotFake: ['setImmediate', 'queueMicrotask', 'nextTick'] }))
afterEach(() => jest.useRealTimers())

describe('useDebounced', () => {
  it('follows the value only once it stops changing', async () => {
    const { result, rerender } = await renderHook(({ value }: { value: string }) => useDebounced(value, 250), { initialProps: { value: 'a' } })
    expect(result.current).toBe('a')
    await rerender({ value: 'ab' })
    await act(() => { jest.advanceTimersByTime(200) })
    await rerender({ value: 'abc' })
    await act(() => { jest.advanceTimersByTime(200) })
    expect(result.current).toBe('a')
    await act(() => { jest.advanceTimersByTime(60) })
    expect(result.current).toBe('abc')
  })
})
