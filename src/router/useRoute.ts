import { useCallback, useEffect, useState } from 'react'
import { parseRoute, routeToPath, type Route } from './route'

export function useRoute(): {
  route: Route
  navigate: (route: Route, options?: { replace?: boolean }) => void
} {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname))

  useEffect(() => {
    function onPopState() {
      setRoute(parseRoute(window.location.pathname))
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = useCallback((next: Route, options?: { replace?: boolean }) => {
    const path = routeToPath(next)
    if (options?.replace) {
      window.history.replaceState({}, '', path)
    } else {
      window.history.pushState({}, '', path)
    }
    setRoute(next)
  }, [])

  return { route, navigate }
}
