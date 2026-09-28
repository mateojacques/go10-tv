import { useCallback, useEffect, useState } from 'react'

export const SLIDE_MS = 8000

function reducedMotion(): boolean {
  // jsdom has no matchMedia.
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * The visible slide. Advances every SLIDE_MS unless paused, reduced motion is
 * on, or the tab is hidden; any change of slide restarts the wait.
 */
export function useCarousel(count: number, paused: boolean) {
  const [index, setIndex] = useState(0)
  const [reduced] = useState(reducedMotion)
  const [hidden, setHidden] = useState(() => document.hidden)

  useEffect(() => {
    const onChange = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])

  useEffect(() => {
    if (count < 2 || paused || reduced || hidden) return
    const timer = window.setTimeout(() => setIndex((i) => (i + 1) % count), SLIDE_MS)
    return () => window.clearTimeout(timer)
  }, [index, count, paused, reduced, hidden])

  const go = useCallback((to: number) => setIndex(((to % count) + count) % count), [count])
  return { index, go, reduced }
}
