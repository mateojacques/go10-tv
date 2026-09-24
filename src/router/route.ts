import type { Section } from '../catalog/selectTitles'

export type { Section }

export type Route =
  | { name: 'home' }
  | { name: 'title'; key: string }
  | { name: 'play'; key: string; videoId: string }
  | { name: 'catalog'; section: Section; query: string }
  | { name: 'collection'; id: string }

const SECTION_SLUGS: Record<Exclude<Section, 'all'>, string> = { movie: 'peliculas', show: 'series' }

function sectionFromSlug(slug: string | null): Section {
  if (slug === SECTION_SLUGS.movie) return 'movie'
  if (slug === SECTION_SLUGS.show) return 'show'
  return 'all'
}

/** Where a section lives with no query: its browse page, or Home for "all". */
export function browseRoute(section: Section): Route {
  return section === 'all' ? { name: 'home' } : { name: 'catalog', section, query: '' }
}

export function parseRoute(pathname: string, search = ''): Route {
  const segments = pathname.split('/').filter(Boolean).map(decodeURIComponent)

  if (segments.length === 0) return { name: 'home' }

  if (segments[0] === 'title' && segments.length === 2) {
    return { name: 'title', key: segments[1] }
  }

  if (segments[0] === 'title' && segments.length === 4 && segments[2] === 'play') {
    return { name: 'play', key: segments[1], videoId: segments[3] }
  }

  if (segments[0] === 'coleccion' && segments.length === 2) {
    return { name: 'collection', id: segments[1] }
  }

  if (segments.length === 1 && segments[0] === SECTION_SLUGS.movie) return browseRoute('movie')
  if (segments.length === 1 && segments[0] === SECTION_SLUGS.show) return browseRoute('show')

  if (segments.length === 1 && segments[0] === 'buscar') {
    const params = new URLSearchParams(search)
    const section = sectionFromSlug(params.get('en'))
    const query = params.get('q') ?? ''
    // A blank search is just the section it was scoped to.
    return query.trim() === '' ? browseRoute(section) : { name: 'catalog', section, query }
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
    case 'collection':
      return `/coleccion/${encodeURIComponent(route.id)}`
    case 'catalog': {
      if (route.query.trim() === '') {
        return route.section === 'all' ? '/' : `/${SECTION_SLUGS[route.section]}`
      }
      const params = new URLSearchParams({ q: route.query })
      if (route.section !== 'all') params.set('en', SECTION_SLUGS[route.section])
      return `/buscar?${params}`
    }
  }
}
