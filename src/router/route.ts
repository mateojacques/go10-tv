export type Route =
  | { name: 'home' }
  | { name: 'title'; key: string }
  | { name: 'play'; key: string; videoId: string }

export function parseRoute(pathname: string): Route {
  const segments = pathname.split('/').filter(Boolean).map(decodeURIComponent)

  if (segments.length === 0) return { name: 'home' }

  if (segments[0] === 'title' && segments.length === 2) {
    return { name: 'title', key: segments[1] }
  }

  if (segments[0] === 'title' && segments.length === 4 && segments[2] === 'play') {
    return { name: 'play', key: segments[1], videoId: segments[3] }
  }

  return { name: 'home' }
}

export function routeToPath(route: Route): string {
  switch (route.name) {
    case 'home':
      return '/'
    case 'title':
      return `/title/${encodeURIComponent(route.key)}`
    case 'play':
      return `/title/${encodeURIComponent(route.key)}/play/${encodeURIComponent(route.videoId)}`
  }
}
