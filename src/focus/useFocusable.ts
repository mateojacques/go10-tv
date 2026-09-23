import { useCallback, useEffect, useRef } from 'react'
import { useFocusContext } from './FocusProvider'

/**
 * Register one element in the focus grid.
 *
 * `id` must be unique across the whole screen. A title can appear in several
 * rows, so callers scope the id by row (`${rowId}:${titleKey}`) rather than
 * using the title's own key.
 */
export function useFocusable(
  id: string,
  row: number,
  col: number,
  onEnter: () => void,
  options?: {
    /** See `FocusItem.onKey`. */
    onKey?: (key: string) => boolean
    /** See `FocusItem.claimsInitialFocus`. */
    claimsInitialFocus?: boolean
  },
) {
  const ref = useRef<HTMLDivElement>(null)
  const { focusedId, focus, register } = useFocusContext()

  // Kept in a ref so a changing handler identity never re-registers the item.
  const onEnterRef = useRef(onEnter)
  onEnterRef.current = onEnter
  const onKeyRef = useRef(options?.onKey)
  onKeyRef.current = options?.onKey
  const claimsInitialFocus = options?.claimsInitialFocus

  useEffect(
    () =>
      register({
        id,
        row,
        col,
        element: ref.current,
        onEnter: () => onEnterRef.current(),
        onKey: (key) => onKeyRef.current?.(key) ?? false,
        claimsInitialFocus,
      }),
    [id, row, col, register, claimsInitialFocus],
  )

  const focused = focusedId === id

  // Move real DOM focus to match our own focus model, not just the CSS
  // class. Samsung's Tizen TV browser watches document.activeElement to
  // decide whether the remote drives directional focus at all — with no
  // element ever truly focused, it falls back to an on-screen pointer that
  // has to be aimed and clicked, which is the bug this fixes.
  useEffect(() => {
    // Unless focus is already inside it — a search box's own input — which
    // this would otherwise steal it from.
    if (focused && !ref.current?.contains(document.activeElement)) {
      ref.current?.focus({ preventScroll: true })
    }
  }, [focused])

  // For click/tap: a remote first moves focus, then presses Enter, but a
  // pointer has no separate "move focus" step, so a single tap does both.
  const activate = useCallback(() => {
    focus(id)
    onEnterRef.current()
  }, [focus, id])

  return { ref, focused, activate, tabIndex: -1 as const }
}
