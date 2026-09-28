import { act, renderHook } from '@testing-library/react-native'
import type { LayoutChangeEvent } from 'react-native'
import { useListFill } from './listFill'

const layout = (height: number) => ({ nativeEvent: { layout: { x: 0, y: 0, width: 960, height } } }) as LayoutChangeEvent

describe('useListFill', () => {
  it('flexes on a phone', async () => {
    const { result } = await renderHook(() => useListFill(false))
    expect(result.current.style).toEqual({ flex: 1 })
  })

  it("takes the parent's measured height on TV, where flex would collapse the list", async () => {
    const { result } = await renderHook(() => useListFill(true))
    expect(result.current.style).toEqual({ height: 0 })
    await act(() => result.current.onLayout(layout(540)))
    expect(result.current.style).toEqual({ height: 540 })
  })
})
