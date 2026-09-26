import { useEffect, useState } from 'react'

/** Search re-ranks the whole catalog; typing waits this long for a pause before it does. */
export const SEARCH_DEBOUNCE_MS = 250

/** `value`, once it has held still for `ms`. */
export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return settled
}
