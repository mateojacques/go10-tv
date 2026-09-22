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
}

interface FocusContextValue {
  focusedId: string | null
  focus: (id: string) => void
  register: (item: FocusItem) => () => void
}

const FocusContext = createContext<FocusContextValue | null>(null)

export function useFocusContext(): FocusContextValue {
  const context = useContext(FocusContext)
  if (!context) throw new Error('useFocusable must be used inside <FocusProvider>')
  return context
}

export function useFocusState() {
  const { focusedId, focus } = useFocusContext()
  return { focusedId, focus }
}

type ArrowKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'

/**
 * Resolve the neighbour of `current` in the direction of `key`.
 *
 * Horizontal movement stays within the row. Vertical movement crosses to the
 * nearest row and, within it, the nearest column — so moving down out of a long
 * row into a short one lands on the closest card rather than falling off.
 */
function neighbour(items: FocusItem[], current: FocusItem, key: ArrowKey) {
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
        Math.abs(a.col - current.col) - Math.abs(b.col - current.col),
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

  const register = useCallback((item: FocusItem) => {
    items.current.set(item.id, item)
    // Claim focus if nothing holds it, or if whatever held it has gone away.
    setFocusedId((current) => (current && items.current.has(current) ? current : item.id))

    return () => {
      items.current.delete(item.id)
      setFocusedId((current) => {
        if (current !== item.id) return current
        // The focused item unmounted: hand focus to whatever remains, so there
        // is never a moment with nothing focused and no way to steer.
        const next = items.current.values().next()
        return next.done ? null : next.value.id
      })
    }
  }, [])

  const focus = useCallback((id: string) => setFocusedId(id), [])

  useEffect(() => {
    if (!enabled) return

    function onKeyDown(event: KeyboardEvent) {
      switch (event.key) {
        case 'ArrowUp':
        case 'ArrowDown':
        case 'ArrowLeft':
        case 'ArrowRight': {
          event.preventDefault()
          const all = [...items.current.values()]
          const current = (focusedId && items.current.get(focusedId)) || all[0]
          if (!current) return

          const next = neighbour(all, current, event.key)
          if (!next) return

          setFocusedId(next.id)
          // Not available in jsdom, and purely cosmetic either way.
          next.element?.scrollIntoView?.({
            block: 'nearest',
            inline: 'center',
            behavior: 'smooth',
          })
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
  }, [focusedId, onBack, enabled])

  const value = useMemo(
    () => ({ focusedId, focus, register }),
    [focusedId, focus, register],
  )

  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>
}
