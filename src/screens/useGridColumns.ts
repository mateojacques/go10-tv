import { useEffect, useState, type RefObject } from 'react'

/**
 * How many columns a CSS `auto-fill` grid is currently laying out, so the
 * focus grid can mirror it: the browser resolves `grid-template-columns` to
 * one track size per column. Falls back where layout can't be measured (jsdom).
 */
export function useGridColumns(ref: RefObject<HTMLElement | null>, fallback = 5): number {
  const [columns, setColumns] = useState(fallback)

  useEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === 'undefined') return

    const measure = () => {
      const tracks = getComputedStyle(element).gridTemplateColumns
      const count = tracks && tracks !== 'none' ? tracks.trim().split(/\s+/).length : 0
      setColumns(count > 0 ? count : fallback)
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, fallback])

  return columns
}
