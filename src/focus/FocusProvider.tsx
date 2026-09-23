import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export interface FocusItem {
  id: string
  row: number
  col: number
  element: HTMLElement | null
  onEnter: () => void
  /**
   * Offered every key first while this item is focused. Returning true claims
   * it, skipping the provider's own handling — how the search box keeps
   * Escape from backing out while it's being typed into.
   */
  onKey?: (key: string) => boolean
  /**
   * False keeps the item from taking focus just by registering. The navbar
   * uses it so a screen opens focused on its content, not on "Películas".
   */
  claimsInitialFocus?: boolean
}

interface FocusContextValue {
  focusedId: string | null
  focus: (id: string) => void
  register: (item: FocusItem) => () => void
  /**
   * Move focus as if an arrow key had been pressed. `alignStart` lands a
   * vertical move on the first item of the next row instead of the nearest
   * column — "go to the results", not "go straight down".
   */
  move: (key: ArrowKey, options?: { alignStart?: boolean }) => void
}

const FocusContext = createContext<FocusContextValue | null>(null)

export function useFocusContext(): FocusContextValue {
  const context = useContext(FocusContext)
  if (!context) throw new Error('useFocusable must be used inside <FocusProvider>')
  return context
}

export function useFocusState() {
  const { focusedId, focus, move } = useFocusContext()
  return { focusedId, focus, move }
}

export type ArrowKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'

/**
 * Resolve the neighbour of `current` in the direction of `key`.
 *
 * Horizontal movement stays within the row. Vertical movement crosses to the
 * nearest row and, within it, the nearest column — so moving down out of a long
 * row into a short one lands on the closest card rather than falling off.
 */
/** Keys a focused text field needs for itself: caret movement and deleting. */
const PASSTHROUGH_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Backspace'])

function isEditable(element: Element | null) {
  return (
    element instanceof HTMLElement &&
    (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.isContentEditable)
  )
}

function neighbour(items: FocusItem[], current: FocusItem, key: ArrowKey, alignStart = false) {
  const horizontal = key === 'ArrowLeft' || key === 'ArrowRight'
  const forward = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : -1

  const candidates = horizontal
    ? items.filter(
        (item) => item.row === current.row && Math.sign(item.col - current.col) === forward,
      )
    : items.filter((item) => Math.sign(item.row - current.row) === forward)

  if (candidates.length === 0) return null

  return candidates.sort((a, b) =>
    horizontal
      ? Math.abs(a.col - current.col) - Math.abs(b.col - current.col)
      : Math.abs(a.row - current.row) - Math.abs(b.row - current.row) ||
        (alignStart ? a.col - b.col : Math.abs(a.col - current.col) - Math.abs(b.col - current.col)),
  )[0]
}

export function FocusProvider({
  children,
  onBack,
  enabled = true,
}: {
  children: ReactNode
  onBack: () => void
  /**
   * When false the provider stops listening for keys, leaving the screen
   * mounted and its focus intact. Used while the player overlay is open, so
   * Escape closes the player instead of popping two levels at once.
   */
  enabled?: boolean
}) {
  const items = useRef(new Map<string, FocusItem>())
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const focusedRef = useRef(focusedId)
  focusedRef.current = focusedId

  const register = useCallback((item: FocusItem) => {
    items.current.set(item.id, item)
    // Claim focus if nothing holds it, or if whatever held it has gone away.
    if (item.claimsInitialFocus !== false) {
      setFocusedId((current) => (current && items.current.has(current) ? current : item.id))
    }

    return () => {
      items.current.delete(item.id)
      setFocusedId((current) => {
        if (current !== item.id) return current
        // The focused item unmounted: hand focus to whatever remains, so there
        // is never a moment with nothing focused and no way to steer.
        const remaining = [...items.current.values()]
        const next = remaining.find((i) => i.claimsInitialFocus !== false) ?? remaining[0]
        return next ? next.id : null
      })
    }
  }, [])

  const focus = useCallback((id: string) => {
    focusedRef.current = id
    setFocusedId(id)
  }, [])

  const move = useCallback((key: ArrowKey, options?: { alignStart?: boolean }) => {
    const all = [...items.current.values()]
    const current = focusedRef.current ? items.current.get(focusedRef.current) : undefined
    if (!current) {
      // Nothing focused, e.g. only passive navbar items are on screen: the
      // first key press picks something rather than moving from nowhere.
      if (all[0]) focus(all[0].id)
      return
    }

    const next = neighbour(all, current, key, options?.alignStart)
    if (!next) return

    focusedRef.current = next.id
    setFocusedId(next.id)
    // Not available in jsdom, and purely cosmetic either way.
    next.element?.scrollIntoView?.({
      block: 'nearest',
      inline: 'center',
      behavior: 'smooth',
    })
  }, [focus])

  useEffect(() => {
    if (!enabled) return

    function onKeyDown(event: KeyboardEvent) {
      const current = focusedId ? items.current.get(focusedId) : undefined
      if (current?.onKey?.(event.key)) {
        event.preventDefault()
        return
      }
      if (isEditable(document.activeElement) && PASSTHROUGH_KEYS.has(event.key)) return

      switch (event.key) {
        case 'ArrowUp':
        case 'ArrowDown':
        case 'ArrowLeft':
        case 'ArrowRight': {
          event.preventDefault()
          move(event.key)
          break
        }
        case 'Enter': {
          event.preventDefault()
          if (focusedId) items.current.get(focusedId)?.onEnter()
          break
        }
        case 'Escape':
        case 'Backspace': {
          event.preventDefault()
          onBack()
          break
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [focusedId, onBack, enabled, move])

  const value = useMemo(
    () => ({ focusedId, focus, register, move }),
    [focusedId, focus, register, move],
  )

  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>
}
