import { useCallback, useEffect, useRef } from 'react'
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
  const { focusedId, focus, register } = useFocusContext()

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

  // For click/tap: a remote first moves focus, then presses Enter, but a
  // pointer has no separate "move focus" step, so a single tap does both.
  const activate = useCallback(() => {
    focus(id)
    onEnterRef.current()
  }, [focus, id])

  return { ref, focused: focusedId === id, activate }
}
