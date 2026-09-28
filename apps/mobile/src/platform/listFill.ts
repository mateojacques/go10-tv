import { useState } from 'react'
import { Platform, type LayoutChangeEvent, type ViewStyle } from 'react-native'

/**
 * A vertical FlatList that fills its parent. On TV, react-native-tvos wraps
 * the list's scroll view in an unstyled TVFocusGuideView, so `flex: 1` on the
 * list collapses it to ~1px (a black screen under the navbar). There the list
 * takes the parent's measured height instead; the parent must fill the space
 * (`flex: 1`) and take `onLayout`.
 */
export function useListFill(tv: boolean = Platform.isTV): { onLayout: (event: LayoutChangeEvent) => void; style: ViewStyle } {
  const [height, setHeight] = useState(0)
  return {
    onLayout: (event) => setHeight(event.nativeEvent.layout.height),
    style: tv ? { height } : { flex: 1 },
  }
}
