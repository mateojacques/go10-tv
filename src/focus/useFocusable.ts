import { useEffect, useRef } from 'react'
import { useFocusContext } from './FocusProvider'

/**
 * Register one element in the focus grid.
 *
 * `id` must be unique across the whole screen. A title can appear in several
 * rows, so callers scope the id by row (`${rowId}:${titleKey}`) rather than
 * using the title's own key.
 */
export function useFocusable(id: string, row: number, col: number, onEnter: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  const { focusedId, register } = useFocusContext()

  // Kept in a ref so a changing handler identity never re-registers the item.
  const onEnterRef = useRef(onEnter)
  onEnterRef.current = onEnter

  useEffect(
    () =>
      register({
        id,
        row,
        col,
        element: ref.current,
        onEnter: () => onEnterRef.current(),
      }),
    [id, row, col, register],
  )

  return { ref, focused: focusedId === id }
}
